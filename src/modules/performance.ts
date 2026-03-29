import { state, PRESETS, PresetType, saveSettings } from './state';
import { showToast } from './utils';
import { updateShadowMapResolution } from './sun';
import { resetTerrain, updateVisibleTiles } from './terrain';
import { trimCache } from './tileCache';
import { i18n } from '../i18n/I18nService';

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
 * Détecte le meilleur preset selon le GPU et la plateforme (v5.11).
 *
 * Tiers GPU → Preset :
 *   ultra       : PC haut de gamme (RTX, RX 6000+, GTX 1060+), Apple M, Snapdragon Elite (Adreno 830)
 *   performance : Flagship mobile (Adreno 740/750), mid-range PC (GTX 1050, RX 480), Apple A-series, Mali-G78
 *   balanced    : Mid-range 2020-2022 (Adreno 6xx, Mali-G68/G76, Intel HD 6xx, Iris, AMD Vega iGPU)
 *   eco         : Tout le reste (vieux mobile, Intel HD 4xx/5xx, GPU inconnu)
 *
 * Fallback inconnu : CPU ≥8 cores → balanced, sinon eco.
 */
export function detectBestPreset(): PresetType {
    const gpu = getGpuInfo().renderer.toLowerCase();

    // ── Tier ULTRA ─────────────────────────────────────────────────────────────
    // PC haut de gamme, Apple M, Snapdragon Elite

    // Snapdragon 8 Elite → Adreno 830+
    if (gpu.includes('adreno') && /83[0-9]/.test(gpu)) return 'ultra';
    // Apple M1/M2/M3/M4 (MacBook, iPad Pro M)
    if (gpu.includes('apple m'))                        return 'ultra';
    // NVIDIA RTX (toutes générations)
    if (gpu.includes('rtx'))                            return 'ultra';
    // Intel Arc (A-series discret)
    if (gpu.includes('arc a'))                          return 'ultra';
    // AMD RX RDNA (RX 5000 / 6000 / 7000)
    if (/radeon rx [5-9]\d{3}/.test(gpu))              return 'ultra';
    // AMD RX Polaris haute (RX 480, 580, 590 → 4[7-9]x / 5[7-9]x)
    if (/radeon rx [45][7-9]\d/.test(gpu))             return 'ultra';
    // NVIDIA GTX 10 Series (1060 et +) + GTX 16 Series (1650, 1660)
    if (/gtx\s*1[0-9][6-9]\d/.test(gpu))              return 'ultra';
    if (/gtx\s*10[6-9]\d/.test(gpu))                  return 'ultra';

    // ── Tier HIGH / Performance ────────────────────────────────────────────────
    // Flagship mobile (S23 / Adreno 740), mid-range PC (GTX 1050, RX 470)

    // Snapdragon 8 Gen 2/3 → Adreno 740/750/800
    if (gpu.includes('adreno') && /7[4-9]\d|80\d/.test(gpu)) return 'performance';
    // Apple iPhone A-series (A15/A16/A17) — "apple gpu" générique sur iOS
    if (gpu.includes('apple'))                          return 'performance';
    // Mali-G78/G710/G715 (Dimensity 9000, Exynos 2200)
    if (gpu.includes('mali') && /g7[89]|g710|g715/.test(gpu)) return 'performance';
    // NVIDIA GTX 1050 / 1050 Ti
    if (/gtx\s*105\d/.test(gpu))                      return 'performance';
    // NVIDIA GTX 970/980
    if (/gtx\s*9[78]\d/.test(gpu))                    return 'performance';
    // AMD RX Polaris basse (RX 460/470)
    if (/radeon rx [45][4-6]\d/.test(gpu))             return 'performance';
    // AMD Radeon R9 (R9 280X, 290, 390…)
    if (gpu.includes('radeon') && gpu.includes('r9'))  return 'performance';
    // Intel Iris Xe (Tiger Lake 11th gen+)
    if (gpu.includes('iris') && gpu.includes('xe'))    return 'performance';

    // ── Tier STD / Balanced ────────────────────────────────────────────────────
    // Mid-range 2020-2022 (A53, Intel HD 620, AMD Vega iGPU)

    // Adreno 660/642/619/618/720/730 (Snapdragon 7 Gen, SD 780G, mid-range 2021-2023)
    if (gpu.includes('adreno') && /6[0-9]\d|72\d|73\d/.test(gpu)) return 'balanced';
    // Mali-G68/G76/G57/G72 (A53, Dimensity 1xxx, Exynos 12xx)
    if (gpu.includes('mali') && /g68|g76|g57|g72/.test(gpu)) return 'balanced';
    // Mali générique avec ≥8 cores CPU (mid-range probable)
    if (gpu.includes('mali') && (navigator.hardwareConcurrency || 0) >= 8) return 'balanced';
    // NVIDIA GTX 950/960
    if (/gtx\s*9[56]\d/.test(gpu))                    return 'balanced';
    // AMD Radeon Vega iGPU (Vega 3/8/11 des APU Ryzen)
    if (gpu.includes('radeon') && gpu.includes('vega')) return 'balanced';
    // AMD Radeon R7 (iGPU ou discret bas de gamme)
    if (gpu.includes('radeon') && gpu.includes('r7'))  return 'balanced';
    // AMD Radeon générique sans série identifiée (fallback)
    if (gpu.includes('radeon') && !gpu.includes('rx')) return 'balanced';
    // Intel HD/UHD 6xx (6th–8th gen Core : HD 620/630, UHD 620/630)
    if (gpu.includes('intel') && /(?:hd|uhd)[\s()]*(?:graphics[\s()]*)?6\d\d/.test(gpu)) return 'balanced';
    // Intel HD 520/530/540 (5th–6th gen)
    if (gpu.includes('intel') && /(?:hd|uhd)[\s()]*(?:graphics[\s()]*)?5[2-9]\d/.test(gpu)) return 'balanced';
    // Intel Iris (hors Xe : Iris Plus 5th-10th gen)
    if (gpu.includes('iris'))                          return 'balanced';
    // GPU inconnu mais CPU puissant → probablement un PC ou mobile récent masqué (Firefox)
    if ((navigator.hardwareConcurrency || 0) >= 8)    return 'balanced';

    // ── Tier ECO ───────────────────────────────────────────────────────────────
    // Tout le reste : vieux Adreno 5xx, Mali-G52-, Intel HD 4xx/3xx, inconnu CPU faible
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
    state.VEGETATION_CAST_SHADOW = settings.VEGETATION_CAST_SHADOW;
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

    // Ajustements mobiles (v5.11) — uniquement les réglages qui diffèrent entre mobile et PC.
    // Les tiers eco/balanced/performance ont déjà des valeurs calibrées pour mobile dans PRESETS.
    // Seul Ultra conserve des caps car ses valeurs sont dimensionnées pour PC bureau.
    const isMobilePreset = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth <= 768;
    if (isMobilePreset) {
        // ENERGY_SAVER par tier (v5.11 Phase 2 design intent) :
        // - eco/balanced  : 30fps par défaut — mid-range, autonomie prioritaire
        // - performance   : 60fps par défaut — flagship, l'utilisateur a payé pour les perfs
        // - ultra         : 60fps — PC/Snapdragon Elite (inchangé)
        // L'utilisateur peut toujours basculer manuellement via le toggle Réglages Avancés.
        if (preset === 'eco' || preset === 'balanced') state.ENERGY_SAVER = true;

        // Ultra mobile (Snapdragon Elite) : réduire légèrement par rapport au PC bureau
        if (preset === 'ultra') {
            if (state.SHADOW_RES > 2048) state.SHADOW_RES = 2048; // 4096 → 2048
            if (state.RANGE > 8)         state.RANGE = 8;          // 12 → 8
        }

        // DPR : 3× OLED n'apporte rien pour la carto, coût GPU ×2.25 inutile
        if (state.PIXEL_RATIO_LIMIT > 2.0) state.PIXEL_RATIO_LIMIT = 2.0;

        // Purge des textures GPU excédentaires (limite du cache réduite pour mobile)
        trimCache();
    }

    if (preset === 'eco') {
        document.body.classList.add('mode-2d');
        state.IS_2D_MODE = true;
        // Fermer la timeline si elle est ouverte (inutile en 2D)
        const bottomBar = document.getElementById('bottom-bar');
        if (bottomBar && document.body.classList.contains('timeline-open')) {
            document.body.classList.remove('timeline-open');
            bottomBar.classList.remove('is-open');
        }
    } else {
        document.body.classList.remove('mode-2d');
        // Ne pas réinitialiser IS_2D_MODE ici — l'utilisateur peut vouloir garder le 2D
        // (le bouton 2D/3D dans la nav bar est la seule source de vérité)
    }

    if (state.sunLight) {
        state.sunLight.castShadow = state.SHADOWS;
        updateShadowMapResolution();
    }
    
    if (state.renderer) {
        state.renderer.setPixelRatio(state.PIXEL_RATIO_LIMIT);
    }

    // Gate Freemium : LOD plafonné à 14 pour les utilisateurs gratuits (v5.12)
    if (!state.isPro && state.MAX_ALLOWED_ZOOM > 14) {
        state.MAX_ALLOWED_ZOOM = 14;
    }

    updatePerformanceUI(preset);
    refreshTerrain();
    saveSettings();
    showToast(i18n.t('preset.applied', { preset: preset.toUpperCase() }));
}

/**
 * Applique des réglages personnalisés chargés (v5.7.1)
 */
export function applyCustomSettings(settings: any): void {
    state.PERFORMANCE_PRESET = 'custom';
    
    // Assignation des valeurs au state
    if (settings.RESOLUTION) state.RESOLUTION = settings.RESOLUTION;
    if (settings.RANGE) state.RANGE = settings.RANGE;
    if (settings.SHADOWS !== undefined) state.SHADOWS = settings.SHADOWS;
    if (settings.SHOW_VEGETATION !== undefined) state.SHOW_VEGETATION = settings.SHOW_VEGETATION;
    if (settings.VEGETATION_DENSITY !== undefined) state.VEGETATION_DENSITY = settings.VEGETATION_DENSITY;
    if (settings.SHOW_WEATHER !== undefined) state.SHOW_WEATHER = settings.SHOW_WEATHER;
    if (settings.WEATHER_DENSITY !== undefined) state.WEATHER_DENSITY = settings.WEATHER_DENSITY;
    if (settings.WEATHER_SPEED !== undefined) state.WEATHER_SPEED = settings.WEATHER_SPEED;
    if (settings.FOG_FAR !== undefined) state.FOG_FAR = settings.FOG_FAR;

    // Mise à jour visuelle
    updatePerformanceUI('custom');
    
    if (state.sunLight) {
        state.sunLight.castShadow = state.SHADOWS;
        updateShadowMapResolution();
    }
    
    if (state.renderer) {
        state.renderer.setPixelRatio(state.PIXEL_RATIO_LIMIT);
    }

    refreshTerrain();
}

/**
 * Initialise la surveillance de la batterie pour forcer le mode Éco
 */
export function initBatteryManager(): void {
    if ('getBattery' in navigator) {
        navigator.getBattery().then(battery => {
            const checkBattery = () => {
                if (battery.level < 0.20 && state.PERFORMANCE_PRESET !== 'eco') {
                    showToast(i18n.t('preset.lowBattery'));
                    applyPreset('eco');
                }
            };
            battery.addEventListener('levelchange', checkBattery);
            checkBattery(); // Vérification initiale
        }).catch(() => {
            // Ignorer silencieusement si l'API n'est pas autorisée
        });
    }
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
