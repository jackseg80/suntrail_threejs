import * as THREE from 'three';
import SunCalc from 'suncalc';
import { state } from './state';
import { terrainUniforms } from './terrain';
import { i18n } from '../i18n/I18nService';

/**
 * SunTrail Sun Position & Lighting Engine (v5.5.12)
 * Fix: Transition fluide Heure Dorée -> Crépuscule -> Nuit.
 * Suppression du saut de luminosité et restauration des ombres rasantes.
 * Visibilité nocturne garantie (plancher 0.20).
 */

export function updateSunPosition(minutes: number): void {
    if (!state.sunLight || isNaN(minutes)) return;
    
    const date = new Date(state.simDate);
    date.setHours(Math.floor(minutes / 60), Math.floor(minutes % 60), 0, 0);
    
    const pos = SunCalc.getPosition(date, state.TARGET_LAT, state.TARGET_LON);
    const moonPos = SunCalc.getMoonPosition(date, state.TARGET_LAT, state.TARGET_LON);
    const moonIllum = SunCalc.getMoonIllumination(date);
    const altDeg = pos.altitude * 180 / Math.PI;
    
    // --- MISE À JOUR UI ---
    const timeDisp = document.getElementById('time-disp');
    if (timeDisp) timeDisp.textContent = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    const phaseSpan = document.getElementById('sun-phase');
    if (phaseSpan) {
        if (altDeg > 6) { phaseSpan.textContent = i18n.t('solar.phase.day'); phaseSpan.style.color = "#FFD700"; }
        else if (altDeg > -4) { phaseSpan.textContent = i18n.t('solar.phase.golden'); phaseSpan.style.color = "#FF8C00"; }
        else if (altDeg > -12) { phaseSpan.textContent = i18n.t('solar.phase.twilight'); phaseSpan.style.color = "#ADFF2F"; }
        else { phaseSpan.textContent = i18n.t('solar.phase.night'); phaseSpan.style.color = "#87CEEB"; }
    }

    // --- LOGIQUE DE LUMINOSITÉ ---
    let sunIntensity = 0;
    let sunColor = new THREE.Color(0xffffff);
    let ambientIntensity = 0.20;
    let ambientColor = new THREE.Color(0xeef5ff);
    
    const nightSunIntensity = 0.5 + (moonIllum.fraction * 1.0);
    const nightAmbientColor = new THREE.Color(0x444477);

    let phi = pos.altitude;
    let az = pos.azimuth;

    if (altDeg > 0) {
        // --- JOUR (incluant Heure Dorée) ---
        const t = Math.sin(pos.altitude);
        sunIntensity = 1.2 + (t * 8.8); 
        ambientIntensity = 0.25 + (t * 0.10);
        const colorT = Math.min(1, (altDeg + 4) / 10); 
        sunColor.lerpColors(new THREE.Color(0xff4400), new THREE.Color(0xffffff), colorT);
        ambientColor.lerpColors(new THREE.Color(0xd0d8ff), new THREE.Color(0xf0f4ff), t);
    } else if (altDeg > -12) {
        // --- CRÉPUSCULE (Transition vers la Lune) ---
        const t = (altDeg + 12) / 12; // 1 à l'horizon, 0 à la nuit
        
        const nightPhi = moonPos.altitude > 0 ? moonPos.altitude : Math.PI / 4;
        phi = THREE.MathUtils.lerp(nightPhi, 0.02, t); 
        az = THREE.MathUtils.lerp(moonPos.azimuth, pos.azimuth, t);
        
        sunIntensity = THREE.MathUtils.lerp(nightSunIntensity, 1.2, t);
        sunColor.lerpColors(new THREE.Color(0xadc7ff), new THREE.Color(0xff4400), t);
        
        ambientIntensity = 0.20 + (t * 0.05);
        ambientColor.lerpColors(nightAmbientColor, new THREE.Color(0xd0d8ff), t);
    } else {
        // --- NUIT ---
        phi = moonPos.altitude > 0 ? moonPos.altitude : Math.PI / 4;
        az = moonPos.azimuth;
        sunIntensity = nightSunIntensity;
        sunColor.setHex(0xadc7ff);
        ambientIntensity = 0.20;
        ambientColor.copy(nightAmbientColor);
    }

    const distance = 150000;
    const sunVector = new THREE.Vector3();
    sunVector.x = distance * Math.cos(phi) * -Math.sin(az);
    sunVector.y = distance * Math.sin(phi);
    sunVector.z = distance * Math.cos(phi) * Math.cos(az);

    terrainUniforms.uSunPos.value.copy(sunVector).normalize();

    if (state.sunLight) {
        if (state.controls?.target) {
            state.sunLight.position.set(state.controls.target.x + sunVector.x, state.controls.target.y + sunVector.y, state.controls.target.z + sunVector.z);
            state.sunLight.target.position.copy(state.controls.target);
            state.sunLight.target.updateMatrixWorld();
        } else {
            state.sunLight.position.copy(sunVector);
        }
        state.sunLight.intensity = sunIntensity;
        state.sunLight.color.copy(sunColor);
    }

    if (state.ambientLight) {
        state.ambientLight.intensity = ambientIntensity;
        state.ambientLight.color.copy(ambientColor);
    }

    if (state.sky) {
        const uniforms = state.sky.material.uniforms;
        uniforms['sunPosition'].value.copy(sunVector);
        const skyFactor = Math.pow(Math.max(0, Math.min(1, (altDeg + 15) / 30)), 0.5);
        uniforms['turbidity'].value = 1 + (skyFactor * 9);
        uniforms['rayleigh'].value = 0.1 + (skyFactor * 3.0);
        uniforms['mieCoefficient'].value = 0.005;
    }

    if (state.renderer) state.renderer.shadowMap.needsUpdate = true;

    if (state.scene?.fog && (state.scene.fog instanceof THREE.Fog || state.scene.fog instanceof THREE.FogExp2)) {
        const t = Math.max(0, (altDeg + 12) / 24);
        state.scene.fog.color.lerpColors(new THREE.Color(0x151530), new THREE.Color(0x87CEEB), t);
    }
}

export function updateShadowMapResolution(): void {
    if (!state.sunLight) return;
    const res = state.SHADOW_RES;
    state.sunLight.shadow.mapSize.set(res, res);
    if (state.sunLight.shadow.map) { state.sunLight.shadow.map.dispose(); state.sunLight.shadow.map = null; }
    if (state.renderer) state.renderer.shadowMap.needsUpdate = true;
}
