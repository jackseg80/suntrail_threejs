import * as THREE from 'three';
import SunCalc from 'suncalc';
import { state } from './state.js';

export function updateSunPosition(minutes) {
    if (!state.sunLight) return;
    
    const totalMinutes = Math.floor(minutes);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    
    document.getElementById('time-disp').textContent = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    
    const date = new Date(state.simDate);
    date.setHours(hours, mins, 0, 0);
    
    const pos = SunCalc.getPosition(date, state.TARGET_LAT, state.TARGET_LON);
    const moonPos = SunCalc.getMoonPosition(date, state.TARGET_LAT, state.TARGET_LON);
    const moonIllum = SunCalc.getMoonIllumination(date);
    const times = SunCalc.getTimes(date, state.TARGET_LAT, state.TARGET_LON);
    
    const altDeg = pos.altitude * 180 / Math.PI;
    const azDeg = (pos.azimuth * 180 / Math.PI) + 180;
    
    // --- MISE À JOUR INFOS PRÉCISES ---
    document.getElementById('az-val').textContent = `${azDeg.toFixed(1)}°`;
    document.getElementById('alt-val').textContent = `${altDeg.toFixed(1)}°`;
    
    // Boussole Solaire (Radar)
    const sunNeedle = document.getElementById('sun-needle');
    if (sunNeedle) sunNeedle.style.transform = `translate(-50%, -50%) rotate(${azDeg}deg)`;

    // Phase du soleil
    const phaseSpan = document.getElementById('sun-phase');
    if (altDeg > 5) {
        phaseSpan.textContent = "☀️ Plein jour";
        phaseSpan.style.color = "#FFD700";
    } else if (altDeg > 0) {
        phaseSpan.textContent = "🌅 Lever/Coucher";
        phaseSpan.style.color = "#FF8C00";
    } else if (altDeg > -6) {
        phaseSpan.textContent = "🌆 Crépuscule civil";
        phaseSpan.style.color = "#ADFF2F";
    } else {
        phaseSpan.textContent = "🌙 Nuit";
        phaseSpan.style.color = "#87CEEB";
    }

    // Durée du jour
    const diff = times.sunset - times.sunrise;
    const dayHrs = Math.floor(diff / 3600000);
    const dayMins = Math.floor((diff % 3600000) / 60000);
    document.getElementById('day-duration').textContent = `${dayHrs}h${String(dayMins).padStart(2, '0')}`;

    // Éphémérides classiques
    const fmt = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    document.getElementById('sunrise-disp').textContent = fmt(times.sunrise);
    document.getElementById('sunset-disp').textContent = fmt(times.sunset);
    
    let moonPhaseText = "Inconnue";
    const p = moonIllum.phase;
    if (p < 0.05 || p > 0.95) moonPhaseText = "Nouvelle";
    else if (p < 0.2) moonPhaseText = "Premier Croissant";
    else if (p < 0.3) moonPhaseText = "Premier Quartier";
    else if (p < 0.45) moonPhaseText = "Gibbeuse Croissante";
    else if (p < 0.55) moonPhaseText = "Pleine";
    else if (p < 0.7) moonPhaseText = "Gibbeuse Décroissante";
    else if (p < 0.8) moonPhaseText = "Dernier Quartier";
    else moonPhaseText = "Dernier Croissant";
    document.getElementById('moon-phase-disp').textContent = `${moonPhaseText} (${(moonIllum.fraction * 100).toFixed(0)}%)`;
    
    // --- POSITION FINALE POUR LE MOTEUR 3D ---
    let finalPhi = pos.altitude;
    let finalAz = pos.azimuth;
    let sunIntensity = 0;
    let sunColor = new THREE.Color(0xffffff);
    let ambientIntensity = 0.3;

    if (altDeg > 1) {
        sunIntensity = Math.min(6.0, Math.sin(pos.altitude) * 12);
        ambientIntensity = 0.2 + (Math.sin(pos.altitude) * 0.4);
    } else if (altDeg > -12) {
        const t = (altDeg + 12) / 13; 
        sunIntensity = t * 6.0;
        sunColor.lerpColors(new THREE.Color(0x9999ff), new THREE.Color(0xffaa44), t);
        ambientIntensity = 0.05 + (t * 0.15);
    } else {
        finalPhi = moonPos.altitude > 0 ? moonPos.altitude : -Math.PI/4;
        finalAz = moonPos.azimuth;
        sunIntensity = 0.1 + (moonIllum.fraction * 0.5);
        sunColor.set(0x9999ff);
        ambientIntensity = 0.05 + (moonIllum.fraction * 0.05);
    }

    const distance = 40000;
    const sunVector = new THREE.Vector3();
    sunVector.x = distance * Math.cos(finalPhi) * -Math.sin(finalAz);
    sunVector.y = distance * Math.sin(finalPhi);
    sunVector.z = distance * Math.cos(finalPhi) * Math.cos(finalAz);

    state.sunLight.position.copy(sunVector);
    state.sunLight.intensity = sunIntensity;
    state.sunLight.color.copy(sunColor);
    if (state.ambientLight) state.ambientLight.intensity = ambientIntensity;

    if (state.sky) {
        const uniforms = state.sky.material.uniforms;
        uniforms['sunPosition'].value.copy(sunVector);
        const dayFactor = Math.max(0, Math.min(1, (altDeg + 5) / 10));
        uniforms['turbidity'].value = 1 + (dayFactor * 9);
        uniforms['rayleigh'].value = 0.2 + (dayFactor * 2.8);
        uniforms['mieCoefficient'].value = 0.005;
    }

    if (state.scene.fog) {
        const fogColor = new THREE.Color();
        if (altDeg > 0) {
            fogColor.setHSL(0.6, 0.4, 0.3 + (Math.sin(pos.altitude) * 0.5));
        } else {
            fogColor.setHSL(0.6, 0.8, 0.05);
        }
        state.scene.fog.color.copy(fogColor);
    }
}
