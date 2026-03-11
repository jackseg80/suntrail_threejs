export const state = {
    MK: localStorage.getItem('maptiler_key_3d') || '',
    simDate: new Date(),
    TARGET_LAT: 46.6863, // Spiez
    TARGET_LON: 7.6617,
    ZOOM: 13, 
    
    // Paramètres de Performance
    RESOLUTION: 128, 
    RANGE: 2,        
    SHADOWS: true,   
    SHADOW_RES: 2048, 
    PIXEL_RATIO_LIMIT: window.devicePixelRatio > 1.5 ? 1.5 : window.devicePixelRatio,
    RELIEF_EXAGGERATION: 1.3, 
    SHOW_TRAILS: true, 
    MAP_SOURCE: 'swisstopo', 
    FOG_DENSITY: 0.00001, 
    
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
    terrainMesh: null
};
