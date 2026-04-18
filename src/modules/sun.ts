import * as THREE from 'three';
import SunCalc from 'suncalc';
import { state } from './state';
import { terrainUniforms } from './terrain';
import { i18n } from '../i18n/I18nService';
import { eventBus } from './eventBus';
import { worldToLngLat } from './geo';

/**
 * SunTrail Sun Position & Lighting Engine (v5.5.12)
 * Fix: Transition fluide Heure Dorée -> Crépuscule -> Nuit.
 * Suppression du saut de luminosité et restauration des ombres rasantes.
 * Visibilité nocturne garantie (plancher 0.20).
 */

/** Last computed altitude in degrees — used to re-translate the phase label on locale change. */
let _lastAltDeg = 0;

// Objets pré-alloués — évite les allocations GC dans updateSun() appelé chaque frame
const _sunColor          = new THREE.Color();
const _ambientColor      = new THREE.Color();
const _nightAmbientColor = new THREE.Color(0x444477);
const _lerpA             = new THREE.Color();
const _lerpB             = new THREE.Color();
const _fogNight          = new THREE.Color(0x151530);
const _fogDay            = new THREE.Color(0x87CEEB);
const _sunVector         = new THREE.Vector3();

/** Apply the translated solar phase label to #sun-phase based on altitude. */
function applySolarPhaseLabel(altDeg: number): void {
    const phaseSpan = document.getElementById('sun-phase');
    if (!phaseSpan) return;
    if (altDeg > 6) { phaseSpan.textContent = i18n.t('solar.phase.day'); phaseSpan.style.color = "#FFD700"; }
    else if (altDeg > -4) { phaseSpan.textContent = i18n.t('solar.phase.golden'); phaseSpan.style.color = "#FF8C00"; }
    else if (altDeg > -12) { phaseSpan.textContent = i18n.t('solar.phase.twilight'); phaseSpan.style.color = "#ADFF2F"; }
    else { phaseSpan.textContent = i18n.t('solar.phase.night'); phaseSpan.style.color = "#87CEEB"; }
}

// Re-translate the solar phase label whenever the locale changes
eventBus.on('localeChanged', () => applySolarPhaseLabel(_lastAltDeg));

export function updateSunPosition(minutes: number): void {
    if (!state.sunLight || isNaN(minutes)) return;
    
    const date = new Date(state.simDate);
    date.setHours(Math.floor(minutes / 60), Math.floor(minutes % 60), 0, 0);
    
    // Utiliser la position réelle de la caméra (pas TARGET_LAT/LON qui est fixe)
    let lat = state.TARGET_LAT;
    let lon = state.TARGET_LON;
    if (state.controls?.target && state.originTile) {
        const gps = worldToLngLat(state.controls.target.x, state.controls.target.z, state.originTile);
        lat = gps.lat;
        lon = gps.lon;
    }

    const pos = SunCalc.getPosition(date, lat, lon);
    const moonPos = SunCalc.getMoonPosition(date, lat, lon);
    const moonIllum = SunCalc.getMoonIllumination(date);
    const altDeg = pos.altitude * 180 / Math.PI;
    _lastAltDeg = altDeg;
    
    // --- MISE À JOUR UI ---
    const timeDisp = document.getElementById('time-disp');
    if (timeDisp) timeDisp.textContent = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    applySolarPhaseLabel(altDeg);

    // --- LOGIQUE DE LUMINOSITÉ ---
    let sunIntensity = 0;
    _sunColor.setHex(0xffffff);
    let ambientIntensity = 0.20;
    _ambientColor.setHex(0xeef5ff);

    const nightSunIntensity = 0.5 + (moonIllum.fraction * 1.0);

    let phi = pos.altitude;
    let az = pos.azimuth;

    if (altDeg > 0) {
        // --- JOUR (incluant Heure Dorée) ---
        const t = Math.sin(pos.altitude);
        sunIntensity = 1.2 + (t * 8.8);
        ambientIntensity = 0.25 + (t * 0.10);
        const colorT = Math.min(1, (altDeg + 4) / 10);
        _sunColor.lerpColors(_lerpA.setHex(0xff4400), _lerpB.setHex(0xffffff), colorT);
        _ambientColor.lerpColors(_lerpA.setHex(0xd0d8ff), _lerpB.setHex(0xf0f4ff), t);
    } else if (altDeg > -12) {
        // --- CRÉPUSCULE (Transition vers la Lune) ---
        const t = (altDeg + 12) / 12; // 1 à l'horizon, 0 à la nuit

        const nightPhi = moonPos.altitude > 0 ? moonPos.altitude : Math.PI / 4;
        phi = THREE.MathUtils.lerp(nightPhi, 0.02, t);
        az = THREE.MathUtils.lerp(moonPos.azimuth, pos.azimuth, t);

        sunIntensity = THREE.MathUtils.lerp(nightSunIntensity, 1.2, t);
        _sunColor.lerpColors(_lerpA.setHex(0xadc7ff), _lerpB.setHex(0xff4400), t);

        ambientIntensity = 0.20 + (t * 0.05);
        _ambientColor.lerpColors(_nightAmbientColor, _lerpA.setHex(0xd0d8ff), t);
    } else {
        // --- NUIT ---
        phi = moonPos.altitude > 0 ? moonPos.altitude : Math.PI / 4;
        az = moonPos.azimuth;
        sunIntensity = nightSunIntensity;
        _sunColor.setHex(0xadc7ff);
        ambientIntensity = 0.20;
        _ambientColor.copy(_nightAmbientColor);
    }

    const distance = 150000;
    _sunVector.x = distance * Math.cos(phi) * -Math.sin(az);
    _sunVector.y = distance * Math.sin(phi);
    _sunVector.z = distance * Math.cos(phi) * Math.cos(az);

    terrainUniforms.uSunPos.value.copy(_sunVector).normalize();

    if (state.sunLight) {
        if (state.controls?.target) {
            state.sunLight.position.set(state.controls.target.x + _sunVector.x, state.controls.target.y + _sunVector.y, state.controls.target.z + _sunVector.z);
            state.sunLight.target.position.copy(state.controls.target);
            state.sunLight.target.updateMatrixWorld();
        } else {
            state.sunLight.position.copy(_sunVector);
        }
        state.sunLight.intensity = sunIntensity;
        state.sunLight.color.copy(_sunColor);

        // Shadow camera dynamique par RANGE — adapte le frustum au terrain visible (v5.16.9, v5.31.1 tightened)
        if (state.SHADOWS && state.sunLight.shadow) {
            const tileSizeMeters = 40075000 / Math.pow(2, state.ZOOM);
            // v5.31.1 : Tighter per-preset caps to reduce GPU cost on mobile
            const maxShadowExtent = state.PERFORMANCE_PRESET === 'balanced' ? 15000
                : state.PERFORMANCE_PRESET === 'performance' ? 25000
                : 30000; // ultra
            const extent = Math.max(2000, Math.min(state.RANGE * tileSizeMeters * 0.8, maxShadowExtent));
            const cam = state.sunLight.shadow.camera;
            if (Math.abs(cam.right - extent) > 500) {
                cam.left = -extent; cam.right = extent;
                cam.top = extent; cam.bottom = -extent;
                cam.updateProjectionMatrix();
            }
        }
    }

    if (state.ambientLight) {
        state.ambientLight.intensity = ambientIntensity;
        state.ambientLight.color.copy(_ambientColor);
    }

    if (state.sky) {
        const uniforms = state.sky.material.uniforms;
        uniforms['sunPosition'].value.copy(_sunVector);
        const skyFactor = Math.pow(Math.max(0, Math.min(1, (altDeg + 15) / 30)), 0.5);
        uniforms['turbidity'].value = 1 + (skyFactor * 9);
        uniforms['rayleigh'].value = 0.1 + (skyFactor * 3.0);
        uniforms['mieCoefficient'].value = 0.005;
    }

    if (state.renderer) state.renderer.shadowMap.needsUpdate = true;

    if (state.scene?.fog && (state.scene.fog instanceof THREE.Fog || state.scene.fog instanceof THREE.FogExp2)) {
        const t = Math.max(0, (altDeg + 12) / 24);
        state.scene.fog.color.lerpColors(_fogNight, _fogDay, t);
    }
}

export function updateShadowMapResolution(): void {
    if (!state.sunLight) return;
    const res = state.SHADOW_RES;
    state.sunLight.shadow.mapSize.set(res, res);
    if (state.sunLight.shadow.map) { state.sunLight.shadow.map.dispose(); state.sunLight.shadow.map = null; }
    if (state.renderer) state.renderer.shadowMap.needsUpdate = true;
}
