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

// Initialisé à null pour forcer la 1ère requête
let lastSearchPos = null;

export async function fetchNearbyPeaks(lat, lon) {
    if (lastSearchPos) {
        const dist = Math.sqrt(Math.pow(lat - lastSearchPos.lat, 2) + Math.pow(lon - lastSearchPos.lon, 2));
        if (dist < 0.05) return []; // On attend d'avoir bougé de ~5km
    }
    lastSearchPos = { lat, lon };

    try {
        // Recherche de POI de type "mountain_peak" autour de la position
        const url = `https://api.maptiler.com/geocoding/peak.json?key=${state.MK}&proximity=${lon},${lat}&limit=15`;
        
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
    
    // Design ultra-visible (Bulle noire et or)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.beginPath();
    ctx.roundRect(10, 10, 492, 108, 54);
    ctx.fill();
    
    ctx.strokeStyle = '#ffcc33';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.font = 'bold 42px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(text.toUpperCase(), 256, 75);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true, 
        depthTest: false, // Passe à travers les montagnes
        sizeAttenuation: true 
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    
    // On agrandit massivement pour être sûr de les voir
    sprite.scale.set(5000, 1250, 1);
    return sprite;
}
