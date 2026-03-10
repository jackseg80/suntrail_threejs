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
        // On ne met PAS de filtre "types=poi" car il est trop restrictif pour les sommets.
        // On demande tous les résultats et on filtre nous-mêmes.
        const r = await fetch(`https://api.maptiler.com/geocoding/${lon},${lat}.json?key=${state.MK}&limit=50`);
        if (!r.ok) return [];
        const data = await r.json();
        
        const peakKeywords = ['peak', 'mountain', 'sommet', 'mont', 'aiguille', 'crête', 'volcan', 'col ', 'pointe', 'rocher', 'massif', 'tête', 'dent ', 'praz', 'brèche'];
        const excludeKeywords = ['restaurant', 'hôtel', 'hotel', 'parking', 'garage', 'shop', 'cafe', 'bar', 'bus', 'station', 'pizzeria', 'résidence', 'chalet'];

        return data.features
            .filter(f => {
                const name = (f.text || '').toLowerCase();
                const placeName = (f.place_name || '').toLowerCase();
                
                // Exclusion stricte des commerces/logements
                const isExclude = excludeKeywords.some(k => name.includes(k) || placeName.includes(k));
                if (isExclude) return false;
                
                // On garde si le mot-clé est présent
                return peakKeywords.some(k => name.includes(k) || placeName.includes(k));
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
    
    ctx.fillStyle = 'rgba(10, 10, 15, 0.95)';
    ctx.roundRect(40, 20, 432, 75, 37);
    ctx.fill();
    
    ctx.strokeStyle = '#ffcc33';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.font = 'bold 36px "DM Sans", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(text.toUpperCase(), 256, 68);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true, 
        depthTest: false,
        sizeAttenuation: true 
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(2500, 625, 1);
    return sprite;
}
