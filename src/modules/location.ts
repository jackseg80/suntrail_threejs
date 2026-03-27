import * as THREE from 'three';
import { Geolocation } from '@capacitor/geolocation';
import { state } from './state';
import { lngLatToWorld } from './geo';
import { getAltitudeAt } from './analysis';
import { updateRecordedTrackMesh } from './terrain';

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

let lastLat = 0, lastLon = 0;

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
            
            // On ignore les variations GPS insignifiantes (bruit statique)
            const distMove = Math.sqrt(Math.pow(latitude - lastLat, 2) + Math.pow(longitude - lastLon, 2));
            if (distMove > 0.000005) { // Env. 50cm
                if (state.userLocation === null) state.lastTrackingUpdate = Date.now();
                state.userLocation = { lat: latitude, lon: longitude, alt: altitude || 0 };
                lastLat = latitude; lastLon = longitude;
                
                // --- ENREGISTREMENT DU TRACÉ (v5.8.16) ---
                if (state.isRecording) {
                    state.recordedPoints = [...state.recordedPoints, {
                        lat: latitude,
                        lon: longitude,
                        alt: altitude || 0,
                        timestamp: Date.now()
                    }];
                    updateRecordedTrackMesh();
                }

                updateUserMarker();
            }
        });
    } catch (e) { console.error("Tracking error:", e); }
}

export function stopLocationTracking() {
    if (watchId !== null) {
        Geolocation.clearWatch({ id: watchId });
        watchId = null;
    }
}

export function updateUserMarker() {
    if (!state.userLocation || !state.scene || !state.originTile) return;

    const pos = lngLatToWorld(state.userLocation.lon, state.userLocation.lat, state.originTile);
    const groundH = getAltitudeAt(pos.x, pos.z);
    const finalY = groundH + 5; 

    if (!state.userMarker) {
        state.userMarker = new THREE.Group();
        
        // Cercle Glow
        const ringGeo = new THREE.RingGeometry(8, 10, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.6 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        state.userMarker.add(ring);

        // Cône de vue (Secteur 60°)
        const coneGeo = new THREE.CircleGeometry(45, 32, -Math.PI/6, Math.PI/3);
        const coneMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.3 });
        const viewCone = new THREE.Mesh(coneGeo, coneMat);
        viewCone.rotation.x = -Math.PI / 2;
        viewCone.rotation.z = Math.PI / 2; // Aligne l'axe du secteur sur le Nord (-Z)
        state.userMarker.add(viewCone);

        // Point central (Sprite HD)
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        ctx.beginPath(); ctx.arc(32, 32, 22, 0, Math.PI * 2);
        ctx.fillStyle = 'white'; ctx.fill();
        ctx.beginPath(); ctx.arc(32, 32, 16, 0, Math.PI * 2);
        ctx.fillStyle = '#3b82f6'; ctx.fill();
        
        const tex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false });
        const dot = new THREE.Sprite(spriteMat);
        dot.scale.set(0.018, 0.018, 1);
        dot.position.y = 2;
        state.userMarker.add(dot);
        
        state.scene.add(state.userMarker);
    }

    state.userMarker.position.set(pos.x, finalY, pos.z);
    
    if (state.userHeading !== null) {
        // On oriente le groupe vers le cap (Three.js rotation horaire = -Y)
        state.userMarker.rotation.y = -THREE.MathUtils.degToRad(state.userHeading);
    }
}

export function centerOnUser(delta: number) {
    if (!state.userLocation || !state.controls || !state.camera || !state.originTile) return;
    
    const targetWorldPos = lngLatToWorld(state.userLocation.lon, state.userLocation.lat, state.originTile);
    const groundH = getAltitudeAt(targetWorldPos.x, targetWorldPos.z);
    
    // On vise l'altitude réelle pour éviter l'effet de décalage (v5.5.15)
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
            spherical.theta += diff * (1 - Math.exp(-1.2 * delta));
        }
    }

    spherical.makeSafe();
    const newPos = new THREE.Vector3().setFromSpherical(spherical).add(state.controls.target);
    state.camera.position.copy(newPos);
    state.controls.update();
}
