import { state, PRESETS, PresetType } from './state';
import { showToast } from './utils';

/**
 * Détecte les informations du GPU
 */
export function getGpuInfo(): { renderer: string, vendor: string } {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext;
    if (!gl) return { renderer: 'Unknown', vendor: 'Unknown' };

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return { renderer: 'Unknown', vendor: 'Unknown' };

    return {
        renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
        vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
    };
}

/**
 * Détermine le meilleur preset en fonction du matériel
 */
export function detectBestPreset(): PresetType {
    const { renderer } = getGpuInfo();
    const r = renderer.toLowerCase();

    // Détection des GPU haute performance (NVIDIA/AMD dédiés)
    if (r.includes('nvidia') || r.includes('geforce') || r.includes('rtx') || r.includes('radeon')) {
        if (r.includes('rtx') || r.includes('6000') || r.includes('7000')) return 'ultra';
        return 'performance';
    }

    // Mobiles ultra haut de gamme (Snapdragon Elite / Adreno 8xx, Apple M-series)
    if (r.includes('adreno (tm) 8') || r.includes('m2') || r.includes('m3') || r.includes('m4')) {
        return 'ultra';
    }

    // Mobiles haut de gamme Android (Adreno 7xx ou Mali-G7xx/G8xx) ou Apple M1
    if (r.includes('adreno (tm) 7') || r.includes('mali-g7') || r.includes('mali-g8') || r.includes('apple m1')) {
        return 'performance';
    }

    // GPU intégrés Intel standards ou mobiles milieu de gamme
    if (r.includes('intel') || r.includes('adreno') || r.includes('mali') || r.includes('graphics')) {
        return 'balanced';
    }

    // Par défaut
    return 'eco';
}

/**
 * Applique un preset de performance
 */
export function applyPreset(preset: PresetType): void {
    if (preset === 'custom') {
        state.PERFORMANCE_PRESET = 'custom';
        return;
    }

    const settings = PRESETS[preset];
    state.PERFORMANCE_PRESET = preset;
    state.RESOLUTION = settings.RESOLUTION;
    state.RANGE = settings.RANGE;
    state.SHADOWS = settings.SHADOWS;
    state.SHADOW_RES = settings.SHADOW_RES;
    state.PIXEL_RATIO_LIMIT = settings.PIXEL_RATIO_LIMIT;
    state.SHOW_VEGETATION = settings.SHOW_VEGETATION;
    state.SHOW_SIGNPOSTS = settings.SHOW_SIGNPOSTS;
    state.SHOW_BUILDINGS = settings.SHOW_BUILDINGS;
    
    // Nouveaux paramètres (v4.3.27)
    state.VEGETATION_DENSITY = settings.VEGETATION_DENSITY;
    state.BUILDING_BATCH_SIZE = settings.BUILDING_BATCH_SIZE;
    state.MAX_BUILDS_PER_CYCLE = settings.MAX_BUILDS_PER_CYCLE;
    state.LOAD_DELAY_FACTOR = settings.LOAD_DELAY_FACTOR;

    // Mise à jour dynamique des ombres (v4.3.13)
    if (state.sunLight) {
        state.sunLight.castShadow = state.SHADOWS;
        state.sunLight.shadow.mapSize.set(state.SHADOW_RES, state.SHADOW_RES);
        if (state.sunLight.shadow.map) {
            state.sunLight.shadow.map.dispose();
            state.sunLight.shadow.map = null as any; 
        }
        
        // --- FORCE RECALCUL UNIQUE (v4.3.29) ---
        // On force le moteur à recalculer la Shadow Map une fois avec les nouveaux réglages
        if (state.renderer) {
            state.renderer.shadowMap.needsUpdate = true;
        }
    }

    // Mise à jour de l'UI si nécessaire (ex: sliders)
    updatePerformanceUI(preset);
    
    showToast(`Mode Performance : ${preset.toUpperCase()}`);
}

/**
 * Met à jour les éléments de l'UI liés à la performance
 */
function updatePerformanceUI(preset: PresetType): void {
    const resDisp = document.getElementById('res-disp');
    const rangeDisp = document.getElementById('range-disp');
    const resSlider = document.getElementById('res-slider') as HTMLInputElement;
    const rangeSlider = document.getElementById('range-slider') as HTMLInputElement;
    const shadowToggle = document.getElementById('shadow-toggle') as HTMLInputElement;
    const vegToggle = document.getElementById('veg-toggle') as HTMLInputElement;
    const poiToggle = document.getElementById('poi-toggle') as HTMLInputElement;
    const buildingsToggle = document.getElementById('buildings-toggle') as HTMLInputElement;
    const vegDensitySlider = document.getElementById('veg-density-slider') as HTMLInputElement;
    const vegDensityDisp = document.getElementById('veg-density-disp');
    const loadSpeedSelect = document.getElementById('load-speed-select') as HTMLSelectElement;

    if (resDisp) resDisp.textContent = state.RESOLUTION.toString();
    if (rangeDisp) rangeDisp.textContent = state.RANGE.toString();
    if (resSlider) resSlider.value = state.RESOLUTION.toString();
    if (rangeSlider) rangeSlider.value = state.RANGE.toString();
    if (shadowToggle) shadowToggle.checked = state.SHADOWS;
    if (vegToggle) vegToggle.checked = state.SHOW_VEGETATION;
    if (poiToggle) poiToggle.checked = state.SHOW_SIGNPOSTS;
    if (buildingsToggle) buildingsToggle.checked = state.SHOW_BUILDINGS;
    
    // Nouveaux contrôles (v4.3.27)
    if (vegDensitySlider) vegDensitySlider.value = state.VEGETATION_DENSITY.toString();
    if (vegDensityDisp) vegDensityDisp.textContent = state.VEGETATION_DENSITY.toString();
    if (loadSpeedSelect) loadSpeedSelect.value = state.LOAD_DELAY_FACTOR.toString();

    // Mise en évidence du bouton de preset actif
    const buttons = document.querySelectorAll('.preset-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('data-preset') === preset) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}
