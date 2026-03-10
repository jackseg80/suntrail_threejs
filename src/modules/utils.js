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
        // Limite fixée à 10 pour éviter l'erreur 400
        const r = await fetch(`https://api.maptiler.com/geocoding/${lon},${lat}.json?key=${state.MK}&limit=10`);
        if (!r.ok) {
            console.error("MapTiler API Error:", r.status);
            return [];
        }
        const data = await r.json();
        
        // Mots-clés pour identifier les sommets dans les résultats globaux
        const peakKeywords = ['peak', 'mountain', 'sommet', 'mont', 'aiguille', 'crête', 'volcan', 'col ', 'pointe', 'rocher', 'massif', 'tête', 'dent ', 'brèche'];
        const excludeKeywords = ['restaurant', 'hôtel', 'hotel', 'parking', 'shop', 'cafe', 'bar', 'pizzeria', 'chalet'];

        return data.features
            .filter(f => {
                const name = (f.text || '').toLowerCase();
                const place = (f.place_name || '').toLowerCase();
                if (excludeKeywords.some(k => name.includes(k) || place.includes(k))) return false;
                return peakKeywords.some(k => name.includes(k) || place.includes(k));
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
    
    // Fond noir semi-opaque
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.roundRect(20, 20, 472, 88, 44);
    ctx.fill();
    
    // Bordure or
    ctx.strokeStyle = '#ffcc33';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.font = 'bold 36px "DM Sans", sans-serif';
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
    sprite.scale.set(2800, 700, 1);
    return sprite;
}
