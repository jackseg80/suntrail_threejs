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
        // On cherche plus large pour être sûr d'avoir des résultats
        const r = await fetch(`https://api.maptiler.com/geocoding/${lon},${lat}.json?key=${state.MK}&types=poi&limit=30`);
        if (!r.ok) return [];
        const data = await r.json();
        
        // Mots-clés élargis pour les Alpes et le relief
        const peakKeywords = ['peak', 'mountain', 'sommet', 'mont', 'aiguille', 'crête', 'volcan', 'col ', 'pointe', 'rocher', 'massif', 'tête'];
        const excludeKeywords = ['restaurant', 'hôtel', 'hotel', 'parking', 'garage', 'shop', 'cafe', 'bar', 'bus', 'station', 'pizzeria'];

        return data.features
            .filter(f => {
                const name = (f.text || '').toLowerCase();
                const category = (f.properties?.category || '').toLowerCase();
                const isExclude = excludeKeywords.some(k => name.includes(k) || category.includes(k));
                if (isExclude) return false;
                
                return peakKeywords.some(k => name.includes(k) || category.includes(k)) || f.properties?.class === 'mountain_peak';
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
    
    // Fond plus contrasté
    ctx.fillStyle = 'rgba(10, 10, 15, 0.9)';
    ctx.roundRect(40, 20, 432, 70, 35);
    ctx.fill();
    
    // Bordure dorée plus vive
    ctx.strokeStyle = '#ffcc33';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.font = 'bold 34px "DM Sans", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(text.toUpperCase(), 256, 65);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true, 
        depthTest: false, // CRITIQUE : Toujours visible par-dessus le relief
        sizeAttenuation: true 
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(2200, 550, 1);
    return sprite;
}
