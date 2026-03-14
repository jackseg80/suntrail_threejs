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
    BUILDINGS_SHADOWS: boolean; // v4.3.13
    MAX_ALLOWED_ZOOM: number;    // v4.3.13
    VEGETATION_DENSITY: number;  // v4.3.27
    BUILDING_BATCH_SIZE: number; // v4.3.27
    MAX_BUILDS_PER_CYCLE: number; // v4.3.27
    LOAD_DELAY_FACTOR: number;   // v4.3.27 (1.0 = normal, 2.0 = lent, 0.5 = rapide)
}

export const PRESETS: Record<Exclude<PresetType, 'custom'>, PerformanceSettings> = {
    eco: {
        RESOLUTION: 64,
        RANGE: 2,
        SHADOWS: false,
        SHADOW_RES: 512,
        PIXEL_RATIO_LIMIT: 1.0,
        SHOW_VEGETATION: false,
        SHOW_SIGNPOSTS: false,
        SHOW_BUILDINGS: false,
        BUILDINGS_SHADOWS: false,
        MAX_ALLOWED_ZOOM: 15,
        VEGETATION_DENSITY: 1000,
        BUILDING_BATCH_SIZE: 5,
        MAX_BUILDS_PER_CYCLE: 1,
        LOAD_DELAY_FACTOR: 2.0
    },
    balanced: {
        RESOLUTION: 128,
        RANGE: 3, 
        SHADOWS: true,
        SHADOW_RES: 1024,
        PIXEL_RATIO_LIMIT: 1.2,
        SHOW_VEGETATION: true,
        SHOW_SIGNPOSTS: true,
        SHOW_BUILDINGS: true,
        BUILDINGS_SHADOWS: false,
        MAX_ALLOWED_ZOOM: 16,
        VEGETATION_DENSITY: 4000,
        BUILDING_BATCH_SIZE: 20,
        MAX_BUILDS_PER_CYCLE: 1,
        LOAD_DELAY_FACTOR: 1.0
    },
    performance: {
        RESOLUTION: 160,
        RANGE: 4, 
        SHADOWS: true,
        SHADOW_RES: 2048,
        PIXEL_RATIO_LIMIT: 1.5,
        SHOW_VEGETATION: true,
        SHOW_SIGNPOSTS: true,
        SHOW_BUILDINGS: true,
        BUILDINGS_SHADOWS: true,
        MAX_ALLOWED_ZOOM: 18,
        VEGETATION_DENSITY: 8000,
        BUILDING_BATCH_SIZE: 50,
        MAX_BUILDS_PER_CYCLE: 2,
        LOAD_DELAY_FACTOR: 0.5
    },
    ultra: {
        RESOLUTION: 256,
        RANGE: 8, // Augmenté de 6 à 8 pour une vue massive
        SHADOWS: true,
        SHADOW_RES: 4096,
        PIXEL_RATIO_LIMIT: window.devicePixelRatio,
        SHOW_VEGETATION: true,
        SHOW_SIGNPOSTS: true,
        SHOW_BUILDINGS: true,
        BUILDINGS_SHADOWS: true,
        MAX_ALLOWED_ZOOM: 18,
        VEGETATION_DENSITY: 15000,
        BUILDING_BATCH_SIZE: 200,
        MAX_BUILDS_PER_CYCLE: 4,
        LOAD_DELAY_FACTOR: 0.2
    }
};

export interface State {
    MK: string;
    simDate: Date;
    TARGET_LAT: number;
    TARGET_LON: number;
    ZOOM: number;
    
    // Paramètres de Performance
    PERFORMANCE_PRESET: PresetType;
    RESOLUTION: number;
    RANGE: number;
    SHADOWS: boolean;
    SHADOW_RES: number;
    PIXEL_RATIO_LIMIT: number;
    RELIEF_EXAGGERATION: number;
    SHOW_TRAILS: boolean;
    SHOW_SLOPES: boolean;
    SHOW_SIGNPOSTS: boolean;
    SHOW_BUILDINGS: boolean;
    MAP_SOURCE: string;
    hasManualSource: boolean;
    FOG_NEAR: number;
    FOG_FAR: number;
    
    // Paramètres avancés de performance (v4.3.27)
    VEGETATION_DENSITY: number;
    BUILDING_BATCH_SIZE: number;
    MAX_BUILDS_PER_CYCLE: number;
    LOAD_DELAY_FACTOR: number;
    
    // Paramètres Debug (v3.8.5)
    SHOW_DEBUG: boolean;
    SHOW_STATS: boolean;
    SHOW_VEGETATION: boolean;
    
    // Animation temporelle
    isAnimating: boolean;
    animationSpeed: number;
    
    // Position initiale
    initialLat: number;
    initialLon: number;
    originTile: { x: number; y: number; z: number };
    
    // Three.js instances
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    renderer: THREE.WebGLRenderer | null;
    controls: OrbitControls | MapControls | null;
    sunLight: THREE.DirectionalLight | null;
    ambientLight: THREE.AmbientLight | null;
    sky: Sky | null;
    stats: any; // Stats from stats.module.js
    vramPanel: any;
    rawGpxData: any; // gpxParser result
    gpxPoints: THREE.Vector3[];
    gpxMesh: THREE.Mesh | null;
    profileMarker: THREE.Mesh | null;
    trailProgress: number;
    isFollowingTrail: boolean;
    
    // Localisation Utilisateur (v3.9.6)
    userLocation: { lat: number; lon: number; alt: number } | null;
    userHeading: number | null;
    isFollowingUser: boolean;
    userMarker: THREE.Group | null;
    
    // Statistiques Session (v3.8.2)
    networkRequests: number;
    cacheHits: number;

    // Interface Éphémère (v4.1.0)
    uiVisible: boolean;
    lastUIInteraction: number;
}

export const state: State = {
    MK: '', // Sera initialisé dans initUI ou au besoin
    simDate: new Date(),
    TARGET_LAT: 46.6863, // Spiez
    TARGET_LON: 7.6617,
    ZOOM: 12, // Zoom initial à 12 (v4.3.62)
    
    // ... (paramètres performance identiques)
    PERFORMANCE_PRESET: 'balanced',
    RESOLUTION: PRESETS.balanced.RESOLUTION, 
    RANGE: PRESETS.balanced.RANGE,        
    SHADOWS: PRESETS.balanced.SHADOWS,   
    SHADOW_RES: PRESETS.balanced.SHADOW_RES, 
    PIXEL_RATIO_LIMIT: PRESETS.balanced.PIXEL_RATIO_LIMIT,
    RELIEF_EXAGGERATION: 1.4, 
    SHOW_TRAILS: false, // Désactivé par défaut (v4.3.42)
    SHOW_SLOPES: false,
    SHOW_SIGNPOSTS: PRESETS.balanced.SHOW_SIGNPOSTS,
    SHOW_BUILDINGS: PRESETS.balanced.SHOW_BUILDINGS,
    MAP_SOURCE: 'swisstopo', 
    hasManualSource: false,
    FOG_NEAR: 5000, 
    FOG_FAR: 40000, 
    
    // Performance (v4.3.27)
    VEGETATION_DENSITY: PRESETS.balanced.VEGETATION_DENSITY,
    BUILDING_BATCH_SIZE: PRESETS.balanced.BUILDING_BATCH_SIZE,
    MAX_BUILDS_PER_CYCLE: PRESETS.balanced.MAX_BUILDS_PER_CYCLE,
    LOAD_DELAY_FACTOR: PRESETS.balanced.LOAD_DELAY_FACTOR,
    
    // Debug (v3.8.5)
    SHOW_DEBUG: true,
    SHOW_STATS: true,
    SHOW_VEGETATION: true,
    
    // Animation temporelle
    isAnimating: false,
    animationSpeed: 1.0, 
    
    // Position initiale
    initialLat: 46.6863,
    initialLon: 7.6617,
    originTile: { x: 0, y: 0, z: 12 }, // Zoom initial à 12 (v4.3.62)
    
    // Three.js instances
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    sunLight: null,
    ambientLight: null,
    sky: null,
    stats: null,
    vramPanel: null,
    rawGpxData: null,
    gpxPoints: [],
    gpxMesh: null,
    profileMarker: null,
    trailProgress: 0,
    isFollowingTrail: false,

    // Localisation Utilisateur (v3.9.6)
    userLocation: null,
    userHeading: null,
    isFollowingUser: false,
    userMarker: null,

    // Statistiques Session (v3.8.2)
    networkRequests: 0,
    cacheHits: 0,

    // Interface Éphémère (v4.1.0)
    uiVisible: true,
    lastUIInteraction: Date.now()
};
