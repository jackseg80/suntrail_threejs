import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { createReactiveState } from './ui/core/ReactiveState';
import type { VRAMDashboard } from './ui/components/VRAMDashboard';
import { LocationPoint } from './geo';
import { showToast } from './toast';

export type PresetType = 'eco' | 'balanced' | 'performance' | 'ultra' | 'custom';

export interface GPXLayer {
    id: string;
    name: string;
    color: string;
    visible: boolean;
    rawData: Record<string, any>;
    points: THREE.Vector3[];
    mesh: THREE.Mesh | null;
    stats: {
        distance: number;
        dPlus: number;
        dMinus: number;
        pointCount: number;
        estimatedTime?: number;
    };
}

export const GPX_COLORS = ['#3b7ef8','#22c55e','#f97316','#a855f7','#ec4899','#06b6d4','#eab308','#ef4444'];

export interface PerformanceSettings {
    RESOLUTION: number;
    RANGE: number;
    SHADOWS: boolean;
    SHADOW_RES: number;
    readonly PIXEL_RATIO_LIMIT: number;
    SHOW_VEGETATION: boolean;
    SHOW_SIGNPOSTS: boolean;
    SHOW_BUILDINGS: boolean;
    SHOW_HYDROLOGY: boolean;
    BUILDINGS_SHADOWS: boolean; 
    MAX_ALLOWED_ZOOM: number;    
    VEGETATION_DENSITY: number;  
    VEGETATION_CAST_SHADOW: boolean;
    BUILDING_LIMIT: number;      
    POI_ZOOM_THRESHOLD: number;  
    BUILDING_ZOOM_THRESHOLD: number; 
    MAX_BUILDS_PER_CYCLE: number; 
    LOAD_DELAY_FACTOR: number;   
    SHOW_WEATHER: boolean;       
    WEATHER_DENSITY: number;     
    WEATHER_SPEED: number;       
    FOG_FAR: number;             
    SHOW_SLOPES: boolean;
}

export const PRESETS: Record<Exclude<PresetType, 'custom'>, PerformanceSettings> = {
    eco: {
        RESOLUTION: 2, RANGE: 3, SHADOWS: false, SHADOW_RES: 128, PIXEL_RATIO_LIMIT: 1.0,
        SHOW_VEGETATION: false, SHOW_SIGNPOSTS: false, SHOW_BUILDINGS: false, SHOW_HYDROLOGY: false, BUILDINGS_SHADOWS: false,
        MAX_ALLOWED_ZOOM: 18, VEGETATION_DENSITY: 0, BUILDING_LIMIT: 0, POI_ZOOM_THRESHOLD: 16, BUILDING_ZOOM_THRESHOLD: 17,
        MAX_BUILDS_PER_CYCLE: 2, LOAD_DELAY_FACTOR: 2.0, SHOW_WEATHER: false, WEATHER_DENSITY: 0, WEATHER_SPEED: 1.0,
        FOG_FAR: 25000, SHOW_SLOPES: false, VEGETATION_CAST_SHADOW: false
    },
    balanced: {
        RESOLUTION: 64, RANGE: 5, SHADOWS: true, SHADOW_RES: 512, PIXEL_RATIO_LIMIT: 1.2,
        SHOW_VEGETATION: true, SHOW_SIGNPOSTS: true, SHOW_BUILDINGS: true, SHOW_HYDROLOGY: true, BUILDINGS_SHADOWS: false,
        MAX_ALLOWED_ZOOM: 18, VEGETATION_DENSITY: 1500, VEGETATION_CAST_SHADOW: false,
        BUILDING_LIMIT: 40, POI_ZOOM_THRESHOLD: 15, BUILDING_ZOOM_THRESHOLD: 14,
        MAX_BUILDS_PER_CYCLE: 4, LOAD_DELAY_FACTOR: 1.2, SHOW_WEATHER: true, WEATHER_DENSITY: 1000,
        WEATHER_SPEED: 1.0, FOG_FAR: 40000, SHOW_SLOPES: false
    },
    performance: {
        RESOLUTION: 160, RANGE: 6, SHADOWS: true, SHADOW_RES: 1024, PIXEL_RATIO_LIMIT: 1.5,
        SHOW_VEGETATION: true, SHOW_SIGNPOSTS: true, SHOW_BUILDINGS: true, SHOW_HYDROLOGY: true, BUILDINGS_SHADOWS: true,
        MAX_ALLOWED_ZOOM: 18, VEGETATION_DENSITY: 5000, VEGETATION_CAST_SHADOW: true,
        BUILDING_LIMIT: 80, POI_ZOOM_THRESHOLD: 15, BUILDING_ZOOM_THRESHOLD: 14,
        MAX_BUILDS_PER_CYCLE: 6, LOAD_DELAY_FACTOR: 0.5, SHOW_WEATHER: true, WEATHER_DENSITY: 5000, WEATHER_SPEED: 1.2,
        FOG_FAR: 60000, SHOW_SLOPES: false
    },
    ultra: {
        get PIXEL_RATIO_LIMIT() { return typeof window !== 'undefined' ? window.devicePixelRatio : 1; },
        RESOLUTION: 256, RANGE: 12, SHADOWS: true, SHADOW_RES: 4096,
        SHOW_VEGETATION: true, SHOW_SIGNPOSTS: true, SHOW_BUILDINGS: true, SHOW_HYDROLOGY: true, BUILDINGS_SHADOWS: true,
        MAX_ALLOWED_ZOOM: 18, VEGETATION_DENSITY: 8000, VEGETATION_CAST_SHADOW: true,
        BUILDING_LIMIT: 150, POI_ZOOM_THRESHOLD: 15, BUILDING_ZOOM_THRESHOLD: 14,
        MAX_BUILDS_PER_CYCLE: 12, LOAD_DELAY_FACTOR: 0.2, SHOW_WEATHER: true, WEATHER_DENSITY: 15000, WEATHER_SPEED: 1.5,
        FOG_FAR: 100000, SHOW_SLOPES: false
    } as PerformanceSettings
};

export interface Peak {
    id: number;
    name: string;
    lat: number;
    lon: number;
    ele: number;
}

export type AppLocale = 'fr' | 'de' | 'it' | 'en';
export type ThemePreference = 'light' | 'dark' | 'auto';

export interface State {
    lang: AppLocale;
    themePreference: ThemePreference;
    ENERGY_SAVER: boolean;
    MK: string;
    MAP_SOURCE: string;
    hasManualSource: boolean;
    PERFORMANCE_PRESET: PresetType;
    RESOLUTION: number;
    RANGE: number;
    PIXEL_RATIO_LIMIT: number;
    LOAD_DELAY_FACTOR: number;
    SHOW_TRAILS: boolean;
    SHOW_SLOPES: boolean;
    SHOW_SIGNPOSTS: boolean;
    SHOW_BUILDINGS: boolean;
    SHOW_HYDROLOGY: boolean;
    SHOW_VEGETATION: boolean;
    SHOW_WEATHER: boolean;
    SHOW_WEATHER_PRO: boolean;
    SHOW_DEBUG: boolean;
    SHOW_STATS: boolean;
    SHOW_INCLINOMETER: boolean;
    USE_WORKERS: boolean;
    SHADOWS: boolean;
    SHADOW_RES: number;
    VEGETATION_DENSITY: number;
    VEGETATION_CAST_SHADOW: boolean;
    BUILDINGS_SHADOWS: boolean;
    BUILDING_LIMIT: number;
    POI_ZOOM_THRESHOLD: number;
    BUILDING_ZOOM_THRESHOLD: number;
    MAX_BUILDS_PER_CYCLE: number;
    MAX_ALLOWED_ZOOM: number;
    TARGET_LAT: number;
    TARGET_LON: number;
    initialLat: number;
    initialLon: number;
    ZOOM: number;
    RELIEF_EXAGGERATION: number;
    FOG_NEAR: number;
    FOG_FAR: number;
    originTile: { x: number; y: number; z: number };
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    renderer: THREE.WebGLRenderer | null;
    controls: OrbitControls | MapControls | null;
    sunLight: THREE.DirectionalLight | null;
    ambientLight: THREE.AmbientLight | null;
    sky: Sky | null;
    stats: any | null; 
    vramPanel: VRAMDashboard | null;
    simDate: Date;
    isSunAnimating: boolean;
    animationSpeed: number;
    lastWeatherLat: number;
    lastWeatherLon: number;
    currentWeather: 'clear' | 'rain' | 'snow';
    weatherIntensity: number;
    WEATHER_DENSITY: number;
    WEATHER_SPEED: number;
    weatherData: {
        temp: number; apparentTemp: number; windSpeed: number; windDir: number;
        windDirDeg?: number;
        windGusts?: number; dewPoint?: number;
        humidity: number; cloudCover: number; locationName?: string;
        freezingLevel?: number; uvIndex?: number; visibility?: number; precProb?: number;
        hourly?: { time: string; temp: number; code: number; precip?: number }[];
        daily?: {
            date: string;
            tempMax: number;
            tempMin: number;
            precipSum: number;
            precipProbMax: number;
            windSpeedMax: number;
            windGustsMax: number;
            windDirDominant: number;
            uvIndexMax: number;
            code: number;
        }[];
    } | null;
    weatherUnavailable: boolean;
    ephemeris: {
        sunrise: string; sunset: string; goldenHour: string; blueHour: string;
        moonPhaseText: string; moonPhaseIcon: string; moonIllum: number;
    } | null;
    localPeaks: Peak[];
    gpxLayers: GPXLayer[];
    activeGPXLayerId: string | null;
    recordedMesh: THREE.Mesh | null;
    profileMarker: THREE.Mesh | null;
    trailProgress: number;
    isFollowingTrail: boolean;
    isFlyingTo: boolean;
    isTiltTransitioning: boolean;
    isRecording: boolean;
    isPaused: boolean;
    recordingStartTime: number | null; // v5.29.1 : Persistance du temps de REC
    currentCourseId: string | null;
    recordedPoints: LocationPoint[];
    recoveredPoints: LocationPoint[] | null;
    userLocation: { lat: number; lon: number; alt: number } | null;
    userLocationAccuracy: number | null;
    userHeading: number | null;
    isFollowingUser: boolean;
    userMarker: THREE.Group | null;
    smoothUserPos: THREE.Vector3;
    smoothUserHeading: number;
    lastTrackingUpdate: number;
    IS_OFFLINE: boolean;
    isNetworkAvailable: boolean;
    connectionType: string;
    isMapTilerDisabled: boolean;
    networkRequests: number;
    cacheHits: number;
    uiVisible: boolean;
    isInteractingWithUI: boolean;
    isUserInteracting: boolean;
    isProcessingTiles: boolean;
    IS_2D_MODE: boolean;
    currentFPS: number;
    lastUIInteraction: number;
    lastClickedCoords: { x: number; z: number; alt: number };
    hasLastClicked: boolean;
    isFlying: boolean;
    isPro: boolean;
    trialEnd: number | null;
    purchasedPacks: string[];
    installedPacks: string[];
    DEBUG_MODE: boolean; // v5.29.6 : Contrôle des logs sensibles
}

const initialState: State = {
    lang: 'fr',
    themePreference: 'auto',
    ENERGY_SAVER: false,
    MK: '', MAP_SOURCE: 'swisstopo', hasManualSource: false,
    PERFORMANCE_PRESET: 'balanced', RESOLUTION: PRESETS.balanced.RESOLUTION, RANGE: PRESETS.balanced.RANGE,
    PIXEL_RATIO_LIMIT: PRESETS.balanced.PIXEL_RATIO_LIMIT, LOAD_DELAY_FACTOR: PRESETS.balanced.LOAD_DELAY_FACTOR,
    SHOW_TRAILS: false, SHOW_SLOPES: false, SHOW_SIGNPOSTS: PRESETS.balanced.SHOW_SIGNPOSTS,
    SHOW_BUILDINGS: PRESETS.balanced.SHOW_BUILDINGS, SHOW_HYDROLOGY: PRESETS.balanced.SHOW_HYDROLOGY, SHOW_VEGETATION: true, SHOW_WEATHER: PRESETS.balanced.SHOW_WEATHER, SHOW_WEATHER_PRO: true,
    SHOW_DEBUG: true, SHOW_STATS: false, SHOW_INCLINOMETER: true, USE_WORKERS: true, SHADOWS: PRESETS.balanced.SHADOWS, SHADOW_RES: PRESETS.balanced.SHADOW_RES,
    VEGETATION_DENSITY: PRESETS.balanced.VEGETATION_DENSITY,
    VEGETATION_CAST_SHADOW: PRESETS.balanced.VEGETATION_CAST_SHADOW,
    BUILDINGS_SHADOWS: PRESETS.balanced.BUILDINGS_SHADOWS,
    BUILDING_LIMIT: PRESETS.balanced.BUILDING_LIMIT,
    POI_ZOOM_THRESHOLD: PRESETS.balanced.POI_ZOOM_THRESHOLD,
    BUILDING_ZOOM_THRESHOLD: PRESETS.balanced.BUILDING_ZOOM_THRESHOLD,
    MAX_BUILDS_PER_CYCLE: PRESETS.balanced.MAX_BUILDS_PER_CYCLE,
    MAX_ALLOWED_ZOOM: PRESETS.balanced.MAX_ALLOWED_ZOOM,

    TARGET_LAT: 46.8182, TARGET_LON: 8.2275, initialLat: 46.8182, initialLon: 8.2275,
    ZOOM: 6, RELIEF_EXAGGERATION: 2.0, FOG_NEAR: 5000, FOG_FAR: 40000,
    originTile: { x: 0, y: 0, z: 6 },
    scene: null, camera: null, renderer: null, controls: null, sunLight: null, ambientLight: null, sky: null,
    stats: null, vramPanel: null,
    simDate: new Date(), isSunAnimating: false, animationSpeed: 1.0,
    lastWeatherLat: 0, lastWeatherLon: 0, currentWeather: 'clear', weatherIntensity: 0,
    WEATHER_DENSITY: PRESETS.balanced.WEATHER_DENSITY, WEATHER_SPEED: PRESETS.balanced.WEATHER_SPEED,
    weatherData: null, weatherUnavailable: false, ephemeris: null,
    localPeaks: [],
    gpxLayers: [],
    activeGPXLayerId: null,
    recordedMesh: null,
    profileMarker: null, trailProgress: 0, isFollowingTrail: false,
    isFlyingTo: false,
    isTiltTransitioning: false,
    isRecording: false,
    isPaused: false,
    recordingStartTime: null, // Initialisation v5.29.1
    currentCourseId: null,
    recordedPoints: [],
    recoveredPoints: null,
    userLocation: null, userLocationAccuracy: null, userHeading: null, isFollowingUser: false, userMarker: null,
    smoothUserPos: new THREE.Vector3(),
    smoothUserHeading: 0,
    lastTrackingUpdate: 0,
    IS_OFFLINE: false,
    isNetworkAvailable: true,
    connectionType: 'unknown',
    isMapTilerDisabled: false,
    networkRequests: 0, cacheHits: 0, uiVisible: true, isInteractingWithUI: false, isUserInteracting: false,
    isProcessingTiles: false, IS_2D_MODE: true, currentFPS: 0, lastUIInteraction: Date.now(),
    lastClickedCoords: { x: 0, z: 0, alt: 0 },
    hasLastClicked: false,
    isFlying: false,
    isPro: false,
    trialEnd: null,
    purchasedPacks: [],
    installedPacks: [],
    DEBUG_MODE: false,
};

export const state = createReactiveState(initialState);

export const CURRENT_SETTINGS_VERSION = '5.10.0';

export interface SavedSettings {
    version?: string;
    lang?: AppLocale;
    themePreference?: ThemePreference;
    PERFORMANCE_PRESET: PresetType;
    MAP_SOURCE: string;
    ENERGY_SAVER: boolean;
    SHOW_TRAILS: boolean;
    SHOW_SLOPES: boolean;
    SHOW_SIGNPOSTS: boolean;
    SHOW_BUILDINGS: boolean;
    SHOW_HYDROLOGY: boolean;
    SHOW_VEGETATION: boolean;
    SHOW_WEATHER: boolean;
    SHOW_WEATHER_PRO: boolean;
    SHOW_INCLINOMETER: boolean;
    SHADOWS: boolean;
    RESOLUTION: number;
    RANGE: number;
    FOG_FAR: number;
    VEGETATION_DENSITY: number;
    WEATHER_DENSITY: number;
    WEATHER_SPEED: number;
    IS_2D_MODE?: boolean;
    LAST_LAT?: number;
    LAST_LON?: number;
    LAST_ZOOM?: number;
}

const SETTINGS_KEY = 'suntrail_settings';
let saveTimeout: any = null;

export function saveSettings(): void {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        const settingsToSave: SavedSettings = {
            version: CURRENT_SETTINGS_VERSION,
            lang: state.lang,
            themePreference: state.themePreference,
            PERFORMANCE_PRESET: state.PERFORMANCE_PRESET,
            MAP_SOURCE: state.MAP_SOURCE,
            ENERGY_SAVER: state.ENERGY_SAVER,
            SHOW_TRAILS: state.SHOW_TRAILS,
            SHOW_SLOPES: state.SHOW_SLOPES,
            SHOW_SIGNPOSTS: state.SHOW_SIGNPOSTS,
            SHOW_BUILDINGS: state.SHOW_BUILDINGS,
            SHOW_HYDROLOGY: state.SHOW_HYDROLOGY,
            SHOW_VEGETATION: state.SHOW_VEGETATION,
            SHOW_WEATHER: state.SHOW_WEATHER,
            SHOW_WEATHER_PRO: state.SHOW_WEATHER_PRO,
            SHOW_INCLINOMETER: state.SHOW_INCLINOMETER,
            SHADOWS: state.SHADOWS,
            RESOLUTION: state.RESOLUTION,
            RANGE: state.RANGE,
            FOG_FAR: state.FOG_FAR,
            VEGETATION_DENSITY: state.VEGETATION_DENSITY,
            WEATHER_DENSITY: state.WEATHER_DENSITY,
            WEATHER_SPEED: state.WEATHER_SPEED,
            IS_2D_MODE: state.IS_2D_MODE,
            LAST_LAT: state.TARGET_LAT,
            LAST_LON: state.TARGET_LON,
            LAST_ZOOM: state.ZOOM
        };
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsToSave));
        } catch (e) {
            console.warn("Could not save settings to localStorage:", e);
        }
        saveTimeout = null;
    }, 300);
}

const PRO_KEY = 'suntrail_pro';

export function saveProStatus(): void {
    try {
        localStorage.setItem(PRO_KEY, JSON.stringify({ 
            isPro: state.isPro,
            trialEnd: state.trialEnd
        }));
    } catch (e) {
        console.warn('[State] Could not save pro status:', e);
    }
}

export function loadProStatus(): void {
    try {
        const saved = localStorage.getItem(PRO_KEY);
        if (!saved) return;
        const parsed = JSON.parse(saved);
        state.isPro = !!parsed.isPro;
        state.trialEnd = parsed.trialEnd || null;
    } catch (e) {
        console.warn('[State] Could not load pro status:', e);
    }
}

export function isProActive(): boolean {
    if (state.isPro) return true;
    if (state.trialEnd && Date.now() < state.trialEnd) return true;
    return false;
}

export function activateDiscoveryTrial(days = 3): void {
    const durationMs = days * 24 * 60 * 60 * 1000;
    state.trialEnd = Date.now() + durationMs;
    state.SHOW_BUILDINGS = true;
    state.SHOW_INCLINOMETER = true;
    state.SHOW_WEATHER_PRO = true;
    saveProStatus();
    showToast(`✨ Essai Pro activé pour ${days} jours !`);
}

export function loadSettings(): SavedSettings | null {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (!saved) return null;
        const parsed = JSON.parse(saved) as SavedSettings;
        if (!parsed.PERFORMANCE_PRESET || !parsed.MAP_SOURCE) return null;
        if (parsed.version !== CURRENT_SETTINGS_VERSION) {
            localStorage.removeItem(SETTINGS_KEY);
            return null;
        }
        if (parsed.lang) state.lang = parsed.lang;
        if (parsed.themePreference) state.themePreference = parsed.themePreference;
        state.MAP_SOURCE = parsed.MAP_SOURCE;
        state.ENERGY_SAVER = !!parsed.ENERGY_SAVER;
        state.SHOW_TRAILS = !!parsed.SHOW_TRAILS;
        state.SHOW_SLOPES = !!parsed.SHOW_SLOPES;
        if (parsed.IS_2D_MODE !== undefined) state.IS_2D_MODE = !!parsed.IS_2D_MODE;
        if (parsed.PERFORMANCE_PRESET === 'custom') {
            state.SHOW_SIGNPOSTS = !!parsed.SHOW_SIGNPOSTS;
            state.SHOW_BUILDINGS = !!parsed.SHOW_BUILDINGS;
            state.SHOW_HYDROLOGY = !!parsed.SHOW_HYDROLOGY;
            state.SHOW_VEGETATION = !!parsed.SHOW_VEGETATION;
            state.SHOW_WEATHER = !!parsed.SHOW_WEATHER;
            if (parsed.SHOW_WEATHER_PRO !== undefined) state.SHOW_WEATHER_PRO = !!parsed.SHOW_WEATHER_PRO;
            if (parsed.SHOW_INCLINOMETER !== undefined) state.SHOW_INCLINOMETER = !!parsed.SHOW_INCLINOMETER;
            state.SHADOWS = !!parsed.SHADOWS;
            if (parsed.RESOLUTION) state.RESOLUTION = parsed.RESOLUTION;
            if (parsed.RANGE) state.RANGE = parsed.RANGE;
            if (parsed.FOG_FAR) state.FOG_FAR = parsed.FOG_FAR;
            if (parsed.VEGETATION_DENSITY !== undefined) state.VEGETATION_DENSITY = parsed.VEGETATION_DENSITY;
            if (parsed.WEATHER_DENSITY !== undefined) state.WEATHER_DENSITY = parsed.WEATHER_DENSITY;
            if (parsed.WEATHER_SPEED !== undefined) state.WEATHER_SPEED = parsed.WEATHER_SPEED;
        }
        if (parsed.LAST_LAT !== undefined) {
            state.TARGET_LAT = parsed.LAST_LAT;
            state.initialLat = parsed.LAST_LAT;
        }
        if (parsed.LAST_LON !== undefined) {
            state.TARGET_LON = parsed.LAST_LON;
            state.initialLon = parsed.LAST_LON;
        }
        if (parsed.LAST_ZOOM !== undefined) state.ZOOM = parsed.LAST_ZOOM;

        return parsed;
    } catch (e) {
        localStorage.removeItem(SETTINGS_KEY);
        return null;
    }
}

/**
 * Sauvegarde la vue actuelle (Lat, Lon, Zoom) après conversion depuis le monde Three.js.
 * Appelé quand l'utilisateur arrête d'interagir.
 */
import { worldToLngLat } from './geo';

export function saveLastView(): void {
    if (!state.controls || !state.camera) return;
    
    // On prend la cible des contrôles comme centre de la vue
    const target = state.controls.target;
    const gps = worldToLngLat(target.x, target.z, state.originTile);
    
    state.TARGET_LAT = gps.lat;
    state.TARGET_LON = gps.lon;
    state.ZOOM = state.ZOOM; // Déjà à jour via les événements de zoom
    
    saveSettings();
}
