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
    
    const az = pos.azimuth; 
    const alt = pos.altitude;
    const altDeg = alt * 180 / Math.PI;

    const moonAz = moonPos.azimuth;
    const moonAlt = moonPos.altitude;
    const moonAltDeg = moonAlt * 180 / Math.PI;
    
    document.getElementById('az-disp').textContent = ((az * 180 / Math.PI) + 180).toFixed(1);
    document.getElementById('alt-disp').textContent = altDeg.toFixed(1);

    // --- MISE À JOUR ÉPHÉMÉRIDES UI ---
    const times = SunCalc.getTimes(date, state.TARGET_LAT, state.TARGET_LON);
    const moonIllum = SunCalc.getMoonIllumination(date);
    
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
    
    // 1. Détermination de la source principale (Soleil ou Lune)
    let sunIntensity = 0;
    let skyColor = new THREE.Color();
    let sunColor = new THREE.Color();
    let ambientIntensity = 0.4;
    let finalPhi = alt;
    let finalAz = az;

    const colorDay = new THREE.Color(0x87CEEB);
    const colorSunset = new THREE.Color(0xff5f00); 
    const colorNight = new THREE.Color(0x050510); 
    
    const sunColorDay = new THREE.Color(0xffffff);
    const sunColorSunset = new THREE.Color(0xff7000); 
    const sunColorMoon = new THREE.Color(0x9999ff);

    if (altDeg > 5) {
        // Plein jour : Soleil
        sunIntensity = Math.min(2.5, Math.sin(alt) * 3);
        skyColor.copy(colorDay);
        sunColor.copy(sunColorDay);
        ambientIntensity = 0.5;
        finalPhi = alt;
        finalAz = az;
    } else if (altDeg > -12) {
        // Crépuscule : Transition Soleil -> Lune
        const t = (altDeg + 12) / 17; // 1 (jour) à 0 (nuit)
        sunIntensity = 0.25 + (t * 2.25);
        
        if (altDeg > 0) {
            skyColor.lerpColors(colorSunset, colorDay, altDeg / 5);
        } else {
            skyColor.lerpColors(colorNight, colorSunset, (altDeg + 12) / 12);
        }

        sunColor.lerpColors(sunColorMoon, sunColorDay, t);
        ambientIntensity = 0.1 + (t * 0.4); 
        
        const targetMoonPhi = moonAltDeg > 0 ? moonAlt : Math.PI / 8;
        const targetMoonAz = moonAltDeg > 0 ? moonAz : az;
        
        finalPhi = THREE.MathUtils.lerp(targetMoonPhi, alt, t);
        finalAz = THREE.MathUtils.lerp(targetMoonAz, az, t);
    } else {
        // Nuit : Lune réelle
        sunIntensity = 0.05 + (moonIllum.fraction * 0.25); 
        skyColor.copy(colorNight);
        sunColor.copy(sunColorMoon);
        ambientIntensity = 0.05 + (moonIllum.fraction * 0.05); 
        
        if (moonAltDeg > 0) {
            finalPhi = moonAlt;
            finalAz = moonAz;
        } else {
            finalPhi = Math.PI / 8; 
            finalAz = az;
        }
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
    state.sunLight.position.x = distance * Math.cos(finalPhi) * -Math.sin(finalAz);
    state.sunLight.position.y = distance * Math.sin(finalPhi);
    state.sunLight.position.z = distance * Math.cos(finalPhi) * Math.cos(finalAz);
}
