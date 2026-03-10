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
        // On demande spécifiquement les POI (Points of Interest)
        const r = await fetch(`https://api.maptiler.com/geocoding/${lon},${lat}.json?key=${state.MK}&types=poi&limit=40`);
        if (!r.ok) return [];
        const data = await r.json();
        
        const peakKeywords = ['peak', 'mountain', 'sommet', 'mont', 'aiguille', 'crête', 'volcan', 'col ', 'pointe', 'rocher', 'massif', 'tête', 'dent ', 'praz', 'brèche'];
        const excludeKeywords = ['restaurant', 'hôtel', 'hotel', 'parking', 'garage', 'shop', 'cafe', 'bar', 'bus', 'station', 'pizzeria'];

        return data.features
            .filter(f => {
                const name = (f.text || '').toLowerCase();
                const cat = (f.properties?.category || '').toLowerCase();
                if (excludeKeywords.some(k => name.includes(k) || cat.includes(k))) return false;
                return peakKeywords.some(k => name.includes(k) || cat.includes(k)) || f.properties?.class === 'mountain_peak';
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
    
    // Rectangle simple pour compatibilité maximale
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(50, 20, 412, 80);
    
    ctx.strokeStyle = '#ffcc33';
    ctx.lineWidth = 6;
    ctx.strokeRect(50, 20, 412, 80);

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
    sprite.scale.set(3000, 750, 1);
    return sprite;
}
