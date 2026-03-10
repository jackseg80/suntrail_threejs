import * as THREE from 'three';
import SunCalc from 'suncalc';
import { state } from './state.js';

export function updateSunPosition(minutes) {
    if (!state.sunLight) return;
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    document.getElementById('time-disp').textContent = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    
    // Utilisation de la date de simulation choisie
    const date = new Date(state.simDate);
    date.setHours(hours, mins, 0, 0);
    
    const pos = SunCalc.getPosition(date, state.TARGET_LAT, state.TARGET_LON);
    const moonPos = SunCalc.getMoonPosition(date, state.TARGET_LAT, state.TARGET_LON);
    const moonIllum = SunCalc.getMoonIllumination(date);
    
    const altDeg = pos.altitude * 180 / Math.PI;
    
    document.getElementById('az-disp').textContent = ((pos.azimuth * 180 / Math.PI) + 180).toFixed(1);
    document.getElementById('alt-disp').textContent = altDeg.toFixed(1);

    // --- MISE À JOUR ÉPHÉMÉRIDES UI ---
    const times = SunCalc.getTimes(date, state.TARGET_LAT, state.TARGET_LON);
    const fmt = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    document.getElementById('sunrise-disp').textContent = fmt(times.sunrise);
    document.getElementById('sunset-disp').textContent = fmt(times.sunset);
    
    let phase = "Inconnue";
    const p = moonIllum.phase;
    if (p < 0.05 || p > 0.95) phase = "Nouvelle";
    else if (p < 0.2) phase = "Premier Croissant";
    else if (p < 0.3) phase = "Premier Quartier";
    else if (p < 0.45) phase = "Gibbeuse Croissante";
    else if (p < 0.55) phase = "Pleine";
    else if (p < 0.7) phase = "Gibbeuse Décroissante";
    else if (p < 0.8) phase = "Dernier Quartier";
    else phase = "Dernier Croissant";
    document.getElementById('moon-phase-disp').textContent = `${phase} (${(moonIllum.fraction * 100).toFixed(0)}%)`;
    
    // --- CALCUL DE LA POSITION FINALE (Soleil ou Lune) ---
    let finalPhi = pos.altitude;
    let finalAz = pos.azimuth;
    let sunIntensity = 0;
    let sunColor = new THREE.Color(0xffffff);
    let ambientIntensity = 0.4;

    if (altDeg > 2) {
        // Jour
        sunIntensity = Math.min(6.0, Math.sin(pos.altitude) * 10);
        sunColor.set(0xffffff);
        ambientIntensity = 0.2 + (Math.sin(pos.altitude) * 0.3);
    } else if (altDeg > -12) {
        // Crépuscule
        const t = (altDeg + 12) / 14; 
        sunIntensity = 0.2 + (t * 5.8);
        sunColor.lerpColors(new THREE.Color(0x9999ff), new THREE.Color(0xffaa44), t);
        ambientIntensity = 0.05 + (t * 0.15);
    } else {
        // Nuit (Lune)
        finalPhi = moonPos.altitude > 0 ? moonPos.altitude : Math.PI/8;
        finalAz = moonPos.azimuth;
        sunIntensity = 0.1 + (moonIllum.fraction * 0.4);
        sunColor.set(0x9999ff);
        ambientIntensity = 0.05 + (moonIllum.fraction * 0.05);
    }

    // --- APPLICATION AU MOTEUR ---
    const distance = 400000;
    const sunVector = new THREE.Vector3();
    sunVector.x = distance * Math.cos(finalPhi) * -Math.sin(finalAz);
    sunVector.y = distance * Math.sin(finalPhi);
    sunVector.z = distance * Math.cos(finalPhi) * Math.cos(finalAz);

    state.sunLight.position.copy(sunVector);
    state.sunLight.intensity = sunIntensity;
    state.sunLight.color.copy(sunColor);

    if (state.ambientLight) {
        state.ambientLight.intensity = ambientIntensity;
    }

    // Mise à jour du Ciel
    if (state.sky) {
        state.sky.material.uniforms['sunPosition'].value.copy(sunVector);
    }

    // Mise à jour du Brouillard (couleur ciel)
    if (state.scene.fog) {
        const fogColor = new THREE.Color();
        if (altDeg > 0) {
            fogColor.setHSL(0.6, 0.4, 0.4 + (Math.sin(pos.altitude) * 0.4));
        } else {
            fogColor.setHSL(0.6, 0.8, 0.05);
        }
        state.scene.fog.color.copy(fogColor);
    }
}
