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
        // Filtrage strict sur les types de sommets et relief
        const r = await fetch(`https://api.maptiler.com/geocoding/${lon},${lat}.json?key=${state.MK}&types=poi&limit=20`);
        if (!r.ok) return [];
        const data = await r.json();
        
        const peakKeywords = ['peak', 'mountain', 'sommet', 'mont', 'aiguille', 'crête', 'volcan'];
        
        return data.features
            .filter(f => {
                const name = (f.text || '').toLowerCase();
                const category = (f.properties?.category || '').toLowerCase();
                // On ne garde que si le nom ou la catégorie évoque une montagne
                return peakKeywords.some(k => name.includes(k) || category.includes(k));
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
    
    // Design plus discret et élégant
    ctx.fillStyle = 'rgba(20, 20, 25, 0.8)';
    ctx.roundRect(50, 20, 412, 70, 35);
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = 'bold 32px "DM Sans", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.fillText(text.toUpperCase(), 256, 65);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true, 
        depthTest: true, // Pour qu'ils puissent passer derrière les montagnes
        sizeAttenuation: true 
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(1800, 450, 1);
    return sprite;
}
