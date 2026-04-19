import * as THREE from 'three';
import { Geolocation } from '@capacitor/geolocation';
import { state } from './state';
import { lngLatToWorld } from './geo';
import { getAltitudeAt } from './analysis';

let watchId: string | null = null;

/**
 * DÉTECTION ORIENTATION MOBILE (v5.5.14)
 * Implémentation d'un filtre passe-bas pour la stabilité Swisstopo.
 */
function initOrientationTracking() {
    const handleOrientation = (event: DeviceOrientationEvent) => {
        let rawHeading = event.webkitCompassHeading || event.alpha;
        if (event.absolute && event.alpha !== null) rawHeading = 360 - event.alpha;
        
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

    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        (DeviceOrientationEvent as any).requestPermission().then((res: string) => {
            if (res === 'granted') window.addEventListener('deviceorientationabsolute', handleOrientation as any);
        });
    } else {
        window.addEventListener('deviceorientationabsolute', handleOrientation as any);
    }
}

export async function startLocationTracking() {
    if (watchId !== null) return;
    initOrientationTracking();

    try {
        watchId = await Geolocation.watchPosition({
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 3000
        }, (position, err) => {
            if (err || !position) return;
            
            const { latitude, longitude, altitude, accuracy } = position.coords;
            
            // Met à jour la précision GPS pour l'affichage dans le panneau Système
            state.userLocationAccuracy = accuracy || null;
            
            // Mise à jour de la position utilisateur pour l'UI
            // Note: L'enregistrement des points est géré EXCLUSIVEMENT par nativeGPSService.ts (natif Android)
            // Le watchPosition JS ne fait plus d'enregistrement - il met à jour uniquement l'UI
            state.userLocation = { lat: latitude, lon: longitude, alt: altitude || 0 };
            state.lastTrackingUpdate = Date.now();
            
            updateUserMarker();
        });
    } catch (e) { console.error("Tracking error:", e); }
}

export function isWatchActive(): boolean { return watchId !== null; }

export function stopLocationTracking() {
    if (watchId !== null) {
        Geolocation.clearWatch({ id: watchId });
        watchId = null;
    }
}

export function updateUserMarker() {
    if (!state.userLocation || !state.scene || !state.originTile || !state.camera) return;

    const pos = lngLatToWorld(state.userLocation.lon, state.userLocation.lat, state.originTile);
    
    // v5.28.31 : Si la position est trop loin (> 100km), on cache le marqueur pour éviter les artefacts (Search Teleport)
    const distToCenter = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
    if (distToCenter > 100000) {
        if (state.userMarker) state.userMarker.visible = false;
        return;
    }

    const groundH = state.IS_2D_MODE ? 0 : getAltitudeAt(pos.x, pos.z);
    const finalY = groundH + 10; // Un peu plus haut pour éviter l'occlusion par le relief

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
            roughness: 0.2
        });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.name = 'user-sphere';
        state.userMarker.add(sphere);

        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        ctx.shadowBlur = 15; ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.arc(64, 64, 54, 0, Math.PI * 2);
        ctx.fillStyle = 'white'; ctx.fill();
        ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(64, 64, 42, 0, Math.PI * 2);
        ctx.fillStyle = '#ff0000'; ctx.fill();
        ctx.beginPath(); ctx.arc(64, 64, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'white'; ctx.fill();
        const tex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true });
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
    state.isFollowingUser = false;
}

// v5.28.31 : Mise à jour automatique du marqueur lors d'un changement d'origine (Recherche, etc.)
state.subscribe('originTile', () => updateUserMarker());

export function centerOnUser(delta: number) {
    if (!state.userLocation || !state.controls || !state.camera || !state.originTile) return;
    
    const targetWorldPos = lngLatToWorld(state.userLocation.lon, state.userLocation.lat, state.originTile);
    const groundH = state.IS_2D_MODE ? 0 : getAltitudeAt(targetWorldPos.x, targetWorldPos.z);
    
    // On vise l'altitude réelle pour éviter l'effet de décalage (v5.5.15)
    // En 2D, on vise le niveau 0.
    const finalTarget = new THREE.Vector3(targetWorldPos.x, groundH, targetWorldPos.z);

    const isInitial = (Date.now() - state.lastTrackingUpdate < 3000);
    
    // Lissage de la cible
    const lerpFactor = 1 - Math.exp(-(isInitial ? 10 : 3) * delta);
    state.controls.target.lerp(finalTarget, lerpFactor);

    // Lissage de l'orbite
    const offset = state.camera.position.clone().sub(state.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);

    // Zoom & Tilt
    if (isInitial || spherical.radius > 5000) {
        spherical.radius = THREE.MathUtils.lerp(spherical.radius, 1500, 1 - Math.exp(-1.5 * delta));
    }
    if (isInitial) {
        spherical.phi = THREE.MathUtils.lerp(spherical.phi, 0.8, 1 - Math.exp(-1.5 * delta));
    }

    // Rotation (Suivi du cap utilisateur)
    if (state.userHeading !== null && !isInitial) {
        const targetTheta = Math.PI + THREE.MathUtils.degToRad(state.userHeading);
        let diff = targetTheta - spherical.theta;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        const deadzone = THREE.MathUtils.degToRad(2.0);
        if (Math.abs(diff) > deadzone) {
            // Clamper le delta à 50ms max pour éviter un grand saut de rotation
            // si le render loop a été en pause (Deep Sleep → réveil) (v5.11.1)
            const clampedDelta = Math.min(delta, 0.05);
            spherical.theta += diff * (1 - Math.exp(-1.2 * clampedDelta));
        }
    }

    spherical.makeSafe();
    const newPos = new THREE.Vector3().setFromSpherical(spherical).add(state.controls.target);
    state.camera.position.copy(newPos);
    state.controls.update();
}
