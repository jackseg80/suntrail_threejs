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

const PEAKS_DB = [
    { name: "Mont Blanc", lat: 45.8326, lon: 6.8652, alt: 4808 },
    { name: "Aiguille du Midi", lat: 45.8794, lon: 6.8874, alt: 3842 },
    { name: "Mont Maudit", lat: 45.8486, lon: 6.8711, alt: 4465 },
    { name: "Mont Blanc du Tacul", lat: 45.8572, lon: 6.8861, alt: 4248 },
    { name: "Grandes Jorasses", lat: 45.8691, lon: 7.0031, alt: 4208 },
    { name: "Dent du Géant", lat: 45.8664, lon: 6.9533, alt: 4013 },
    { name: "Aiguille Verte", lat: 45.9364, lon: 6.9703, alt: 4122 },
    { name: "Les Drus", lat: 45.9333, lon: 6.9533, alt: 3754 },
    { name: "Aiguille de Bionnassay", lat: 45.8461, lon: 6.7858, alt: 4052 },
    { name: "Dôme du Goûter", lat: 45.8475, lon: 6.8447, alt: 4304 },
    { name: "Mont Tondu", lat: 45.7725, lon: 6.7486, alt: 3196 },
    { name: "Aiguille du Tour", lat: 45.9939, lon: 7.0061, alt: 3540 },
    { name: "Brévent", lat: 45.9336, lon: 6.8375, alt: 2525 },
    { name: "Flégère", lat: 45.9606, lon: 6.8858, alt: 1877 },
    { name: "Aiguilles Rouges", lat: 45.9858, lon: 6.8522, alt: 2965 },
    { name: "Matterhorn (Cervin)", lat: 45.9763, lon: 7.6586, alt: 4478 },
    { name: "Eiger", lat: 46.5775, lon: 8.0053, alt: 3967 },
    { name: "Jungfrau", lat: 46.5367, lon: 7.9625, alt: 4158 },
    { name: "Monch", lat: 46.5586, lon: 7.9922, alt: 4107 }
];

export async function fetchNearbyPeaks(lat, lon) {
    return PEAKS_DB.filter(p => {
        const d = Math.sqrt(Math.pow(lat - p.lat, 2) + Math.pow(lon - p.lon, 2));
        return d < 0.5; 
    });
}

export function createLabelSprite(text) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontSize = 32;
    ctx.font = `bold ${fontSize}px "DM Sans", sans-serif`;
    
    // Mesure du texte pour adapter la largeur
    const textWidth = ctx.measureText(text.toUpperCase()).width;
    const padding = 40;
    const badgeWidth = textWidth + padding * 2;
    const badgeHeight = 60;
    
    // On dimensionne le canvas au plus juste
    canvas.width = badgeWidth + 20; // +20 pour l'ombre/bordure
    canvas.height = badgeHeight + 20;
    
    // On redéfinit la font après le redimensionnement du canvas
    ctx.font = `bold ${fontSize}px "DM Sans", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // Dessin du badge
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.roundRect(10, 10, badgeWidth, badgeHeight, 30);
    ctx.fill();
    
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Texte
    ctx.fillStyle = 'white';
    ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMaterial);
    
    // Mise à l'échelle : on garde une hauteur fixe (250m), la largeur est proportionnelle
    const ratio = canvas.width / canvas.height;
    sprite.scale.set(250 * ratio, 250, 1);
    
    return sprite;
}
