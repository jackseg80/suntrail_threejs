import * as THREE from 'three';
import { state } from './state.js';

export function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

let lastSearchPos = null;
let lastSearchTime = 0;

export async function fetchNearbyPeaks(lat, lon) {
    const now = Date.now();
    // On ne cherche que toutes les 10 secondes minimum
    if (now - lastSearchTime < 10000) return [];
    
    if (lastSearchPos) {
        const dist = Math.sqrt(Math.pow(lat - lastSearchPos.lat, 2) + Math.pow(lon - lastSearchPos.lon, 2));
        if (dist < 0.1) return []; // ~10km minimum de déplacement
    }
    
    lastSearchTime = now;
    lastSearchPos = { lat, lon };

    try {
        // Recherche ultra-simplifiée pour éviter l'erreur 400
        // On cherche "mount" (très commun) avec proximité
        const url = `https://api.maptiler.com/geocoding/mount.json?key=${state.MK}&proximity=${lon},${lat}`;
        
        const r = await fetch(url);
        if (!r.ok) return [];
        const data = await r.json();
        
        if (!data.features) return [];

        return data.features
            .filter(f => {
                const name = (f.text || '').toLowerCase();
                // On exclut les trucs urbains pour ne garder que le relief
                return !['rue', 'chemin', 'hotel', 'restau', 'parking'].some(k => name.includes(k));
            })
            .map(f => ({
                name: f.text,
                lat: f.center[1],
                lon: f.center[0]
            }));
    } catch (e) {
        return [];
    }
}

export function createLabelSprite(text) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;
    
    // Style "Pancarte de montagne"
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(10, 20, 492, 80);
    ctx.strokeStyle = '#ffcc33';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 20, 492, 80);

    ctx.font = 'bold 38px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(text.toUpperCase(), 256, 75);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true, 
        depthTest: false,
        sizeAttenuation: true 
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(4000, 1000, 1);
    return sprite;
}
