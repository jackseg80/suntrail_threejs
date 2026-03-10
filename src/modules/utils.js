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

let lastSearchPos = { lat: 0, lon: 0 };

export async function fetchNearbyPeaks(lat, lon) {
    // ANTI-SPAM : On ne relance une recherche que si on a bougé de ~2km (0.02 degré)
    const dist = Math.sqrt(Math.pow(lat - lastSearchPos.lat, 2) + Math.pow(lon - lastSearchPos.lon, 2));
    if (dist < 0.02) return [];
    lastSearchPos = { lat, lon };

    try {
        // Recherche par mot-clé "peak" avec biais de proximité sur vos coordonnées
        const query = encodeURIComponent("peak");
        const url = `https://api.maptiler.com/geocoding/${query}.json?key=${state.MK}&proximity=${lon},${lat}&limit=10`;
        
        const r = await fetch(url);
        if (!r.ok) return [];
        const data = await r.json();
        
        return data.features.map(f => ({
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
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.roundRect(20, 20, 472, 88, 44);
    ctx.fill();
    
    ctx.strokeStyle = '#ffcc33';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.font = 'bold 32px "DM Sans", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(text.toUpperCase(), 256, 78);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true, 
        depthTest: false,
        sizeAttenuation: true 
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(3000, 750, 1);
    return sprite;
}
