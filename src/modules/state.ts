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
        MAX_ALLOWED_ZOOM: 15
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
        MAX_ALLOWED_ZOOM: 16
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
        MAX_ALLOWED_ZOOM: 18
    },
    ultra: {
        RESOLUTION: 256,
        RANGE: 6, 
        SHADOWS: true,
        SHADOW_RES: 4096,
        PIXEL_RATIO_LIMIT: window.devicePixelRatio,
        SHOW_VEGETATION: true,
        SHOW_SIGNPOSTS: true,
        SHOW_BUILDINGS: true,
        BUILDINGS_SHADOWS: true,
        MAX_ALLOWED_ZOOM: 18
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
    ZOOM: 13, 
    
    // ... (paramètres performance identiques)
    PERFORMANCE_PRESET: 'balanced',
    RESOLUTION: PRESETS.balanced.RESOLUTION, 
    RANGE: PRESETS.balanced.RANGE,        
    SHADOWS: PRESETS.balanced.SHADOWS,   
    SHADOW_RES: PRESETS.balanced.SHADOW_RES, 
    PIXEL_RATIO_LIMIT: PRESETS.balanced.PIXEL_RATIO_LIMIT,
    RELIEF_EXAGGERATION: 1.4, 
    SHOW_TRAILS: true, 
    SHOW_SLOPES: false,
    SHOW_SIGNPOSTS: PRESETS.balanced.SHOW_SIGNPOSTS,
    SHOW_BUILDINGS: PRESETS.balanced.SHOW_BUILDINGS,
    MAP_SOURCE: 'swisstopo', 
    hasManualSource: false,
    FOG_NEAR: 5000, 
    FOG_FAR: 40000, 
    
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
    originTile: { x: 0, y: 0, z: 13 },
    
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
