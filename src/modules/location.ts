import * as THREE from 'three';
import { Geolocation } from '@capacitor/geolocation';
import { state } from './state';
import { lngLatToWorld } from './geo';
import { getAltitudeAt } from './analysis';

let watchId: string | null = null;
let lastHeadingUpdate = 0;

// --- DÉTECTION ORIENTATION MOBILE (v4.5.36) ---
function initOrientationTracking() {
    const handleOrientation = (event: DeviceOrientationEvent) => {
        // @ts-ignore
        let heading = event.webkitCompassHeading || event.alpha;
        if (event.absolute && event.alpha !== null) heading = 360 - event.alpha;
        
        if (heading !== undefined && heading !== null) {
            state.userHeading = heading;
            const now = Date.now();
            if (now - lastHeadingUpdate > 50) { // Limiter à 20Hz
                updateUserMarker();
                if (state.isFollowingUser) centerOnUser();
                lastHeadingUpdate = now;
            }
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
            state.userLocation = { lat: latitude, lon: longitude, alt: altitude || 0 };
            
            if (heading !== null && heading !== undefined) state.userHeading = heading;

            updateUserMarker();
            if (state.isFollowingUser) centerOnUser();
        });
    } catch (e) { console.error("Tracking error:", e); }
}

export function stopLocationTracking() {
    if (watchId !== null) {
        Geolocation.clearWatch({ id: watchId });
        watchId = null;
    }
}

function updateUserMarker() {
    if (!state.userLocation || !state.scene || !state.originTile) return;

    const pos = lngLatToWorld(state.userLocation.lon, state.userLocation.lat, state.originTile);
    const groundH = getAltitudeAt(pos.x, pos.z);
    const finalY = groundH + 5; 

    if (!state.userMarker) {
        state.userMarker = new THREE.Group();
        
        // --- CERCLE DE POSITION ---
        const ringGeo = new THREE.RingGeometry(8, 10, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        state.userMarker.add(ring);

        // --- CÔNE DE VUE (SECTEUR) ---
        const coneGeo = new THREE.CircleGeometry(40, 32, -Math.PI/6, Math.PI/3);
        const coneMat = new THREE.MeshBasicMaterial({ 
            color: 0x3b82f6, transparent: true, opacity: 0.2, side: THREE.DoubleSide 
        });
        const viewCone = new THREE.Mesh(coneGeo, coneMat);
        viewCone.rotation.x = -Math.PI / 2;
        viewCone.rotation.z = Math.PI; // Aligner avec l'avant
        state.userMarker.add(viewCone);

        // --- POINT CENTRAL ---
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.beginPath(); ctx.arc(32, 32, 25, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff'; ctx.fill();
            ctx.beginPath(); ctx.arc(32, 32, 18, 0, Math.PI * 2);
            ctx.fillStyle = '#3b82f6'; ctx.fill();
        }
        const tex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false });
        const dot = new THREE.Sprite(spriteMat);
        dot.scale.set(0.02, 0.02, 1);
        dot.position.y = 5;
        state.userMarker.add(dot);

        state.scene.add(state.userMarker);
    }

    state.userMarker.position.set(pos.x, finalY, pos.z);
    
    // Orientation si disponible
    if (state.userHeading !== null) {
        state.userMarker.rotation.y = -THREE.MathUtils.degToRad(state.userHeading);
    }
}

export function centerOnUser() {
    if (!state.userLocation || !state.controls || !state.originTile || !state.camera) return;
    const pos = lngLatToWorld(state.userLocation.lon, state.userLocation.lat, state.originTile);
    
    // 1. Cible du sol (Lerp pour fluidité)
    const targetPos = new THREE.Vector3(pos.x, 0, pos.z);
    state.controls.target.lerp(targetPos, 0.1);

    // 2. Vision Rando (LOD 16/17) - On force une distance de ~1200m
    const currentDist = state.camera.position.distanceTo(state.controls.target);
    const targetDist = 1200; 
    
    if (Math.abs(currentDist - targetDist) > 10) {
        const factor = (targetDist / currentDist);
        state.camera.position.lerp(state.controls.target.clone().add(
            state.camera.position.clone().sub(state.controls.target).multiplyScalar(factor)
        ), 0.05);
    }

    // 3. Alignement sur la vue (Heading)
    if (state.userHeading !== null) {
        const currentAzimuth = state.controls.getAzimuthalAngle();
        const targetAzimuth = -THREE.MathUtils.degToRad(state.userHeading);
        
        let diff = targetAzimuth - currentAzimuth;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        if (Math.abs(diff) > 0.01) {
            const angle = currentAzimuth + diff * 0.05;
            const distXZ = Math.sqrt(Math.pow(state.camera.position.x - state.controls.target.x, 2) + Math.pow(state.camera.position.z - state.controls.target.z, 2));
            state.camera.position.x = state.controls.target.x + Math.sin(angle) * distXZ;
            state.camera.position.z = state.controls.target.z + Math.cos(angle) * distXZ;
        }
    }
    
    state.controls.update();
}
