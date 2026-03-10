export const state = {
    MK: localStorage.getItem('maptiler_key_3d') || '',
    simDate: new Date(),
    TARGET_LAT: 45.8326, // Mont Blanc par défaut
    TARGET_LON: 6.8652,
    ZOOM: 13, // HD Zoom
    
    // Paramètres de Performance
    RESOLUTION: 128, // Par défaut réduit à 128 pour la fluidité
    RANGE: 2,        // 2 = 5x5 tuiles
    SHADOWS: true,   // Ombres activées par défaut
    SHADOW_RES: 2048, // Résolution des ombres (moyenne par défaut)
    PIXEL_RATIO_LIMIT: window.devicePixelRatio > 1.5 ? 1.5 : window.devicePixelRatio,
    RELIEF_EXAGGERATION: 1.0, // Exagération visuelle du relief
    FOG_DENSITY: 0.00002, // Intensité du brouillard par défaut (20)
    
    // Position initiale pour le repère 3D (évite les superpositions)
    initialLat: 45.8326,
    initialLon: 6.8652,
    originTile: { x: 0, y: 0 },
    
    // Three.js instances
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    sunLight: null,
    ambientLight: null,
    terrainMesh: null
};
