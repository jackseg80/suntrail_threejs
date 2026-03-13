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

    // Détection des mobiles récents (S23, iPhone récents, Pixel) ou GPU intégrés corrects
    if (r.includes('apple') || r.includes('m1') || r.includes('m2') || r.includes('m3') || r.includes('iris xe')) {
        return 'performance';
    }

    // Mobiles haut de gamme Android (Adreno 7xx ou Mali-G7xx)
    if (r.includes('adreno (tm) 7') || r.includes('mali-g7')) {
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

    if (resDisp) resDisp.textContent = state.RESOLUTION.toString();
    if (rangeDisp) rangeDisp.textContent = state.RANGE.toString();
    if (resSlider) resSlider.value = state.RESOLUTION.toString();
    if (rangeSlider) rangeSlider.value = state.RANGE.toString();
    if (shadowToggle) shadowToggle.checked = state.SHADOWS;
    if (vegToggle) vegToggle.checked = state.SHOW_VEGETATION;
    if (poiToggle) poiToggle.checked = state.SHOW_SIGNPOSTS;

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
