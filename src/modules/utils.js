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

export async function fetchNearbyPeaks(lat, lon) {
    try {
        // Utilisation de l'API Geocoding de MapTiler pour trouver des POI de type "mountain"
        const r = await fetch(`https://api.maptiler.com/geocoding/${lon},${lat}.json?key=${state.MK}&types=poi&limit=10`);
        if (!r.ok) return [];
        const data = await r.json();
        
        // On ne garde que ce qui ressemble à un sommet ou un lieu important
        return data.features.map(f => ({
            name: f.text,
            lat: f.center[1],
            lon: f.center[0],
            category: f.properties?.category || ''
        }));
    } catch (e) {
        console.error("Erreur fetch peaks:", e);
        return [];
    }
}

export function createLabelSprite(text) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;
    
    // Fond semi-transparent
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.roundRect(100, 20, 312, 60, 30);
    ctx.fill();
    
    // Bordure dorée
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Texte
    ctx.font = 'bold 36px "DM Sans", sans-serif';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.fillText(text, 256, 62);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(3000, 750, 1); // Taille importante pour être visible de loin
    return sprite;
}
