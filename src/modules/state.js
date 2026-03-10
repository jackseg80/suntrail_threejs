export const state = {
    // API
    MK: '',
    
    // Scène Three.js
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    sunLight: null,
    ambientLight: null,
    sky: null,
    
    // Paramètres Terrain
    TARGET_LAT: 45.9237, 
    TARGET_LON: 6.8694,
    initialLat: 45.9237,
    initialLon: 6.8694,
    originTile: { x: 4252, y: 2836, z: 13 },
    worldOrigin: { x: 0, y: 0 }, // ANCRE FIXE EN MÈTRES (EPSG:3857)
    
    // Configuration
    ZOOM: 13,
    RESOLUTION: 128,
    RANGE: 2,
    RELIEF_EXAGGERATION: 1.3,
    FOG_DENSITY: 0.00001,
    SHADOWS: true,
    SHADOW_RES: 2048,
    PIXEL_RATIO_LIMIT: 1.5,
    MAP_SOURCE: 'outdoor-v2',
    SHOW_TRAILS: true,
    
    // Simulation Solaire
    simDate: new Date(),
    isAnimating: false,
    animationSpeed: 1,
    
    // GPX
    gpxPoints: [],
    gpxMesh: null,
    isFollowingTrail: false,
    trailProgress: 0
};
