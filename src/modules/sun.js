import * as THREE from 'three';
import SunCalc from 'suncalc';
import { state } from './state.js';

export function updateSunPosition(minutes) {
    if (!state.sunLight) return;
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    document.getElementById('time-disp').textContent = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    
    // Utilisation de l'heure légale locale (comme Shadowmap)
    const date = new Date();
    date.setHours(hours, mins, 0, 0);
    
    const pos = SunCalc.getPosition(date, state.TARGET_LAT, state.TARGET_LON);
    const az = pos.azimuth; // 0 = Sud, Positif = Ouest, Négatif = Est
    const alt = pos.altitude;
    
    const altDeg = alt * 180 / Math.PI;
    document.getElementById('az-disp').textContent = ((az * 180 / Math.PI) + 180).toFixed(1);
    document.getElementById('alt-disp').textContent = altDeg.toFixed(1);
    
    // 1. Calcul de l'intensité et des couleurs selon l'altitude
    let sunIntensity = 0;
    let skyColor = new THREE.Color(0x87CEEB);
    let sunColor = new THREE.Color(0xffffff);
    let ambientIntensity = 0.4;

    if (altDeg > 5) {
        // Plein jour
        sunIntensity = Math.min(2.5, Math.sin(alt) * 3);
        skyColor.setHex(0x87CEEB);
        sunColor.setHex(0xffffff);
        ambientIntensity = 0.5;
    } else if (altDeg > -6) {
        // Crépuscule (Transition douce)
        const t = (altDeg + 6) / 11; // 0 à 1
        sunIntensity = t * 0.8;
        
        // Interpolation entre Orange/Rouge et Bleu ciel
        const sunsetColor = new THREE.Color(0xff7b00);
        const dayColor = new THREE.Color(0x87CEEB);
        skyColor.lerpColors(sunsetColor, dayColor, t);
        
        sunColor.setHex(0xffa500);
        ambientIntensity = 0.2 + (t * 0.3);
    } else {
        // Nuit (Clair de lune)
        sunIntensity = 0.25; // Lune plus puissante
        skyColor.setHex(0x0a0a25); // Ciel nocturne légèrement plus clair
        sunColor.setHex(0xccccff); // Lune plus blanche/bleutée
        ambientIntensity = 0.35; // Visibilité générale augmentée
    }

    // 2. Application au moteur
    state.sunLight.intensity = sunIntensity;
    state.sunLight.color.copy(sunColor);
    state.scene.background.copy(skyColor);
    state.scene.fog.color.copy(skyColor);
    
    if (state.ambientLight) {
        state.ambientLight.intensity = ambientIntensity;
    }

    // 3. Positionnement
    const distance = 25000;
    // VITAL : Si c'est la nuit (alt < 0), on force la lune à être HAUTE dans le ciel (ex: 25°)
    // Sinon la lumière vient d'en dessous et on ne voit rien.
    const phi = alt < -0.1 ? Math.PI / 7 : alt; 
    
    state.sunLight.position.x = distance * Math.cos(phi) * -Math.sin(az);
    state.sunLight.position.y = distance * Math.sin(phi);
    state.sunLight.position.z = distance * Math.cos(phi) * Math.cos(az);
}
