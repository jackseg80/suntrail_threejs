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
    const moonPos = SunCalc.getMoonPosition(date, state.TARGET_LAT, state.TARGET_LON);
    
    const az = pos.azimuth; 
    const alt = pos.altitude;
    const altDeg = alt * 180 / Math.PI;

    const moonAz = moonPos.azimuth;
    const moonAlt = moonPos.altitude;
    const moonAltDeg = moonAlt * 180 / Math.PI;
    
    document.getElementById('az-disp').textContent = ((az * 180 / Math.PI) + 180).toFixed(1);
    document.getElementById('alt-disp').textContent = altDeg.toFixed(1);
    
    // 1. Détermination de la source principale (Soleil ou Lune)
    let sunIntensity = 0;
    let skyColor = new THREE.Color();
    let sunColor = new THREE.Color();
    let ambientIntensity = 0.4;
    let finalPhi = alt;
    let finalAz = az;

    const colorDay = new THREE.Color(0x87CEEB);
    const colorSunset = new THREE.Color(0xff8c2e); // Orange plus lumineux
    const colorNight = new THREE.Color(0x1a1a3a); // Nuit plus claire
    
    const sunColorDay = new THREE.Color(0xffffff);
    const sunColorSunset = new THREE.Color(0xffb040); // Solaire plus chaud
    const sunColorMoon = new THREE.Color(0xccccff);

    if (altDeg > 5) {
        // Plein jour : Soleil
        sunIntensity = Math.min(3.0, Math.sin(alt) * 3.5);
        skyColor.copy(colorDay);
        sunColor.copy(sunColorDay);
        ambientIntensity = 0.6;
        finalPhi = alt;
        finalAz = az;
    } else if (altDeg > -12) {
        // Crépuscule : Transition Soleil -> Lune
        const t = (altDeg + 12) / 17; // 1 (jour) à 0 (nuit)
        sunIntensity = 0.5 + (t * 2.5); // Boosté
        
        if (altDeg > 0) {
            skyColor.lerpColors(colorSunset, colorDay, altDeg / 5);
        } else {
            skyColor.lerpColors(colorNight, colorSunset, (altDeg + 12) / 12);
        }

        sunColor.lerpColors(sunColorMoon, sunColorDay, t);
        ambientIntensity = 0.45 + (t * 0.15); // Ambiante boostée
        
        // Transition de position (vers la Lune si elle est visible, sinon vers une position haute par défaut)
        const targetMoonPhi = moonAltDeg > 0 ? moonAlt : Math.PI / 7;
        const targetMoonAz = moonAltDeg > 0 ? moonAz : az;
        
        finalPhi = THREE.MathUtils.lerp(targetMoonPhi, alt, t);
        finalAz = THREE.MathUtils.lerp(targetMoonAz, az, t);
    } else {
        // Nuit : Lune réelle (ou secours si pas de lune)
        sunIntensity = 0.5; // Lune bien visible
        skyColor.copy(colorNight);
        sunColor.copy(sunColorMoon);
        ambientIntensity = 0.45; // Nuit claire
        
        if (moonAltDeg > 0) {
            finalPhi = moonAlt;
            finalAz = moonAz;
        } else {
            // Pas de lune visible : on garde une lumière fixe en hauteur pour voir le relief
            finalPhi = Math.PI / 7; 
            finalAz = az; // On garde l'azimut du soleil pour une rotation cohérente
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
