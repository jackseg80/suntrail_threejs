import * as THREE from 'three';
import SunCalc from 'suncalc';
import { state } from './state';
import { terrainUniforms } from './terrain';

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
    
    // --- MISE À JOUR INFOS ---
    const azVal = document.getElementById('az-val');
    if (azVal) azVal.textContent = `${azDeg.toFixed(1)}°`;
    
    const altVal = document.getElementById('alt-val');
    if (altVal) altVal.textContent = `${altDeg.toFixed(1)}°`;
    
    const sunNeedle = document.getElementById('sun-needle');
    if (sunNeedle) sunNeedle.style.transform = `translate(-50%, -50%) rotate(${azDeg}deg)`;

    const phaseSpan = document.getElementById('sun-phase');
    if (phaseSpan) {
        if (altDeg > 6) { phaseSpan.textContent = "☀️ Plein jour"; phaseSpan.style.color = "#FFD700"; }
        else if (altDeg > -4) { phaseSpan.textContent = "🌅 Heure Dorée"; phaseSpan.style.color = "#FF8C00"; }
        else if (altDeg > -6) { phaseSpan.textContent = "🌆 Heure Bleue"; phaseSpan.style.color = "#5F9EA0"; }
        else if (altDeg > -12) { phaseSpan.textContent = "🌌 Crépuscule civil"; phaseSpan.style.color = "#ADFF2F"; }
        else { phaseSpan.textContent = "🌙 Nuit"; phaseSpan.style.color = "#87CEEB"; }
    }

    const fmt = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    
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

    const phasesIcons = ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'];
    const phaseIdx = Math.floor(p * 8) % 8;

    // --- ENREGISTREMENT ET MISE À JOUR EXPERT (v5.4.5) ---
    state.ephemeris = {
        sunrise: fmt(times.sunrise),
        sunset: fmt(times.sunset),
        goldenHour: fmt(times.goldenHour),
        blueHour: fmt(times.dawn),
        moonPhaseText: moonPhaseText,
        moonPhaseIcon: phasesIcons[phaseIdx],
        moonIllum: Math.round(moonIllum.fraction * 100)
    };

    const exGolden = document.getElementById('ex-golden');
    if (exGolden) exGolden.textContent = state.ephemeris.goldenHour;
    const exBlue = document.getElementById('ex-blue');
    if (exBlue) exBlue.textContent = state.ephemeris.blueHour;
    const exMoonIcon = document.getElementById('ex-moon-icon');
    if (exMoonIcon) exMoonIcon.textContent = state.ephemeris.moonPhaseIcon;
    const exMoonText = document.getElementById('ex-moon-text');
    if (exMoonText) exMoonText.textContent = `${state.ephemeris.moonPhaseText} (${state.ephemeris.moonIllum}%)`;
    
    // --- POSITION FINALE POUR LE MOTEUR 3D (v5.5.2) ---
    let finalPhi = pos.altitude;
    let finalAz = pos.azimuth;
    let sunIntensity = 0;
    let sunColor = new THREE.Color(0xffffff);
    let ambientColor = new THREE.Color(0xffffff);
    let ambientIntensity = 0.2;

    if (altDeg > 6) {
        // PLEIN JOUR : Ombres adoucies (v5.5.6)
        // On remonte un peu l'ambiance (0.22 max) pour déboucher les ombres sans voile
        sunIntensity = Math.min(7.5, Math.sin(pos.altitude) * 15); 
        ambientIntensity = 0.10 + (Math.sin(pos.altitude) * 0.12); 
        sunColor.setHex(0xffffff); 
        ambientColor.setHex(0xeef5ff); 
    } else if (altDeg > -4) {
        // HEURE DORÉE
        const t = (altDeg + 4) / 10;
        sunIntensity = t * 7.0;
        sunColor.lerpColors(new THREE.Color(0xff4400), new THREE.Color(0xfffaef), t);
        ambientIntensity = 0.15 + (t * 0.05);
        ambientColor.setHex(0xf0f4ff);
    } else if (altDeg > -6) {
        // HEURE BLEUE / CRÉPUSCULE CIVIL
        const t = (altDeg + 6) / 2;
        sunIntensity = 0.4;
        sunColor.lerpColors(new THREE.Color(0x3344ff), new THREE.Color(0xff4400), t);
        ambientIntensity = 0.15 + (t * 0.05); // Minimum 0.15 pour garder de la visibilité
        ambientColor.setHex(0xc0d0ff);
    } else {
        // NUIT / LUNE (v5.5.4)
        // On force la lumière à venir du ciel (45°) même si la lune est couchée
        finalPhi = moonPos.altitude > 0 ? moonPos.altitude : Math.PI / 4;
        finalAz = moonPos.azimuth;
        
        // Intensité nocturne stable pour la navigation
        sunIntensity = 0.4 + (moonIllum.fraction * 0.6);
        sunColor.setHex(0xadc7ff); 
        
        // Ambiance nocturne boostée pour la lisibilité
        ambientIntensity = 0.25; 
        ambientColor.setHex(0x333366);
    }

    const distance = 150000;
    const sunVector = new THREE.Vector3();
    sunVector.x = distance * Math.cos(finalPhi) * -Math.sin(finalAz);
    sunVector.y = distance * Math.sin(finalPhi);
    sunVector.z = distance * Math.cos(finalPhi) * Math.cos(finalAz);

    terrainUniforms.uSunPos.value.copy(sunVector).normalize();

    if (state.controls?.target) {
        state.sunLight!.position.set(state.controls.target.x + sunVector.x, state.controls.target.y + sunVector.y, state.controls.target.z + sunVector.z);
        state.sunLight!.target.position.copy(state.controls.target);
        state.sunLight!.target.updateMatrixWorld();
    } else {
        state.sunLight!.position.copy(sunVector);
    }

    state.sunLight!.intensity = sunIntensity;
    state.sunLight!.color.copy(sunColor);
    if (state.ambientLight) {
        state.ambientLight.intensity = ambientIntensity;
        state.ambientLight.color.copy(ambientColor);
    }

    if (state.sky) {
        const uniforms = state.sky.material.uniforms;
        uniforms['sunPosition'].value.copy(sunVector);
        const dayFactor = Math.max(0, Math.min(1, (altDeg + 5) / 10));
        uniforms['turbidity'].value = 1 + (dayFactor * 9);
        uniforms['rayleigh'].value = 0.2 + (dayFactor * 2.8);
        uniforms['mieCoefficient'].value = 0.005;
    }

    if (state.renderer) state.renderer.shadowMap.needsUpdate = true;

    if (state.scene?.fog && (state.scene.fog instanceof THREE.Fog || state.scene.fog instanceof THREE.FogExp2)) {
        const fogColor = new THREE.Color();
        if (altDeg > 6) fogColor.setHSL(0.6, 0.4, 0.3 + (Math.sin(pos.altitude) * 0.5));
        else if (altDeg > -6) {
            const t = (altDeg + 6) / 12;
            const nightFog = new THREE.Color(0x1a1a2e); // Bleu nuit au lieu de noir
            const dayFog = new THREE.Color().setHSL(0.6, 0.4, 0.3);
            fogColor.lerpColors(nightFog, dayFog, t);
        } else fogColor.set(0x1a1a2e);
        state.scene.fog.color.copy(fogColor);
    }
}

export function updateShadowMapResolution(): void {
    if (!state.sunLight) return;
    const res = state.SHADOW_RES;
    state.sunLight.shadow.mapSize.set(res, res);
    if (state.sunLight.shadow.map) { state.sunLight.shadow.map.dispose(); state.sunLight.shadow.map = null; }
    if (state.renderer) state.renderer.shadowMap.needsUpdate = true;
}
