import { state, PRESETS, PresetType, saveSettings } from './state';
import { showToast } from './utils';
import { updateShadowMapResolution } from './sun';
import { resetTerrain, updateVisibleTiles } from './terrain';

/**
 * Force le rechargement complet du terrain
 */
function refreshTerrain() {
    resetTerrain();
    updateVisibleTiles();
}

/**
 * Détecte les informations du GPU
 */
export function getGpuInfo(): { renderer: string, vendor: string } {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return { renderer: 'Unknown', vendor: 'Unknown' };
    
    const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return { renderer: 'Unknown', vendor: 'Unknown' };
    
    let renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    let vendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);

    if (renderer.includes('ANGLE')) {
        const parts = renderer.split(', ');
        if (parts.length > 1) renderer = parts[1];
    }

    return { renderer, vendor };
}

/**
 * Détecte le meilleur preset en fonction du matériel
 */
export function detectBestPreset(): PresetType {
    const gpu = getGpuInfo().renderer.toLowerCase();
    
    if (gpu.includes('rtx') || gpu.includes('apple m')) return 'ultra';
    if (gpu.includes('adreno') && (gpu.includes('750') || gpu.includes('800') || gpu.includes('elite'))) {
        return 'ultra';
    }
    
    if (gpu.includes('gtx') || gpu.includes('radeon') || (gpu.includes('adreno') && (gpu.includes('730') || gpu.includes('740')))) {
        return 'performance';
    }
    
    if (gpu.includes('adreno')) return 'balanced';
    if (gpu.includes('mali')) {
        // Le Galaxy A53 a un GPU Mali-G68. Si on a assez de coeurs CPU, on passe en STD (Balanced)
        if ((navigator.hardwareConcurrency || 0) >= 8) return 'balanced';
        return 'eco';
    }
    
    return 'eco';
}

/**
 * Applique un preset de performance (v5.4.1)
 */
export function applyPreset(preset: PresetType): void {
    if (preset === 'custom') {
        state.PERFORMANCE_PRESET = 'custom';
        updatePerformanceUI('custom');
        saveSettings();
        return;
    }

    const settings = PRESETS[preset];
    state.PERFORMANCE_PRESET = preset;
    
    state.RESOLUTION = settings.RESOLUTION;
    state.RANGE = settings.RANGE;
    state.SHADOWS = settings.SHADOWS;
    state.PIXEL_RATIO_LIMIT = settings.PIXEL_RATIO_LIMIT;
    state.SHOW_VEGETATION = settings.SHOW_VEGETATION;
    state.SHOW_SIGNPOSTS = settings.SHOW_SIGNPOSTS;
    state.SHOW_BUILDINGS = settings.SHOW_BUILDINGS;
    state.SHOW_HYDROLOGY = settings.SHOW_HYDROLOGY;
    state.SHOW_SLOPES = settings.SHOW_SLOPES;
    
    state.VEGETATION_DENSITY = settings.VEGETATION_DENSITY;
    state.BUILDING_LIMIT = settings.BUILDING_LIMIT;
    state.POI_ZOOM_THRESHOLD = settings.POI_ZOOM_THRESHOLD;
    state.BUILDING_ZOOM_THRESHOLD = settings.BUILDING_ZOOM_THRESHOLD;
    state.MAX_BUILDS_PER_CYCLE = settings.MAX_BUILDS_PER_CYCLE;
    state.LOAD_DELAY_FACTOR = settings.LOAD_DELAY_FACTOR;
    state.SHADOW_RES = settings.SHADOW_RES;

    state.SHOW_WEATHER = settings.SHOW_WEATHER;
    state.WEATHER_DENSITY = settings.WEATHER_DENSITY;
    state.WEATHER_SPEED = settings.WEATHER_SPEED;
    state.FOG_FAR = settings.FOG_FAR;

    if (preset === 'eco') {
        document.body.classList.add('mode-2d');
    } else {
        document.body.classList.remove('mode-2d');
    }

    if (state.sunLight) {
        state.sunLight.castShadow = state.SHADOWS;
        updateShadowMapResolution();
    }

    updatePerformanceUI(preset);
    refreshTerrain();
    saveSettings();
    showToast(`Profil appliqué : ${preset.toUpperCase()}`);
}

/**
 * Met à jour les éléments de l'interface
 */
export function updatePerformanceUI(preset: PresetType): void {
    const resSlider = document.getElementById('res-slider') as HTMLInputElement;
    const rangeSlider = document.getElementById('range-slider') as HTMLInputElement;
    const shadowToggle = document.getElementById('shadow-toggle') as HTMLInputElement;
    const vegToggle = document.getElementById('veg-toggle') as HTMLInputElement;
    const poiToggle = document.getElementById('poi-toggle') as HTMLInputElement;
    const buildingsToggle = document.getElementById('buildings-toggle') as HTMLInputElement;
    const hydroToggle = document.getElementById('hydro-toggle') as HTMLInputElement;
    const vegDensitySlider = document.getElementById('veg-density-slider') as HTMLInputElement;
    
    const resDisp = document.getElementById('res-disp');
    const rangeDisp = document.getElementById('range-disp');
    const vegDensityDisp = document.getElementById('veg-density-disp');
    const loadSpeedSelect = document.getElementById('load-speed-select') as HTMLSelectElement;
    
    const weatherDensitySlider = document.getElementById('weather-density-slider') as HTMLInputElement;
    const weatherDensityDisp = document.getElementById('weather-density-disp');
    const weatherSpeedSlider = document.getElementById('weather-speed-slider') as HTMLInputElement;
    const weatherSpeedDisp = document.getElementById('weather-speed-disp');

    if (resDisp) resDisp.textContent = state.RESOLUTION.toString();
    if (rangeDisp) rangeDisp.textContent = state.RANGE.toString();
    if (resSlider) resSlider.value = state.RESOLUTION.toString();
    if (rangeSlider) rangeSlider.value = state.RANGE.toString();
    if (shadowToggle) shadowToggle.checked = state.SHADOWS;
    if (vegToggle) vegToggle.checked = state.SHOW_VEGETATION;
    if (poiToggle) poiToggle.checked = state.SHOW_SIGNPOSTS;
    if (buildingsToggle) buildingsToggle.checked = state.SHOW_BUILDINGS;
    if (hydroToggle) hydroToggle.checked = state.SHOW_HYDROLOGY;
    
    const slopesToggle = document.getElementById('slopes-toggle') as HTMLInputElement;
    if (slopesToggle) slopesToggle.checked = state.SHOW_SLOPES;
    
    if (vegDensitySlider) vegDensitySlider.value = state.VEGETATION_DENSITY.toString();
    if (vegDensityDisp) vegDensityDisp.textContent = state.VEGETATION_DENSITY.toString();
    if (loadSpeedSelect) loadSpeedSelect.value = state.LOAD_DELAY_FACTOR.toString();

    if (weatherDensitySlider) weatherDensitySlider.value = state.WEATHER_DENSITY.toString();
    if (weatherDensityDisp) weatherDensityDisp.textContent = state.WEATHER_DENSITY.toString();
    if (weatherSpeedSlider) weatherSpeedSlider.value = state.WEATHER_SPEED.toString();
    if (weatherSpeedDisp) weatherSpeedDisp.textContent = state.WEATHER_SPEED.toFixed(1);

    const fogSlider = document.getElementById('fog-slider') as HTMLInputElement;
    if (fogSlider) fogSlider.value = (state.FOG_FAR / 1000).toString();

    const buttons = document.querySelectorAll('.preset-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('data-preset') === preset) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}
