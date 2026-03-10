export const state = {
    MK: localStorage.getItem('maptiler_key_3d') || '',
    simDate: new Date(),
    TARGET_LAT: 45.8326, // Mont Blanc par défaut
    TARGET_LON: 6.8652,
    ZOOM: 13, // Zoom de référence
    currentZoom: 13, // Zoom dynamique réel
    
    // Paramètres de Performance
    RESOLUTION: 128, // Par défaut réduit à 128 pour la fluidité
    RANGE: 2,        // 2 = 5x5 tuiles
    SHADOWS: true,   // Ombres activées par défaut
    SHADOW_RES: 2048, // Résolution des ombres (moyenne par défaut)
    PIXEL_RATIO_LIMIT: window.devicePixelRatio > 1.5 ? 1.5 : window.devicePixelRatio,
    RELIEF_EXAGGERATION: 1.3, // Boost visuel par défaut
    SHOW_TRAILS: true, // Affiche les sentiers par défaut
    MAP_SOURCE: 'opentopomap', // Source par défaut
    FOG_DENSITY: 0.00001, // Intensité du brouillard par défaut (10)
    
    // Animation temporelle
    isAnimating: false,
    animationSpeed: 1, // Minutes par frame de simulation
    
    // GPX & Parcours
    gpxData: null,
    gpxPoints: [], // Points THREE.Vector3 du tracé
    gpxMesh: null,
    isFollowingTrail: false,
    trailProgress: 0, // 0 à 1
    
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
