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
        viewCone.rotation.z = Math.PI / 2; // Aligner sur le Nord (-Z) par défaut
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
 * Cette fonction est maintenant un ORCHESTRATEUR DE LISSAGE (v4.7.6)
 */
export function centerOnUser(delta: number) {
    if (!state.userLocation || !state.controls || !state.originTile || !state.camera) return;
    
    // 1. CALCUL DE LA RELATION CAMÉRA/CIBLE ACTUELLE (AVANT DÉPLACEMENT)
    // On extrait l'orbite actuelle pour la manipuler sans sauts
    const offset = state.camera.position.clone().sub(state.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);

    // 2. CALCUL DE LA DESTINATION AU SOL
    const targetWorldPos = lngLatToWorld(state.userLocation.lon, state.userLocation.lat, state.originTile);
    const finalTarget = new THREE.Vector3(targetWorldPos.x, 0, targetWorldPos.z);
    
    const isInitial = (Date.now() - state.lastTrackingUpdate < 3000);
    
    // Vitesse de déplacement au sol
    const moveFactor = 1 - Math.exp(-(isInitial ? 8 : 3) * delta);
    state.controls.target.lerp(finalTarget, moveFactor);

    // 3. MISE À JOUR DE L'ORBITE (LISSAGE)
    
    // --- A. ZOOM (Distance) ---
    const preferredDist = 1500;
    if (isInitial || spherical.radius > 5000) {
        const zoomFactor = 1 - Math.exp(-2 * delta);
        spherical.radius = THREE.MathUtils.lerp(spherical.radius, preferredDist, zoomFactor);
    }

    // --- B. TILT (Inclinaison) ---
    if (isInitial) {
        const tiltFactor = 1 - Math.exp(-2 * delta);
        // On tend vers la vue de dessus (phi = 0)
        spherical.phi = THREE.MathUtils.lerp(spherical.phi, 0.01, tiltFactor);
    }

    // --- C. ROTATION (Azimuth) ---
    if (state.userHeading !== null && !isInitial) {
        // FORMULE FIXÉE (v4.7.6) : Nord = PI, Est = -PI/2, Sud = 0, Ouest = PI/2
        const targetTheta = Math.PI + THREE.MathUtils.degToRad(state.userHeading);
        
        let diff = targetTheta - spherical.theta;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        const deadzone = THREE.MathUtils.degToRad(1.5);
        if (Math.abs(diff) > deadzone) {
            const rotFactor = 1 - Math.exp(-1.5 * delta);
            spherical.theta += diff * rotFactor;
        }
    }

    // 4. RECONSTRUCTION ATOMIQUE DE LA CAMÉRA
    // On replace la caméra en orbite parfaite autour de la NOUVELLE cible
    spherical.makeSafe(); // Sécurité Three.js pour éviter le Gimbal Lock (phi=0 ou PI)
    const newPos = new THREE.Vector3().setFromSpherical(spherical).add(state.controls.target);
    state.camera.position.copy(newPos);
    
    // On force la mise à jour des contrôles pour synchroniser leur état interne
    state.controls.update();
}
