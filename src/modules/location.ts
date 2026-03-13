import { Geolocation } from '@capacitor/geolocation';
import { state } from './state';
import { lngLatToWorld } from './geo';
import { getAltitudeAt } from './analysis';
import * as THREE from 'three';

let watchId: string | null = null;

export async function startLocationTracking() {
    if (watchId) return;

    try {
        watchId = await Geolocation.watchPosition({
            enableHighAccuracy: true,
            timeout: 10000
        }, (position, err) => {
            if (err) {
                console.error("GPS Watch Error:", err);
                return;
            }
            if (position) {
                state.userLocation = {
                    lat: position.coords.latitude,
                    lon: position.coords.longitude,
                    alt: position.coords.altitude || 0
                };
                updateUserMarker();
                
                if (state.isFollowingUser) {
                    centerOnUser();
                }
            }
        });

        // Boussole (Heading)
        if (window.DeviceOrientationEvent) {
            // @ts-ignore
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                // iOS 13+ nécessite une permission explicite
                // @ts-ignore
                DeviceOrientationEvent.requestPermission()
                    .then((permissionState: string) => {
                        if (permissionState === 'granted') {
                            window.addEventListener('deviceorientationabsolute', handleOrientation, true);
                            window.addEventListener('deviceorientation', handleOrientation, true);
                        }
                    })
                    .catch(console.error);
            } else {
                window.addEventListener('deviceorientationabsolute', handleOrientation, true);
                window.addEventListener('deviceorientation', handleOrientation, true);
            }
        }

    } catch (e) {
        console.error("Failed to start location tracking:", e);
    }
}

export function stopLocationTracking() {
    if (watchId) {
        Geolocation.clearWatch({ id: watchId });
        watchId = null;
    }
    window.removeEventListener('deviceorientationabsolute', handleOrientation);
    window.removeEventListener('deviceorientation', handleOrientation);
}

function handleOrientation(event: DeviceOrientationEvent) {
    let heading = 0;
    const anyEvent = event as any;
    
    if (anyEvent.webkitCompassHeading !== undefined) {
        // iOS
        heading = anyEvent.webkitCompassHeading;
    } else if (event.absolute && event.alpha !== null) {
        // Android / Standard (absolute orientation)
        heading = 360 - event.alpha;
    } else {
        return;
    }

    state.userHeading = heading;
    updateUserMarker();
}

export function updateUserMarker() {
    if (!state.userLocation || !state.scene) return;

    if (!state.userMarker) {
        state.userMarker = createUserMarker();
        state.scene.add(state.userMarker);
    }

    const pos = lngLatToWorld(state.userLocation.lon, state.userLocation.lat, state.originTile);
    
    // Si l'altitude GPS est absente ou peu fiable, on utilise les données du terrain
    let alt = state.userLocation.alt;
    const terrainAlt = getAltitudeAt(pos.x, pos.z) / state.RELIEF_EXAGGERATION;
    
    // On prend le maximum pour éviter d'être sous terre
    alt = Math.max(alt, terrainAlt);

    state.userMarker.position.set(pos.x, alt * state.RELIEF_EXAGGERATION + 20, pos.z);

    if (state.userHeading !== null) {
        const rad = (state.userHeading * Math.PI) / 180;
        state.userMarker.rotation.y = -rad; 
    }
}

function createUserMarker(): THREE.Group {
    const group = new THREE.Group();

    // Point bleu central
    const dotGeo = new THREE.SphereGeometry(15, 32, 32);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x007AFF });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    group.add(dot);

    // Halo lumineux
    const haloGeo = new THREE.RingGeometry(15, 30, 32);
    const haloMat = new THREE.MeshBasicMaterial({ 
        color: 0x007AFF, 
        transparent: true, 
        opacity: 0.3,
        side: THREE.DoubleSide 
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = Math.PI / 2;
    group.add(halo);

    // Cône de direction (Champ de vision)
    const coneGeo = new THREE.ConeGeometry(40, 100, 32, 1, true);
    coneGeo.rotateX(-Math.PI / 2); // Orienter vers l'avant (Z négatif)
    coneGeo.translate(0, 0, -60); // Décaler pour que la pointe soit au centre
    const coneMat = new THREE.MeshBasicMaterial({ 
        color: 0x007AFF, 
        transparent: true, 
        opacity: 0.2,
        side: THREE.DoubleSide
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    group.add(cone);

    return group;
}

export function centerOnUser() {
    if (!state.userLocation || !state.controls || !state.camera) return;
    
    const pos = lngLatToWorld(state.userLocation.lon, state.userLocation.lat, state.originTile);
    const terrainAlt = getAltitudeAt(pos.x, pos.z); 
    
    state.controls.target.set(pos.x, terrainAlt, pos.z);
    state.controls.update();
}
