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

// BASE DE DONNÉES LOCALE DES SOMMETS (Fiabilité 100%)
const PEAKS_DB = [
    { name: "Mont Blanc", lat: 45.8326, lon: 6.8652 },
    { name: "Aiguille du Midi", lat: 45.8794, lon: 6.8874 },
    { name: "Mont Maudit", lat: 45.8486, lon: 6.8711 },
    { name: "Mont Blanc du Tacul", lat: 45.8572, lon: 6.8861 },
    { name: "Grandes Jorasses", lat: 45.8691, lon: 7.0031 },
    { name: "Dent du Géant", lat: 45.8664, lon: 6.9533 },
    { name: "Aiguille Verte", lat: 45.9364, lon: 6.9703 },
    { name: "Les Drus", lat: 45.9333, lon: 6.9533 },
    { name: "Aiguille de Bionnassay", lat: 45.8461, lon: 6.7858 },
    { name: "Dôme du Goûter", lat: 45.8475, lon: 6.8447 },
    { name: "Mont Tondu", lat: 45.7725, lon: 6.7486 },
    { name: "Aiguille du Tour", lat: 45.9939, lon: 7.0061 },
    { name: "Brévent", lat: 45.9336, lon: 6.8375 },
    { name: "Flégère", lat: 45.9606, lon: 6.8858 },
    { name: "Aiguilles Rouges", lat: 45.9858, lon: 6.8522 },
    { name: "Grand Muveran", lat: 46.2372, lon: 7.1250 },
    { name: "Matterhorn (Cervin)", lat: 45.9763, lon: 7.6586 },
    { name: "Eiger", lat: 46.5775, lon: 8.0053 },
    { name: "Jungfrau", lat: 46.5367, lon: 7.9625 },
    { name: "Monch", lat: 46.5586, lon: 7.9922 }
];

export async function fetchNearbyPeaks(lat, lon) {
    // On filtre simplement la base locale selon la proximité (~50km)
    return PEAKS_DB.filter(p => {
        const d = Math.sqrt(Math.pow(lat - p.lat, 2) + Math.pow(lon - p.lon, 2));
        return d < 0.5; 
    });
}

export function createLabelSprite(text) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;
    
    // Style Bulle Alpine
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.roundRect(10, 10, 492, 108, 54);
    ctx.fill();
    
    ctx.strokeStyle = '#ffcc33';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.font = 'bold 40px Arial';
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
    sprite.scale.set(4500, 1125, 1);
    return sprite;
}
