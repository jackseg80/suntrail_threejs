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
    PIXEL_RATIO_LIMIT: number;
    SHOW_VEGETATION: boolean;
    SHOW_SIGNPOSTS: boolean;
    SHOW_BUILDINGS: boolean;
    BUILDINGS_SHADOWS: boolean; 
    MAX_ALLOWED_ZOOM: number;    
    VEGETATION_DENSITY: number;  
    BUILDING_BATCH_SIZE: number; 
    MAX_BUILDS_PER_CYCLE: number; 
    LOAD_DELAY_FACTOR: number;   
    SHOW_WEATHER: boolean;       
    WEATHER_DENSITY: number;     
    WEATHER_SPEED: number;       
}

export const PRESETS: Record<Exclude<PresetType, 'custom'>, PerformanceSettings> = {
    eco: {
        RESOLUTION: 64, RANGE: 2, SHADOWS: false, SHADOW_RES: 256, PIXEL_RATIO_LIMIT: 1.0,
        SHOW_VEGETATION: false, SHOW_SIGNPOSTS: false, SHOW_BUILDINGS: false, BUILDINGS_SHADOWS: false,
        MAX_ALLOWED_ZOOM: 15, VEGETATION_DENSITY: 1000, BUILDING_BATCH_SIZE: 5, MAX_BUILDS_PER_CYCLE: 1,
        LOAD_DELAY_FACTOR: 2.0, SHOW_WEATHER: false, WEATHER_DENSITY: 0, WEATHER_SPEED: 1.0
    },
    balanced: {
        RESOLUTION: 96, RANGE: 3, SHADOWS: true, SHADOW_RES: 512, PIXEL_RATIO_LIMIT: 1.1,
        SHOW_VEGETATION: true, SHOW_SIGNPOSTS: true, SHOW_BUILDINGS: true, BUILDINGS_SHADOWS: false,
        MAX_ALLOWED_ZOOM: 16, VEGETATION_DENSITY: 4000, BUILDING_BATCH_SIZE: 20, MAX_BUILDS_PER_CYCLE: 2,
        LOAD_DELAY_FACTOR: 1.0, SHOW_WEATHER: true, WEATHER_DENSITY: 2500, WEATHER_SPEED: 1.0
    },
    performance: {
        RESOLUTION: 160, RANGE: 4, SHADOWS: true, SHADOW_RES: 2048, PIXEL_RATIO_LIMIT: 1.5,
        SHOW_VEGETATION: true, SHOW_SIGNPOSTS: true, SHOW_BUILDINGS: true, BUILDINGS_SHADOWS: true,
        MAX_ALLOWED_ZOOM: 18, VEGETATION_DENSITY: 8000, BUILDING_BATCH_SIZE: 50, MAX_BUILDS_PER_CYCLE: 4,
        LOAD_DELAY_FACTOR: 0.5, SHOW_WEATHER: true, WEATHER_DENSITY: 5000, WEATHER_SPEED: 1.2
    },
    ultra: {
        RESOLUTION: 256, RANGE: 8, SHADOWS: true, SHADOW_RES: 4096, PIXEL_RATIO_LIMIT: window.devicePixelRatio,
        SHOW_VEGETATION: true, SHOW_SIGNPOSTS: true, SHOW_BUILDINGS: true, BUILDINGS_SHADOWS: true,
        MAX_ALLOWED_ZOOM: 18, VEGETATION_DENSITY: 12000, BUILDING_BATCH_SIZE: 200, MAX_BUILDS_PER_CYCLE: 8,
        LOAD_DELAY_FACTOR: 0.2, SHOW_WEATHER: true, WEATHER_DENSITY: 15000, WEATHER_SPEED: 1.5
    }
};

export interface State {
    // ==========================================
    // ⚙️ CONFIGURATION & PRÉFÉRENCES
    // ==========================================
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
    SHOW_VEGETATION: boolean;
    SHOW_WEATHER: boolean;
    SHOW_DEBUG: boolean;
    SHOW_STATS: boolean;

    SHADOWS: boolean;
    SHADOW_RES: number;
    VEGETATION_DENSITY: number;
    BUILDING_BATCH_SIZE: number;
    MAX_BUILDS_PER_CYCLE: number;

    // ==========================================
    // 🌍 POSITIONNEMENT & MOTEUR 3D
    // ==========================================
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
    stats: any | null; // Stats.js instance
    vramPanel: any | null;

    // ==========================================
    // 🌦️ MÉTÉO & ÉPHÉMÉRIDES
    // ==========================================
    simDate: Date;
    isAnimating: boolean;
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

    // ==========================================
    // 🥾 GPX & NAVIGATION (GPS)
    // ==========================================
    rawGpxData: Record<string, any> | null;
    gpxPoints: THREE.Vector3[];
    gpxMesh: THREE.Mesh | null;
    profileMarker: THREE.Mesh | null;
    trailProgress: number;
    isFollowingTrail: boolean;
    userLocation: { lat: number; lon: number; alt: number } | null;
    userHeading: number | null;
    isFollowingUser: boolean;
    userMarker: THREE.Group | null;

    // ==========================================
    // 🖥️ INTERFACE & SYSTÈME
    // ==========================================
    networkRequests: number;
    cacheHits: number;
    uiVisible: boolean;
    lastUIInteraction: number;
}

export const state: State = {
    // --- Config ---
    MK: '', MAP_SOURCE: 'swisstopo', hasManualSource: false,
    PERFORMANCE_PRESET: 'balanced', RESOLUTION: PRESETS.balanced.RESOLUTION, RANGE: PRESETS.balanced.RANGE,
    PIXEL_RATIO_LIMIT: PRESETS.balanced.PIXEL_RATIO_LIMIT, LOAD_DELAY_FACTOR: PRESETS.balanced.LOAD_DELAY_FACTOR,
    SHOW_TRAILS: false, SHOW_SLOPES: false, SHOW_SIGNPOSTS: PRESETS.balanced.SHOW_SIGNPOSTS,
    SHOW_BUILDINGS: PRESETS.balanced.SHOW_BUILDINGS, SHOW_VEGETATION: true, SHOW_WEATHER: PRESETS.balanced.SHOW_WEATHER,
    SHOW_DEBUG: true, SHOW_STATS: true, SHADOWS: PRESETS.balanced.SHADOWS, SHADOW_RES: PRESETS.balanced.SHADOW_RES,
    VEGETATION_DENSITY: PRESETS.balanced.VEGETATION_DENSITY, BUILDING_BATCH_SIZE: PRESETS.balanced.BUILDING_BATCH_SIZE,
    MAX_BUILDS_PER_CYCLE: PRESETS.balanced.MAX_BUILDS_PER_CYCLE,

    // --- Moteur 3D ---
    TARGET_LAT: 46.6863, TARGET_LON: 7.6617, initialLat: 46.6863, initialLon: 7.6617,
    ZOOM: 12, RELIEF_EXAGGERATION: 1.4, FOG_NEAR: 5000, FOG_FAR: 40000,
    originTile: { x: 0, y: 0, z: 12 },
    scene: null, camera: null, renderer: null, controls: null, sunLight: null, ambientLight: null, sky: null,
    stats: null, vramPanel: null,

    // --- Météo ---
    simDate: new Date(), isAnimating: false, animationSpeed: 1.0,
    lastWeatherLat: 0, lastWeatherLon: 0, currentWeather: 'clear', weatherIntensity: 0,
    WEATHER_DENSITY: PRESETS.balanced.WEATHER_DENSITY, WEATHER_SPEED: PRESETS.balanced.WEATHER_SPEED,
    weatherData: null, ephemeris: null,

    // --- Navigation ---
    rawGpxData: null, gpxPoints: [], gpxMesh: null, profileMarker: null, trailProgress: 0, isFollowingTrail: false,
    userLocation: null, userHeading: null, isFollowingUser: false, userMarker: null,

    // --- Système ---
    networkRequests: 0, cacheHits: 0, uiVisible: true, lastUIInteraction: Date.now()
};
