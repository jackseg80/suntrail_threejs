import * as THREE from 'three';
import { Geolocation } from '@capacitor/geolocation';
import { state } from './state';
import { lngLatToWorld } from './geo';
import { getAltitudeAt } from './analysis';

let watchId: string | null = null;

export async function startLocationTracking() {
    if (watchId !== null) return;

    try {
        watchId = await Geolocation.watchPosition({
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 3000
        }, (position, err) => {
            if (err || !position) return;
            
            const { latitude, longitude, altitude, heading } = position.coords;
            state.userLocation = { lat: latitude, lon: longitude, alt: altitude || 0 };
            state.userHeading = heading;

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
        
        // --- CERCLE DE POSITION (AU SOL) ---
        const ringGeo = new THREE.RingGeometry(15, 20, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        state.userMarker.add(ring);

        // --- POINT CENTRAL (SPRITE POUR VISIBILITÉ CONSTANTE) ---
        // Utilisation d'un Sprite pour qu'il soit visible de loin (v4.5.9)
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
        dot.scale.set(0.025, 0.025, 1); // Taille fixe à l'écran (2.5% de la hauteur vue)
        dot.position.y = 50; // Un peu surélevé pour ne pas être caché par le relief
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
    
    // Animation fluide vers l'utilisateur
    const targetPos = new THREE.Vector3(pos.x, 0, pos.z);
    state.controls.target.lerp(targetPos, 0.1);
}
