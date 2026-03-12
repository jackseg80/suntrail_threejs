import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export interface State {
    MK: string;
    simDate: Date;
    TARGET_LAT: number;
    TARGET_LON: number;
    ZOOM: number;
    
    // Paramètres de Performance
    RESOLUTION: number;
    RANGE: number;
    SHADOWS: boolean;
    SHADOW_RES: number;
    PIXEL_RATIO_LIMIT: number;
    RELIEF_EXAGGERATION: number;
    SHOW_TRAILS: boolean;
    MAP_SOURCE: string;
    hasManualSource: boolean;
    FOG_DENSITY: number;
    
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
    trailProgress: number;
    isFollowingTrail: boolean;
}

export const state: State = {
    MK: localStorage.getItem('maptiler_key_3d') || '',
    simDate: new Date(),
    TARGET_LAT: 46.6863, // Spiez
    TARGET_LON: 7.6617,
    ZOOM: 13, 
    
    // Paramètres de Performance
    RESOLUTION: 128, 
    RANGE: 4,        
    SHADOWS: true,   
    SHADOW_RES: 2048, 
    PIXEL_RATIO_LIMIT: window.devicePixelRatio > 1.5 ? 1.5 : window.devicePixelRatio,
    RELIEF_EXAGGERATION: 1.4, 
    SHOW_TRAILS: true, 
    MAP_SOURCE: 'swisstopo', 
    hasManualSource: false,
    FOG_DENSITY: 0.00001, 
    
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
    trailProgress: 0,
    isFollowingTrail: false
};
