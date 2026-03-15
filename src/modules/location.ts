import * as THREE from 'three';
import { Geolocation } from '@capacitor/geolocation';
import { state } from './state';
import { lngLatToWorld } from './geo';
import { getAltitudeAt } from './analysis';

let watchId: string | null = null;

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
            if (distMove > 0.00001) { 
                // Si c'est la toute première position depuis l'activation du suivi, on marque le temps
                if (state.userLocation === null) state.lastTrackingUpdate = Date.now();
                
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
        state.userMarker.renderOrder = 9999;
        state.scene.add(state.userMarker);
    }

    const is2D = state.RESOLUTION <= 2;
    state.userMarker.position.set(pos.x, is2D ? 100 : finalY, pos.z);
    
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
    
    // 1. CALCUL DES DESTINATIONS (v4.5.69)
    const targetWorldPos = lngLatToWorld(state.userLocation.lon, state.userLocation.lat, state.originTile);
    const finalTarget = new THREE.Vector3(targetWorldPos.x, 0, targetWorldPos.z);
    
    // Altitude confortable pour le suivi (1500m)
    const preferredDist = 1500;
    
    // --- VUE DE DESSUS (v4.5.69) ---
    // On veut finir pile au-dessus de l'utilisateur
    const finalCamPos = finalTarget.clone().add(new THREE.Vector3(0, preferredDist, 10)); // Légèrement décalé Z pour stabilité controls

    // 2. DYNAMIQUE DE MOUVEMENT CALIBRÉE
    const isInitial = (Date.now() - state.lastTrackingUpdate < 3000);
    const distToUser = state.controls.target.distanceTo(finalTarget);
    
    // Vitesse proportionnelle bridée
    const distFactor = Math.min(5.0, Math.sqrt(distToUser / 500) + 1.0); 
    const speedBoost = isInitial ? 2.5 : 1.0; 
    
    const lerpFactor = 1 - Math.exp(-2.5 * distFactor * speedBoost * delta); 

    // 3. DÉPLACEMENT SYNCHRONISÉ
    state.controls.target.lerp(finalTarget, lerpFactor);
    
    const currentCamDist = state.camera.position.distanceTo(state.controls.target);
    if (isInitial || currentCamDist > 5000) {
        // Transition Diagonale vers la vue de dessus
        state.camera.position.lerp(finalCamPos, lerpFactor);
        
        // Redressement forcé du tilt
        state.controls.minPolarAngle = THREE.MathUtils.lerp(state.controls.minPolarAngle, 0, lerpFactor);
        state.controls.maxPolarAngle = THREE.MathUtils.lerp(state.controls.maxPolarAngle, 0.1, lerpFactor);
    } else {
        // En marche normale
        const targetH = new THREE.Vector3(finalTarget.x, state.camera.position.y, finalTarget.z);
        state.camera.position.lerp(targetH, lerpFactor);
    }

    // 4. CAP / ORIENTATION (Heading) - STABILISATION PRO (v4.5.70)
    if (state.userHeading !== null && !isInitial) {
        const currentAzimuth = state.controls.getAzimuthalAngle();
        const targetAzimuth = -THREE.MathUtils.degToRad(state.userHeading);
        
        let diff = targetAzimuth - currentAzimuth;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        // --- FILTRE ZONE MORTE & AMORTISSEMENT ---
        // On ignore les micro-mouvements < 1.5 degrés pour supprimer le tremblement
        const deadzone = THREE.MathUtils.degToRad(1.5);
        if (Math.abs(diff) > deadzone) {
            // Lissage très lourd (facteur 1.5 au lieu de 3) pour une rotation stable
            const headingLerpFactor = 1 - Math.exp(-1.5 * delta); 
            const angle = currentAzimuth + diff * headingLerpFactor;
            
            const distXZ = Math.sqrt(
                Math.pow(state.camera.position.x - state.controls.target.x, 2) + 
                Math.pow(state.camera.position.z - state.controls.target.z, 2)
            );
            
            state.camera.position.x = state.controls.target.x + Math.sin(angle) * distXZ;
            state.camera.position.z = state.controls.target.z + Math.cos(angle) * distXZ;
        }
    }
    
    state.controls.update();
}
