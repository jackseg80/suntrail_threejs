import { state, PRESETS, PresetType } from './state';
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

    // Nettoyage ANGLE pour plus de clarté
    if (renderer.includes('ANGLE')) {
        const parts = renderer.split(', ');
        if (parts.length > 1) renderer = parts[1]; // Souvent le 2ème élément contient la puce réelle
    }

    return { renderer, vendor };
}

/**
 * Détecte le meilleur preset en fonction du matériel
 */
export function detectBestPreset(): PresetType {
    const gpu = getGpuInfo().renderer.toLowerCase();
    
    // 1. Profil ULTRA : Flagships 2024+ et Desktop
    if (gpu.includes('rtx') || gpu.includes('apple m')) return 'ultra';
    if (gpu.includes('adreno') && (gpu.includes('750') || gpu.includes('800') || gpu.includes('elite'))) {
        return 'ultra';
    }
    
    // 2. Profil PERFORMANCE : Flagships récents (S22, S23, Adreno 730/740)
    if (gpu.includes('gtx') || gpu.includes('radeon') || (gpu.includes('adreno') && (gpu.includes('730') || gpu.includes('740')))) {
        return 'performance';
    }
    
    // 3. Profil BALANCED : Snapdragon milieu de gamme (Adreno série 600)
    if (gpu.includes('adreno')) {
        return 'balanced';
    }

    // 4. Cas critique : GPU MALI (Samsung Série A, Redmi, etc.)
    if (gpu.includes('mali')) {
        return 'eco';
    }
    
    return 'eco';
}

/**
 * Applique un preset de performance
 */
export function applyPreset(preset: PresetType): void {
    if (preset === 'custom') {
        state.PERFORMANCE_PRESET = 'custom';
        updatePerformanceUI('custom');
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
    
    // Nouveaux paramètres (v4.3.27)
    state.VEGETATION_DENSITY = settings.VEGETATION_DENSITY;
    state.BUILDING_BATCH_SIZE = settings.BUILDING_BATCH_SIZE;
    state.MAX_BUILDS_PER_CYCLE = settings.MAX_BUILDS_PER_CYCLE;
    state.LOAD_DELAY_FACTOR = settings.LOAD_DELAY_FACTOR;
    state.SHADOW_RES = settings.SHADOW_RES;

    // Paramètres météo (v4.4)
    state.SHOW_WEATHER = settings.SHOW_WEATHER;
    state.WEATHER_DENSITY = settings.WEATHER_DENSITY;
    state.WEATHER_SPEED = settings.WEATHER_SPEED;
    state.FOG_FAR = settings.FOG_FAR;

    // Mise à jour de l'UI (Masquage timeline et options 3D)
    if (preset === 'eco') {
        document.body.classList.add('mode-2d');
    } else {
        document.body.classList.remove('mode-2d');
    }

    // Mise à jour dynamique des ombres
    if (state.sunLight) {
        state.sunLight.castShadow = state.SHADOWS;
        updateShadowMapResolution();
    }

    updatePerformanceUI(preset);
    refreshTerrain();
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
    
    // Nouveaux contrôles (v4.3.27)
    if (vegDensitySlider) vegDensitySlider.value = state.VEGETATION_DENSITY.toString();
    if (vegDensityDisp) vegDensityDisp.textContent = state.VEGETATION_DENSITY.toString();
    if (loadSpeedSelect) loadSpeedSelect.value = state.LOAD_DELAY_FACTOR.toString();

    // Météo (v4.4)
    if (weatherDensitySlider) weatherDensitySlider.value = state.WEATHER_DENSITY.toString();
    if (weatherDensityDisp) weatherDensityDisp.textContent = state.WEATHER_DENSITY.toString();
    if (weatherSpeedSlider) weatherSpeedSlider.value = state.WEATHER_SPEED.toString();
    if (weatherSpeedDisp) weatherSpeedDisp.textContent = state.WEATHER_SPEED.toFixed(1);

    // Voile atmosphérique (v4.5.54)
    const fogSlider = document.getElementById('fog-slider') as HTMLInputElement;
    if (fogSlider) fogSlider.value = (state.FOG_FAR / 1000).toString();

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
