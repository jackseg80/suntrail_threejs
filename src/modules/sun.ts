import * as THREE from 'three';
import SunCalc from 'suncalc';
import { state } from './state';

export function updateSunPosition(minutes: number): void {
    if (!state.sunLight || isNaN(minutes)) return;
    
    const totalMinutes = Math.floor(minutes);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    
    const timeDisp = document.getElementById('time-disp');
    if (timeDisp) timeDisp.textContent = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    
    const date = new Date(state.simDate);
    date.setHours(hours, mins, 0, 0);
    
    const pos = SunCalc.getPosition(date, state.TARGET_LAT, state.TARGET_LON);
    const moonPos = SunCalc.getMoonPosition(date, state.TARGET_LAT, state.TARGET_LON);
    const moonIllum = SunCalc.getMoonIllumination(date);
    const times = SunCalc.getTimes(date, state.TARGET_LAT, state.TARGET_LON);
    
    const altDeg = pos.altitude * 180 / Math.PI;
    const azDeg = (pos.azimuth * 180 / Math.PI) + 180;
    
    // --- MISE À JOUR INFOS (Sécurisée) ---
    const azVal = document.getElementById('az-val');
    if (azVal) azVal.textContent = `${azDeg.toFixed(1)}°`;
    
    const altVal = document.getElementById('alt-val');
    if (altVal) altVal.textContent = `${altDeg.toFixed(1)}°`;
    
    const sunNeedle = document.getElementById('sun-needle');
    if (sunNeedle) sunNeedle.style.transform = `translate(-50%, -50%) rotate(${azDeg}deg)`;

    const phaseSpan = document.getElementById('sun-phase');
    if (phaseSpan) {
        if (altDeg > 6) {
            phaseSpan.textContent = "☀️ Plein jour";
            phaseSpan.style.color = "#FFD700";
        } else if (altDeg > -4) {
            phaseSpan.textContent = "🌅 Heure Dorée";
            phaseSpan.style.color = "#FF8C00";
        } else if (altDeg > -6) {
            phaseSpan.textContent = "🌆 Heure Bleue";
            phaseSpan.style.color = "#5F9EA0";
        } else if (altDeg > -12) {
            phaseSpan.textContent = "🌌 Crépuscule civil";
            phaseSpan.style.color = "#ADFF2F";
        } else {
            phaseSpan.textContent = "🌙 Nuit";
            phaseSpan.style.color = "#87CEEB";
        }
    }

    const dayDuration = document.getElementById('day-duration');
    if (dayDuration) {
        const diff = times.sunset.getTime() - times.sunrise.getTime();
        const dayHrs = Math.floor(diff / 3600000);
        const dayMins = Math.floor((diff % 3600000) / 60000);
        dayDuration.textContent = `${dayHrs}h${String(dayMins).padStart(2, '0')}`;
    }

    const fmt = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const sunriseDisp = document.getElementById('sunrise-disp');
    if (sunriseDisp) sunriseDisp.textContent = fmt(times.sunrise);
    
    const sunsetDisp = document.getElementById('sunset-disp');
    if (sunsetDisp) sunsetDisp.textContent = fmt(times.sunset);
    
    const moonDisp = document.getElementById('moon-phase-disp');
    if (moonDisp) {
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
        moonDisp.textContent = `${moonPhaseText} (${(moonIllum.fraction * 100).toFixed(0)}%)`;
    }
    
    // --- POSITION FINALE POUR LE MOTEUR 3D ---
    let finalPhi = pos.altitude;
    let finalAz = pos.azimuth;
    let sunIntensity = 0;
    let sunColor = new THREE.Color(0xffffff);
    let ambientIntensity = 0.3;

    if (altDeg > 6) {
        // Plein jour
        sunIntensity = Math.min(6.0, Math.sin(pos.altitude) * 12);
        ambientIntensity = 0.2 + (Math.sin(pos.altitude) * 0.4);
        sunColor.set(0xffffff);
    } else if (altDeg > -4) {
        // Heure Dorée (Transition entre jour et crépuscule)
        const t = (altDeg + 4) / 10; // 0 à 1 entre -4° et 6°
        sunIntensity = t * 6.0;
        sunColor.lerpColors(new THREE.Color(0xff4400), new THREE.Color(0xffffff), t);
        ambientIntensity = 0.1 + (t * 0.1);
    } else if (altDeg > -6) {
        // Heure Bleue (Ambiance froide)
        const t = (altDeg + 6) / 2; // 0 à 1 entre -6° et -4°
        sunIntensity = 0.2; // Faible lumière résiduelle
        sunColor.lerpColors(new THREE.Color(0x3344ff), new THREE.Color(0xff4400), t);
        ambientIntensity = 0.05 + (t * 0.05);
    } else {
        // Nuit / Lune
        finalPhi = moonPos.altitude > 0 ? moonPos.altitude : -Math.PI/4;
        finalAz = moonPos.azimuth;
        sunIntensity = 0.1 + (moonIllum.fraction * 0.5);
        sunColor.set(0x9999ff);
        ambientIntensity = 0.05 + (moonIllum.fraction * 0.05);
    }

    const distance = 150000;
    const sunVector = new THREE.Vector3();
    sunVector.x = distance * Math.cos(finalPhi) * -Math.sin(finalAz);
    sunVector.y = distance * Math.sin(finalPhi);
    sunVector.z = distance * Math.cos(finalPhi) * Math.cos(finalAz);

    if (state.controls && state.controls.target) {
        state.sunLight.position.set(
            state.controls.target.x + sunVector.x,
            state.controls.target.y + sunVector.y,
            state.controls.target.z + sunVector.z
        );
        state.sunLight.target.position.copy(state.controls.target);
        state.sunLight.target.updateMatrixWorld();
    } else {
        state.sunLight.position.copy(sunVector);
    }

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

    if (state.scene && state.scene.fog && (state.scene.fog instanceof THREE.FogExp2 || state.scene.fog instanceof THREE.Fog)) {
        const fogColor = new THREE.Color();
        if (altDeg > 6) {
            fogColor.setHSL(0.6, 0.4, 0.3 + (Math.sin(pos.altitude) * 0.5));
        } else if (altDeg > -6) {
            // Transition vers l'heure bleue/dorée
            const t = (altDeg + 6) / 12; // 0 à 1 entre -6° et 6°
            const nightFog = new THREE.Color(0x050510);
            const dayFog = new THREE.Color().setHSL(0.6, 0.4, 0.3);
            fogColor.lerpColors(nightFog, dayFog, t);
        } else {
            fogColor.set(0x050510);
        }
        state.scene.fog.color.copy(fogColor);
    }
}
