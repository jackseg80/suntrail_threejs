import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export type PresetType = 'eco' | 'balanced' | 'performance' | 'ultra' | 'custom';

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
        MAX_ALLOWED_ZOOM: 15, VEGETATION_DENSITY: 0, BUILDING_LIMIT: 0, POI_ZOOM_THRESHOLD: 16, BUILDING_ZOOM_THRESHOLD: 17,
        MAX_BUILDS_PER_CYCLE: 1, LOAD_DELAY_FACTOR: 2.0, SHOW_WEATHER: false, WEATHER_DENSITY: 0, WEATHER_SPEED: 1.0,
        FOG_FAR: 25000, SHOW_SLOPES: false
    },
    balanced: {
        RESOLUTION: 64, RANGE: 4, SHADOWS: true, SHADOW_RES: 256, PIXEL_RATIO_LIMIT: 1.0,
        SHOW_VEGETATION: true, SHOW_SIGNPOSTS: true, SHOW_BUILDINGS: true, SHOW_HYDROLOGY: false, BUILDINGS_SHADOWS: false,
        MAX_ALLOWED_ZOOM: 16, VEGETATION_DENSITY: 2000, BUILDING_LIMIT: 40, POI_ZOOM_THRESHOLD: 15, BUILDING_ZOOM_THRESHOLD: 16,
        MAX_BUILDS_PER_CYCLE: 2, LOAD_DELAY_FACTOR: 1.2, SHOW_WEATHER: true, WEATHER_DENSITY: 2000, WEATHER_SPEED: 1.0,
        FOG_FAR: 40000, SHOW_SLOPES: false
    },
    performance: {
        RESOLUTION: 160, RANGE: 8, SHADOWS: true, SHADOW_RES: 2048, PIXEL_RATIO_LIMIT: 1.5,
        SHOW_VEGETATION: true, SHOW_SIGNPOSTS: true, SHOW_BUILDINGS: true, SHOW_HYDROLOGY: true, BUILDINGS_SHADOWS: true,
        MAX_ALLOWED_ZOOM: 18, VEGETATION_DENSITY: 8000, BUILDING_LIMIT: 80, POI_ZOOM_THRESHOLD: 14, BUILDING_ZOOM_THRESHOLD: 15,
        MAX_BUILDS_PER_CYCLE: 4, LOAD_DELAY_FACTOR: 0.5, SHOW_WEATHER: true, WEATHER_DENSITY: 5000, WEATHER_SPEED: 1.2,
        FOG_FAR: 60000, SHOW_SLOPES: false
    },
    ultra: {
        get PIXEL_RATIO_LIMIT() { return typeof window !== 'undefined' ? window.devicePixelRatio : 1; },
        RESOLUTION: 256, RANGE: 12, SHADOWS: true, SHADOW_RES: 4096,
        SHOW_VEGETATION: true, SHOW_SIGNPOSTS: true, SHOW_BUILDINGS: true, SHOW_HYDROLOGY: true, BUILDINGS_SHADOWS: true,
        MAX_ALLOWED_ZOOM: 18, VEGETATION_DENSITY: 12000, BUILDING_LIMIT: 150, POI_ZOOM_THRESHOLD: 14, BUILDING_ZOOM_THRESHOLD: 15,
        MAX_BUILDS_PER_CYCLE: 8, LOAD_DELAY_FACTOR: 0.2, SHOW_WEATHER: true, WEATHER_DENSITY: 15000, WEATHER_SPEED: 1.5,
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

export interface LocationPoint {
    lat: number;
    lon: number;
    alt: number;
    timestamp: number;
}

export interface State {
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
    SHOW_DEBUG: boolean;
    SHOW_STATS: boolean;
    USE_WORKERS: boolean;

    SHADOWS: boolean;
    SHADOW_RES: number;
    VEGETATION_DENSITY: number;
    BUILDING_LIMIT: number;
    POI_ZOOM_THRESHOLD: number;
    BUILDING_ZOOM_THRESHOLD: number;
    MAX_BUILDS_PER_CYCLE: number;

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
    vramPanel: any | null;

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
        windGusts?: number; dewPoint?: number;
        humidity: number; cloudCover: number; locationName?: string;
        freezingLevel?: number; uvIndex?: number; visibility?: number; precProb?: number;
        hourly?: { time: string; temp: number; code: number }[];
    } | null;
    ephemeris: {
        sunrise: string; sunset: string; goldenHour: string; blueHour: string;
        moonPhaseText: string; moonPhaseIcon: string; moonIllum: number;
    } | null;
    
    localPeaks: Peak[];

    rawGpxData: Record<string, any> | null;
    gpxPoints: THREE.Vector3[];
    gpxMesh: THREE.Mesh | null;
    profileMarker: THREE.Mesh | null;
    trailProgress: number;
    isFollowingTrail: boolean;
    
    isRecording: boolean;
    recordedPoints: LocationPoint[];
    
    userLocation: { lat: number; lon: number; alt: number } | null;
    userHeading: number | null;
    isFollowingUser: boolean;
    userMarker: THREE.Group | null;
    
    smoothUserPos: THREE.Vector3;
    smoothUserHeading: number;
    lastTrackingUpdate: number;

    IS_OFFLINE: boolean;
    isMapTilerDisabled: boolean; // Nouveau flag pour gérer les clés invalides (403)
    networkRequests: number;
    cacheHits: number;
    uiVisible: boolean;
    isInteractingWithUI: boolean;
    isUserInteracting: boolean;
    isProcessingTiles: boolean;
    lastUIInteraction: number;
}

export const state: State = {
    ENERGY_SAVER: false,
    MK: '', MAP_SOURCE: 'swisstopo', hasManualSource: false,
    PERFORMANCE_PRESET: 'balanced', RESOLUTION: PRESETS.balanced.RESOLUTION, RANGE: PRESETS.balanced.RANGE,
    PIXEL_RATIO_LIMIT: PRESETS.balanced.PIXEL_RATIO_LIMIT, LOAD_DELAY_FACTOR: PRESETS.balanced.LOAD_DELAY_FACTOR,
    SHOW_TRAILS: false, SHOW_SLOPES: false, SHOW_SIGNPOSTS: PRESETS.balanced.SHOW_SIGNPOSTS,
    SHOW_BUILDINGS: PRESETS.balanced.SHOW_BUILDINGS, SHOW_HYDROLOGY: PRESETS.balanced.SHOW_HYDROLOGY, SHOW_VEGETATION: true, SHOW_WEATHER: PRESETS.balanced.SHOW_WEATHER,
    SHOW_DEBUG: true, SHOW_STATS: true, USE_WORKERS: true, SHADOWS: PRESETS.balanced.SHADOWS, SHADOW_RES: PRESETS.balanced.SHADOW_RES,
    VEGETATION_DENSITY: PRESETS.balanced.VEGETATION_DENSITY, 
    BUILDING_LIMIT: PRESETS.balanced.BUILDING_LIMIT,
    POI_ZOOM_THRESHOLD: PRESETS.balanced.POI_ZOOM_THRESHOLD,
    BUILDING_ZOOM_THRESHOLD: PRESETS.balanced.BUILDING_ZOOM_THRESHOLD,
    MAX_BUILDS_PER_CYCLE: PRESETS.balanced.MAX_BUILDS_PER_CYCLE,

    TARGET_LAT: 46.6863, TARGET_LON: 7.6617, initialLat: 46.6863, initialLon: 7.6617,
    ZOOM: 12, RELIEF_EXAGGERATION: 1.4, FOG_NEAR: 5000, FOG_FAR: 40000,
    originTile: { x: 0, y: 0, z: 12 },
    scene: null, camera: null, renderer: null, controls: null, sunLight: null, ambientLight: null, sky: null,
    stats: null, vramPanel: null,

    simDate: new Date(), isSunAnimating: false, animationSpeed: 1.0,
    lastWeatherLat: 0, lastWeatherLon: 0, currentWeather: 'clear', weatherIntensity: 0,
    WEATHER_DENSITY: PRESETS.balanced.WEATHER_DENSITY, WEATHER_SPEED: PRESETS.balanced.WEATHER_SPEED,
    weatherData: null, ephemeris: null,
    
    localPeaks: [],

    rawGpxData: null, gpxPoints: [], gpxMesh: null, profileMarker: null, trailProgress: 0, isFollowingTrail: false,
    
    isRecording: false,
    recordedPoints: [],
    
    userLocation: null, userHeading: null, isFollowingUser: false, userMarker: null,
    
    smoothUserPos: new THREE.Vector3(),
    smoothUserHeading: 0,
    lastTrackingUpdate: 0,

    IS_OFFLINE: false,
    isMapTilerDisabled: false,
    networkRequests: 0, cacheHits: 0, uiVisible: true, isInteractingWithUI: false, isUserInteracting: false, isProcessingTiles: false, lastUIInteraction: Date.now()
};

const CURRENT_SETTINGS_VERSION = '5.7';

export interface SavedSettings {
    version?: string;
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
    SHADOWS: boolean;
    RESOLUTION: number;
    RANGE: number;
    FOG_FAR: number;
    VEGETATION_DENSITY: number;
    WEATHER_DENSITY: number;
    WEATHER_SPEED: number;
}

const SETTINGS_KEY = 'suntrail_settings';

export function saveSettings(): void {
    const settingsToSave: SavedSettings = {
        version: CURRENT_SETTINGS_VERSION,
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
        SHADOWS: state.SHADOWS,
        RESOLUTION: state.RESOLUTION,
        RANGE: state.RANGE,
        FOG_FAR: state.FOG_FAR,
        VEGETATION_DENSITY: state.VEGETATION_DENSITY,
        WEATHER_DENSITY: state.WEATHER_DENSITY,
        WEATHER_SPEED: state.WEATHER_SPEED
    };
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsToSave));
    } catch (e) {
        console.warn("Could not save settings to localStorage:", e);
    }
}

export function loadSettings(): SavedSettings | null {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (!saved) return null;
        const parsed = JSON.parse(saved) as SavedSettings;
        
        // Basic validation & Version Check
        if (!parsed.PERFORMANCE_PRESET || !parsed.MAP_SOURCE) {
            return null;
        }

        if (parsed.version !== CURRENT_SETTINGS_VERSION) {
            console.log(`[State] Obsolete version detected (${parsed.version} vs ${CURRENT_SETTINGS_VERSION}). Resetting settings.`);
            localStorage.removeItem(SETTINGS_KEY);
            return null;
        }

        // Apply loaded boolean toggles and map source directly
        state.MAP_SOURCE = parsed.MAP_SOURCE;
        state.ENERGY_SAVER = !!parsed.ENERGY_SAVER;
        state.SHOW_TRAILS = !!parsed.SHOW_TRAILS;
        state.SHOW_SLOPES = !!parsed.SHOW_SLOPES;
        
        // Restore custom values
        if (parsed.PERFORMANCE_PRESET === 'custom') {
            state.SHOW_SIGNPOSTS = !!parsed.SHOW_SIGNPOSTS;
            state.SHOW_BUILDINGS = !!parsed.SHOW_BUILDINGS;
            state.SHOW_HYDROLOGY = !!parsed.SHOW_HYDROLOGY;
            state.SHOW_VEGETATION = !!parsed.SHOW_VEGETATION;
            state.SHOW_WEATHER = !!parsed.SHOW_WEATHER;
            state.SHADOWS = !!parsed.SHADOWS;
            
            if (parsed.RESOLUTION) state.RESOLUTION = parsed.RESOLUTION;
            if (parsed.RANGE) state.RANGE = parsed.RANGE;
            if (parsed.FOG_FAR) state.FOG_FAR = parsed.FOG_FAR;
            if (parsed.VEGETATION_DENSITY !== undefined) state.VEGETATION_DENSITY = parsed.VEGETATION_DENSITY;
            if (parsed.WEATHER_DENSITY !== undefined) state.WEATHER_DENSITY = parsed.WEATHER_DENSITY;
            if (parsed.WEATHER_SPEED !== undefined) state.WEATHER_SPEED = parsed.WEATHER_SPEED;
        }
        
        return parsed;
    } catch (e) {
        console.warn("Failed to parse settings from localStorage, resetting...", e);
        localStorage.removeItem(SETTINGS_KEY);
        return null;
    }
}

