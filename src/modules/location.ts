import * as THREE from 'three';
import { Geolocation } from '@capacitor/geolocation';
import { state } from './state';
import { haversineDistance, lngLatToWorld } from './geo';
import { getAltitudeAt } from './analysis';

let watchId: string | null = null;
let _originTileUnsub: (() => void) | null = null;
let _orientationHandler: ((event: DeviceOrientationEvent) => void) | null =
    null;
type UserFollowViewport = 'center' | 'guidanceCompact' | 'guidanceExpanded';
let userFollowViewport: UserFollowViewport = 'center';
let headingCorrectionActive = false;
let followCameraNeedsInitialization = true;
let followHeadingMovementActive = false;
let lastMotionSample: {
    lat: number;
    lon: number;
    timestamp: number;
} | null = null;

// Même échelle que cameraManager.getTargetDistanceForZoom(17) : le suivi
// privilégie la lecture fine de la trace, sans descendre au niveau 18.
const FOLLOW_CAMERA_DISTANCE = 1500;
const FOLLOW_MOVEMENT_START_MPS = 0.55;
const FOLLOW_MOVEMENT_STOP_MPS = 0.25;

/**
 * Démarre une nouvelle session de suivi caméra. L'initialisation du zoom et de
 * l'inclinaison ne doit être jouée qu'une fois, et surtout pas à chaque fix GPS.
 */
export function beginUserFollow(): void {
    followCameraNeedsInitialization = true;
    headingCorrectionActive = false;
    followHeadingMovementActive = false;
}

function updateUserSpeed(
    lat: number,
    lon: number,
    timestamp: number,
    reportedSpeed: number | null,
    accuracy: number | null
): void {
    let speed =
        reportedSpeed !== null && Number.isFinite(reportedSpeed)
            ? Math.max(0, reportedSpeed)
            : null;

    if (speed === null && lastMotionSample) {
        const elapsedSeconds = Math.max(
            0.5,
            (timestamp - lastMotionSample.timestamp) / 1000
        );
        const distanceMeters =
            haversineDistance(
                lastMotionSample.lat,
                lastMotionSample.lon,
                lat,
                lon
            ) * 1000;
        // Retirer une partie de l'incertitude GPS avant de déduire une vitesse.
        // Un point qui flotte dans son cercle de précision ne doit pas être
        // considéré comme une marche réelle.
        const noiseFloor = Math.max(3, Math.min(accuracy ?? 10, 30) * 0.5);
        speed = Math.max(0, distanceMeters - noiseFloor) / elapsedSeconds;
    }

    state.userSpeedMps = speed ?? 0;
    lastMotionSample = { lat, lon, timestamp };
}

/**
 * Réserve le bas de la carte pour le panneau de suivi sans changer le GPS ni
 * les contrôles manuels. Le point suivi reste dans la zone lisible au-dessus.
 */
export function setUserFollowViewport(
    viewport: UserFollowViewport = 'center'
): void {
    userFollowViewport = viewport;
    if (viewport === 'center') headingCorrectionActive = false;
}

function getFollowTargetForViewport(
    target: THREE.Vector3,
    orbitOffset: THREE.Vector3
): THREE.Vector3 {
    if (userFollowViewport === 'center' || !state.camera || !state.controls)
        return target;

    // L'axe horizontal de l'orbite reste stable d'une frame à l'autre. Il ne
    // dépend pas de la cible corrigée et évite donc la boucle d'oscillation que
    // produisait l'axe écran recalculé après chaque mouvement de caméra.
    const towardCamera = orbitOffset.clone();
    towardCamera.y = 0;
    if (towardCamera.lengthSq() < 0.0001) {
        // Vue presque verticale : utiliser le bas de l'écran projeté au sol.
        // Cet axe reste lié à l'orientation de la caméra et garde le point GPS
        // dans la partie haute, même quand l'orbite horizontale est quasi nulle.
        towardCamera.set(0, -1, 0).applyQuaternion(state.camera.quaternion);
        towardCamera.y = 0;
    }
    if (towardCamera.lengthSq() < 0.0001) return target;

    const expanded = userFollowViewport === 'guidanceExpanded';
    // Au LOD 17, l'ancien ratio étendu pouvait déplacer le point suivi de plus
    // d'un kilomètre : l'utilisateur voyait alors un secteur au sud plutôt que
    // sa position. Ces bornes gardent le point au-dessus du panneau sans
    // sortir du contexte immédiat de la trace.
    const ratio = expanded ? 0.22 : 0.08;
    const offset = THREE.MathUtils.clamp(
        orbitOffset.length() * ratio,
        expanded ? 160 : 55,
        expanded ? 360 : 125
    );
    return target.clone().addScaledVector(towardCamera.normalize(), offset);
}

/**
 * DÉTECTION ORIENTATION MOBILE (v5.5.14)
 * Implémentation d'un filtre passe-bas pour la stabilité Swisstopo.
 */
function initOrientationTracking() {
    // Avoid adding multiple listeners if called more than once
    if (_orientationHandler !== null) return;

    _orientationHandler = (event: DeviceOrientationEvent) => {
        let rawHeading = event.webkitCompassHeading || event.alpha;
        if (event.absolute && event.alpha !== null)
            rawHeading = 360 - event.alpha;

        if (rawHeading !== undefined && rawHeading !== null) {
            // --- FILTRAGE PASSE-BAS (Lissage Swisstopo) ---
            if (state.userHeading === null) {
                state.userHeading = rawHeading;
            } else {
                let diff = rawHeading - state.userHeading;
                // Correction du passage 0/360°
                if (diff > 180) diff -= 360;
                if (diff < -180) diff += 360;

                // On applique un lissage de 10% (très stable)
                state.userHeading += diff * 0.1;

                // Normalisation 0-360
                if (state.userHeading < 0) state.userHeading += 360;
                if (state.userHeading >= 360) state.userHeading -= 360;
            }
            updateUserMarker();
        }
    };

    if (
        typeof (DeviceOrientationEvent as any).requestPermission === 'function'
    ) {
        (DeviceOrientationEvent as any)
            .requestPermission()
            .then((res: string) => {
                if (res === 'granted' && _orientationHandler) {
                    window.addEventListener(
                        'deviceorientationabsolute',
                        _orientationHandler as any
                    );
                }
            });
    } else {
        window.addEventListener(
            'deviceorientationabsolute',
            _orientationHandler as any
        );
    }
}

export async function startLocationTracking() {
    if (watchId !== null) return;
    initOrientationTracking();

    if (!_originTileUnsub) {
        _originTileUnsub = state.subscribe('originTile', () =>
            updateUserMarker()
        );
    }

    try {
        watchId = await Geolocation.watchPosition(
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 3000,
            },
            (position, err) => {
                if (err || !position) return;

                const { latitude, longitude, altitude, accuracy, speed } =
                    position.coords;

                // Met à jour la précision GPS pour l'affichage dans le panneau Système
                state.userLocationAccuracy = accuracy || null;
                state.lastTrackingUpdate = position.timestamp || Date.now();
                updateUserSpeed(
                    latitude,
                    longitude,
                    state.lastTrackingUpdate,
                    typeof speed === 'number' ? speed : null,
                    accuracy ?? null
                );

                // Mise à jour de la position utilisateur pour l'UI
                // Note: L'enregistrement des points est géré EXCLUSIVEMENT par nativeGPSService.ts (natif Android)
                // Le watchPosition JS ne fait plus d'enregistrement - il met à jour uniquement l'UI
                state.userLocation = {
                    lat: latitude,
                    lon: longitude,
                    alt: altitude || 0,
                };
                updateUserMarker();
            }
        );
    } catch (e) {
        console.error('Tracking error:', e);
    }
}

export function isWatchActive(): boolean {
    return watchId !== null;
}

export function stopLocationTracking() {
    if (watchId !== null) {
        Geolocation.clearWatch({ id: watchId });
        watchId = null;
    }
    if (_orientationHandler) {
        window.removeEventListener(
            'deviceorientationabsolute',
            _orientationHandler as any
        );
        _orientationHandler = null;
    }
    if (_originTileUnsub) {
        _originTileUnsub();
        _originTileUnsub = null;
    }
    lastMotionSample = null;
    state.userSpeedMps = null;
    followHeadingMovementActive = false;
}

export function updateUserMarker() {
    if (
        !state.userLocation ||
        !state.scene ||
        !state.originTile ||
        !state.camera
    )
        return;

    const pos = lngLatToWorld(
        state.userLocation.lon,
        state.userLocation.lat,
        state.originTile
    );

    // v5.28.31 : Si la position est trop loin (> 100km), on cache le marqueur pour éviter les artefacts (Search Teleport)
    const distToCenter = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
    if (distToCenter > 100000) {
        if (state.userMarker) state.userMarker.visible = false;
        return;
    }

    const groundH = state.IS_2D_MODE ? 0 : getAltitudeAt(pos.x, pos.z);
    // Offset minimal : évite le Z-clipping sans créer de décalage de parallaxe sous angle oblique
    const finalY = groundH + 2;

    if (!state.userMarker) {
        state.userMarker = new THREE.Group();

        // v5.32.22 : Ajout d'une sphère 3D pour la "pastille 3D" demandée
        // Plus visible et immersive en mode 3D que le simple sprite
        const sphereGeo = new THREE.SphereGeometry(15, 16, 16);
        const sphereMat = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.5,
            metalness: 0.5,
            roughness: 0.2,
        });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.name = 'user-sphere';
        state.userMarker.add(sphere);

        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(64, 64, 54, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(64, 64, 42, 0, Math.PI * 2);
        ctx.fillStyle = '#ff0000';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(64, 64, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
        const tex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({
            map: tex,
            sizeAttenuation: false,
            depthTest: false,
            transparent: true,
        });
        const dot = new THREE.Sprite(spriteMat);
        dot.scale.set(0.045, 0.045, 1);
        dot.name = 'user-dot';
        state.userMarker.add(dot);
        state.scene.add(state.userMarker);
    }

    state.userMarker.visible = true;

    // v5.32.22 : Gérer la visibilité des composants 2D/3D du marqueur
    const sphere = state.userMarker.getObjectByName('user-sphere');
    if (sphere) sphere.visible = !state.IS_2D_MODE;

    state.userMarker.position.set(pos.x, finalY, pos.z);
}

/**
 * Supprime complètement l'indicateur de position de la scène (v5.28.32).
 */
export function clearUserMarker() {
    if (state.userMarker) {
        if (state.scene) state.scene.remove(state.userMarker);
        state.userMarker = null;
    }
    state.userLocation = null;
    state.userSpeedMps = null;
    state.isFollowingUser = false;
    lastMotionSample = null;
    followHeadingMovementActive = false;
}

export function centerOnUser(delta: number) {
    if (
        !state.userLocation ||
        !state.controls ||
        !state.camera ||
        !state.originTile
    )
        return;

    const targetWorldPos = lngLatToWorld(
        state.userLocation.lon,
        state.userLocation.lat,
        state.originTile
    );
    const groundH = state.IS_2D_MODE
        ? 0
        : getAltitudeAt(targetWorldPos.x, targetWorldPos.z);

    // On vise l'altitude réelle pour éviter l'effet de décalage (v5.5.15)
    // En 2D, on vise le niveau 0.
    const finalTarget = new THREE.Vector3(
        targetWorldPos.x,
        groundH,
        targetWorldPos.z
    );
    // Capturer l'orbite avant de déplacer la cible. La caméra et la cible sont
    // ensuite translatées du même delta : l'orientation ne peut donc plus être
    // modifiée accidentellement par le lissage de position.
    const orbitOffset = state.camera.position
        .clone()
        .sub(state.controls.target);
    const followTarget = getFollowTargetForViewport(finalTarget, orbitOffset);

    // Un fix GPS récent ne signifie pas que la caméra vient d'entrer en suivi.
    // L'ancien test sur lastTrackingUpdate réarmait cette phase toutes les
    // 3-5 secondes et provoquait l'alternance dérive / recentrage brusque.
    const isInitial = state.isFollowingUser && followCameraNeedsInitialization;

    // Lissage de la cible
    const lerpFactor = 1 - Math.exp(-(isInitial ? 10 : 3) * delta);
    const previousTarget = state.controls.target.clone();
    state.controls.target.lerp(followTarget, lerpFactor);
    state.camera.position.add(
        state.controls.target.clone().sub(previousTarget)
    );

    // Lissage de l'orbite
    const spherical = new THREE.Spherical().setFromVector3(orbitOffset);

    // Zoom & Tilt
    if (
        state.isFollowingUser &&
        (isInitial || Math.abs(spherical.radius - FOLLOW_CAMERA_DISTANCE) > 1)
    ) {
        spherical.radius = THREE.MathUtils.lerp(
            spherical.radius,
            FOLLOW_CAMERA_DISTANCE,
            1 - Math.exp(-2.2 * delta)
        );
    }
    if (isInitial) {
        spherical.phi = THREE.MathUtils.lerp(
            spherical.phi,
            0.8,
            1 - Math.exp(-1.5 * delta)
        );
    }

    const currentSpeed = state.userSpeedMps ?? 0;
    if (currentSpeed >= FOLLOW_MOVEMENT_START_MPS) {
        followHeadingMovementActive = true;
    } else if (currentSpeed <= FOLLOW_MOVEMENT_STOP_MPS) {
        followHeadingMovementActive = false;
        headingCorrectionActive = false;
    }

    // Rotation uniquement pendant un déplacement réel. Tourner le téléphone ou
    // son corps à l'arrêt ne doit jamais faire pivoter la carte.
    if (
        state.userHeading !== null &&
        followHeadingMovementActive &&
        !isInitial
    ) {
        const targetTheta =
            Math.PI + THREE.MathUtils.degToRad(state.userHeading);
        let diff = targetTheta - spherical.theta;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        const correctionStart = THREE.MathUtils.degToRad(12);
        const correctionStop = THREE.MathUtils.degToRad(5);
        if (Math.abs(diff) >= correctionStart) {
            headingCorrectionActive = true;
        } else if (Math.abs(diff) <= correctionStop) {
            headingCorrectionActive = false;
        }
        if (headingCorrectionActive) {
            // Rotation volontairement plafonnée : un compas mobile bruité ne
            // doit jamais produire de rattrapage brutal ou stroboscopique.
            const clampedDelta = Math.min(delta, 0.05);
            const requestedStep = diff * (1 - Math.exp(-0.8 * clampedDelta));
            const maxStep = THREE.MathUtils.degToRad(12) * clampedDelta;
            spherical.theta += THREE.MathUtils.clamp(
                requestedStep,
                -maxStep,
                maxStep
            );
        }
    }

    spherical.makeSafe();
    const newPos = new THREE.Vector3()
        .setFromSpherical(spherical)
        .add(state.controls.target);
    state.camera.position.copy(newPos);
    state.controls.update();
    if (isInitial) followCameraNeedsInitialization = false;
}
