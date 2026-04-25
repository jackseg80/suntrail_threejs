import { state, PRESETS, PresetType, saveSettings } from './state';
import { showToast } from './toast';
import { updateShadowMapResolution } from './sun';
import { refreshTerrain, refreshTracks } from './terrain';
import { trimCache } from './tileCache';
import { i18n } from '../i18n/I18nService';

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
 * Détecte le meilleur preset selon le GPU et la plateforme
 */
export function detectBestPreset(): PresetType {
    const gpu = getGpuInfo().renderer.toLowerCase();

    if (gpu.includes('adreno') && /83[0-9]/.test(gpu)) return 'ultra';
    if (gpu.includes('apple m'))                        return 'ultra';
    if (gpu.includes('rtx'))                            return 'ultra';
    if (gpu.includes('arc a'))                          return 'ultra';
    if (/radeon rx [5-9]\d{3}/.test(gpu))              return 'ultra';
    if (/radeon rx [45][7-9]\d/.test(gpu))             return 'ultra';
    if (/gtx\s*1[0-9][6-9]\d/.test(gpu))              return 'ultra';
    if (/gtx\s*10[6-9]\d/.test(gpu))                  return 'ultra';

    if (gpu.includes('adreno') && /7[3-9]\d|80\d/.test(gpu)) return 'performance';
    if (gpu.includes('apple'))                          return 'performance';
    if (gpu.includes('mali') && /g7[89]|g710|g715/.test(gpu)) return 'performance';
    if (/gtx\s*105\d/.test(gpu))                      return 'performance';
    if (/gtx\s*9[78]\d/.test(gpu))                    return 'performance';
    if (/radeon rx [45][4-6]\d/.test(gpu))             return 'performance';
    if (gpu.includes('radeon') && gpu.includes('r9'))  return 'performance';
    if (gpu.includes('iris') && gpu.includes('xe'))    return 'performance';

    if (gpu.includes('adreno') && /6[0-9]\d|7[0-2]\d/.test(gpu)) return 'balanced';
    if (gpu.includes('mali') && /g68|g76|g57|g72/.test(gpu)) return 'balanced';
    if (gpu.includes('mali') && (navigator.hardwareConcurrency || 0) >= 8) return 'balanced';
    if (/gtx\s*9[56]\d/.test(gpu))                    return 'balanced';
    if (gpu.includes('radeon') && gpu.includes('vega')) return 'balanced';
    if (gpu.includes('radeon') && gpu.includes('r7'))  return 'balanced';
    if (gpu.includes('radeon') && !gpu.includes('rx')) return 'balanced';
    if (gpu.includes('intel') && /(?:hd|uhd)[\s()]*(?:graphics[\s()]*)?6\d\d/.test(gpu)) return 'balanced';
    if (gpu.includes('intel') && /(?:hd|uhd)[\s()]*(?:graphics[\s()]*)?5[2-9]\d/.test(gpu)) return 'balanced';
    if (gpu.includes('iris'))                          return 'balanced';
    if ((navigator.hardwareConcurrency || 0) >= 8)    return 'balanced';

    return 'eco';
}

/**
 * Applique un preset de performance
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
    state.VEGETATION_CAST_SHADOW = settings.VEGETATION_CAST_SHADOW;
    state.BUILDINGS_SHADOWS = settings.BUILDINGS_SHADOWS;
    state.BUILDING_LIMIT = settings.BUILDING_LIMIT;
    state.POI_ZOOM_THRESHOLD = settings.POI_ZOOM_THRESHOLD;
    state.BUILDING_ZOOM_THRESHOLD = settings.BUILDING_ZOOM_THRESHOLD;
    state.MAX_BUILDS_PER_CYCLE = settings.MAX_BUILDS_PER_CYCLE;
    state.LOAD_DELAY_FACTOR = settings.LOAD_DELAY_FACTOR;
    state.MAX_ALLOWED_ZOOM = settings.MAX_ALLOWED_ZOOM;
    state.SHADOW_RES = settings.SHADOW_RES;

    state.SHOW_WEATHER = settings.SHOW_WEATHER;
    state.WEATHER_DENSITY = settings.WEATHER_DENSITY;
    state.WEATHER_SPEED = settings.WEATHER_SPEED;
    state.FOG_FAR = settings.FOG_FAR;

    const isMobilePreset = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth <= 768;
    if (isMobilePreset) {
        if (preset === 'ultra') {
            if (state.SHADOW_RES > 2048) state.SHADOW_RES = 2048;
            if (state.RANGE > 8)         state.RANGE = 8;
        }
        if (state.PIXEL_RATIO_LIMIT > 2.0) state.PIXEL_RATIO_LIMIT = 2.0;
        trimCache();
    }

    if (preset === 'eco') {
        state.IS_2D_MODE = true;
        const bottomBar = document.getElementById('bottom-bar');
        if (bottomBar && document.body.classList.contains('timeline-open')) {
            document.body.classList.remove('timeline-open');
            bottomBar.classList.remove('is-open');
        }
    }

    document.body.classList.toggle('mode-2d', state.IS_2D_MODE);
    document.body.classList.toggle('preset-eco', preset === 'eco');

    if (state.sunLight) {
        state.sunLight.castShadow = state.SHADOWS;
        updateShadowMapResolution();
    }
    
    if (state.renderer) {
        state.renderer.setPixelRatio(state.PIXEL_RATIO_LIMIT);
    }

    updatePerformanceUI(preset);
    refreshTerrain();
    refreshTracks();
    
    setTimeout(() => refreshTracks(), 500);

    saveSettings();
    showToast(i18n.t('preset.applied', { preset: preset.toUpperCase() }));
}

/**
 * Applique des réglages personnalisés
 */
export function applyCustomSettings(settings: any): void {
    state.PERFORMANCE_PRESET = 'custom';
    
    if (settings.RESOLUTION) state.RESOLUTION = settings.RESOLUTION;
    if (settings.RANGE) state.RANGE = settings.RANGE;
    if (settings.SHADOWS !== undefined) state.SHADOWS = settings.SHADOWS;
    if (settings.SHOW_VEGETATION !== undefined) state.SHOW_VEGETATION = settings.SHOW_VEGETATION;
    if (settings.VEGETATION_DENSITY !== undefined) state.VEGETATION_DENSITY = settings.VEGETATION_DENSITY;
    if (settings.SHOW_WEATHER !== undefined) state.SHOW_WEATHER = settings.SHOW_WEATHER;
    if (settings.WEATHER_DENSITY !== undefined) state.WEATHER_DENSITY = settings.WEATHER_DENSITY;
    if (settings.WEATHER_SPEED !== undefined) state.WEATHER_SPEED = settings.WEATHER_SPEED;
    if (settings.FOG_FAR !== undefined) state.FOG_FAR = settings.FOG_FAR;

    updatePerformanceUI('custom');
    
    if (state.sunLight) {
        state.sunLight.castShadow = state.SHADOWS;
        updateShadowMapResolution();
    }
    
    if (state.renderer) {
        state.renderer.setPixelRatio(state.PIXEL_RATIO_LIMIT);
    }

    refreshTerrain();
    refreshTracks();
    setTimeout(() => refreshTracks(), 500);
}

let lowFpsCount = 0;
let highFpsCount = 0;
let isDynamicallyThrottled = false;
let originalDPR = 1.0;

/**
 * Surveillance intelligente des FPS
 */
export function checkPerformanceThrottle(fps: number): void {
    if (state.isProcessingTiles || state.isFlyingTo) {
        lowFpsCount = 0;
        return;
    }

    if (fps > 0 && fps < 15) {
        lowFpsCount++;
        highFpsCount = 0;

        if (lowFpsCount >= 10 && !isDynamicallyThrottled) {
            originalDPR = state.PIXEL_RATIO_LIMIT;
            if (originalDPR > 1.0) {
                state.PIXEL_RATIO_LIMIT = 1.0;
                if (state.renderer) state.renderer.setPixelRatio(1.0);
                isDynamicallyThrottled = true;
                showToast(i18n.t('performance.adaptiveActive'), 4000);
            }
            lowFpsCount = 0;
        }
    } 
    else if (fps >= 40 && isDynamicallyThrottled) {
        highFpsCount++;
        lowFpsCount = 0;

        if (highFpsCount >= 5) {
            state.PIXEL_RATIO_LIMIT = originalDPR;
            if (state.renderer) state.renderer.setPixelRatio(originalDPR);
            isDynamicallyThrottled = false;
            highFpsCount = 0;
        }
    }
    else {
        lowFpsCount = 0;
        highFpsCount = 0;
    }
}

/**
 * Initialise la surveillance de la batterie
 */
export function initBatteryManager(): void {
    if ('getBattery' in navigator) {
        (navigator as any).getBattery().then((battery: any) => {
            const checkBattery = () => {
                if (battery.level < 0.20 && state.PERFORMANCE_PRESET !== 'eco') {
                    showToast(i18n.t('preset.lowBattery'));
                    applyPreset('eco');
                }
            };
            battery.addEventListener('levelchange', checkBattery);
            checkBattery();
        }).catch(() => {});
    }
}

/**
 * Met à jour les éléments de l'interface (Sécurisé contre les éléments absents)
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

/**
 * RÉINITIALISATION (Pour les tests unitaires uniquement)
 */
export function _resetPerformanceCounters(): void {
    lowFpsCount = 0;
    highFpsCount = 0;
    isDynamicallyThrottled = false;
}
