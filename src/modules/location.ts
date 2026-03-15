import * as THREE from 'three';
import { Geolocation } from '@capacitor/geolocation';
import { state } from './state';
import { lngLatToWorld } from './geo';
import { getAltitudeAt } from './analysis';

let watchId: string | null = null;
let lastHeadingUpdate = 0;

// --- DÉTECTION ORIENTATION MOBILE (v4.5.60) ---
function initOrientationTracking() {
    const handleOrientation = (event: DeviceOrientationEvent) => {
        // @ts-ignore
        let heading = event.webkitCompassHeading || event.alpha;
        if (event.absolute && event.alpha !== null) heading = 360 - event.alpha;
        
        if (heading !== undefined && heading !== null) {
            state.userHeading = heading;
            updateUserMarker();
        }
    };

    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        (DeviceOrientationEvent as any).requestPermission().then((res: string) => {
            if (res === 'granted') window.addEventListener('deviceorientationabsolute', handleOrientation as any);
        });
    } else {
        window.addEventListener('deviceorientationabsolute', handleOrientation as any);
        window.addEventListener('deviceorientation', handleOrientation as any);
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
            
            const { latitude, longitude, altitude, heading } = position.coords;
            
            // --- MISE À JOUR ÉTAT GPS (v4.5.60) ---
            const distMove = Math.sqrt(Math.pow(latitude - lastLat, 2) + Math.pow(longitude - lastLon, 2));
            if (distMove > 0.00001) { // Env. 1m de sensibilité
                state.userLocation = { lat: latitude, lon: longitude, alt: altitude || 0 };
                lastLat = latitude; lastLon = longitude;
                updateUserMarker();
            }
            
            if (heading !== null && heading !== undefined) {
                state.userHeading = heading;
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

/**
 * Met à jour visuellement le marqueur sur la carte.
 * Les calculs de position monde sont faits ici, mais le lissage caméra est dans scene.ts
 */
export function updateUserMarker() {
    if (!state.userLocation || !state.scene || !state.originTile) return;

    const pos = lngLatToWorld(state.userLocation.lon, state.userLocation.lat, state.originTile);
    const groundH = getAltitudeAt(pos.x, pos.z);
    const finalY = groundH + 5; 

    if (!state.userMarker) {
        state.userMarker = new THREE.Group();
        
        // --- CERCLE DE POSITION (Bleu Glow) ---
        const ringGeo = new THREE.RingGeometry(8, 10, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.6 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        state.userMarker.add(ring);

        // --- CÔNE DE VUE (SECTEUR) ---
        const coneGeo = new THREE.CircleGeometry(45, 32, -Math.PI/6, Math.PI/3);
        const coneMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.15 });
        const viewCone = new THREE.Mesh(coneGeo, coneMat);
        viewCone.rotation.x = -Math.PI / 2;
        viewCone.rotation.z = Math.PI; 
        state.userMarker.add(viewCone);

        // --- POINT BLANC ---
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.beginPath(); ctx.arc(32, 32, 22, 0, Math.PI * 2);
            ctx.fillStyle = 'white'; ctx.fill();
            ctx.beginPath(); ctx.arc(32, 32, 16, 0, Math.PI * 2);
            ctx.fillStyle = '#3b82f6'; ctx.fill();
        }
        const tex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false });
        const dot = new THREE.Sprite(spriteMat);
        dot.scale.set(0.018, 0.018, 1);
        dot.position.y = 2;
        state.userMarker.add(dot);

        state.scene.add(state.userMarker);
    }

    // Le marqueur suit immédiatement pour le feedback visuel, 
    // mais la caméra le suit avec lissage.
    state.userMarker.position.set(pos.x, finalY, pos.z);
    
    if (state.userHeading !== null) {
        state.userMarker.rotation.y = -THREE.MathUtils.degToRad(state.userHeading);
    }
}

/**
 * Cette fonction est maintenant un ORCHESTRATEUR DE LISSAGE (v4.5.60)
 * Appelée à chaque frame (60fps) depuis scene.ts
 */
export function centerOnUser(delta: number) {
    if (!state.userLocation || !state.controls || !state.originTile || !state.camera) return;
    
    // 1. POSITION CIBLE
    const targetWorldPos = lngLatToWorld(state.userLocation.lon, state.userLocation.lat, state.originTile);
    
    // --- LISSAGE EXPONENTIEL (Delta-based) ---
    // On utilise un facteur de lissage qui s'adapte au temps écoulé
    const posLerpFactor = 1 - Math.exp(-5 * delta); // Env. 5Hz de réactivité
    state.smoothUserPos.lerp(new THREE.Vector3(targetWorldPos.x, 0, targetWorldPos.z), posLerpFactor);
    
    // Appliquer à la cible des contrôles
    state.controls.target.copy(state.smoothUserPos);

    // 2. DISTANCE CAMÉRA (Vision Rando Fixe)
    const targetDist = 1200; 
    const currentDist = state.camera.position.distanceTo(state.controls.target);
    const distLerpFactor = 1 - Math.exp(-2 * delta); // Plus lent pour le zoom
    
    if (Math.abs(currentDist - targetDist) > 1) {
        const factor = THREE.MathUtils.lerp(1, targetDist / currentDist, distLerpFactor);
        state.camera.position.lerp(state.controls.target.clone().add(
            state.camera.position.clone().sub(state.controls.target).multiplyScalar(factor)
        ), distLerpFactor);
    }

    // 3. CAP / ORIENTATION (Heading)
    if (state.userHeading !== null) {
        const currentAzimuth = state.controls.getAzimuthalAngle();
        const targetAzimuth = -THREE.MathUtils.degToRad(state.userHeading);
        
        let diff = targetAzimuth - currentAzimuth;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        // Filtre Passe-Bas sur la rotation
        const headingLerpFactor = 1 - Math.exp(-3 * delta); 
        if (Math.abs(diff) > 0.001) {
            const angle = currentAzimuth + diff * headingLerpFactor;
            const distXZ = Math.sqrt(Math.pow(state.camera.position.x - state.controls.target.x, 2) + Math.pow(state.camera.position.z - state.controls.target.z, 2));
            state.camera.position.x = state.controls.target.x + Math.sin(angle) * distXZ;
            state.camera.position.z = state.controls.target.z + Math.cos(angle) * distXZ;
        }
    }
    
    state.controls.update();
}
