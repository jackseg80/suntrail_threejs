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
    
    // 1. Calcul des paramètres
    let sunIntensity = 0;
    let skyColor = new THREE.Color();
    let sunColor = new THREE.Color();
    let ambientIntensity = 0.4;
    let phi = alt;

    const colorDay = new THREE.Color(0x87CEEB);
    const colorSunset = new THREE.Color(0xff7b00);
    const colorNight = new THREE.Color(0x0a0a25);
    
    const sunColorDay = new THREE.Color(0xffffff);
    const sunColorSunset = new THREE.Color(0xffa500);
    const sunColorMoon = new THREE.Color(0xccccff);

    if (altDeg > 5) {
        // Plein jour
        sunIntensity = Math.min(2.5, Math.sin(alt) * 3);
        skyColor.copy(colorDay);
        sunColor.copy(sunColorDay);
        ambientIntensity = 0.5;
        phi = alt;
    } else if (altDeg > 0) {
        // Transition Jour -> Crépuscule (5° à 0°)
        const t = altDeg / 5; // 1 (jour) à 0 (sunset)
        sunIntensity = 0.8 + (t * 1.7);
        skyColor.lerpColors(colorSunset, colorDay, t);
        sunColor.lerpColors(sunColorSunset, sunColorDay, t);
        ambientIntensity = 0.3 + (t * 0.2);
        phi = alt;
    } else if (altDeg > -12) {
        // Transition Crépuscule -> Nuit (0° à -12°)
        const t = (altDeg + 12) / 12; // 1 (sunset) à 0 (nuit)
        sunIntensity = 0.25 + (t * 0.55);
        skyColor.lerpColors(colorNight, colorSunset, t);
        sunColor.lerpColors(sunColorMoon, sunColorSunset, t);
        ambientIntensity = 0.35 - (t * 0.05);
        
        // Transition fluide de la position de la lumière vers la position "Lune" (25°)
        const targetMoonPhi = Math.PI / 7; 
        phi = THREE.MathUtils.lerp(targetMoonPhi, alt, t);
    } else {
        // Nuit totale
        sunIntensity = 0.25;
        skyColor.copy(colorNight);
        sunColor.copy(sunColorMoon);
        ambientIntensity = 0.35;
        phi = Math.PI / 7;
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
    state.sunLight.position.x = distance * Math.cos(phi) * -Math.sin(az);
    state.sunLight.position.y = distance * Math.sin(phi);
    state.sunLight.position.z = distance * Math.cos(phi) * Math.cos(az);
}
