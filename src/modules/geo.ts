export const EARTH_CIRCUMFERENCE = 40075016.686;

export interface BBox {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
}

export interface LocationPoint {
    lat: number;
    lon: number;
    alt: number;
    timestamp: number;
}

/** 
 * Limites géographiques des régions supportées (v5.28.2) 
 * Permet une extension facile à de nouveaux pays.
 */
export const REGIONS: Record<string, BBox[]> = {
    CH: [{ minLat: 45.7, maxLat: 47.9, minLon: 5.8, maxLon: 10.6 }],
    FR: [
        // France métropolitaine continentale
        { minLat: 41.3, maxLat: 51.1, minLon: -5.1, maxLon: 8.3 },
        // Corse
        { minLat: 41.0, maxLat: 43.1, minLon: 8.4, maxLon: 9.7 }
    ]
};

/** Vérifie si une coordonnée est dans une région donnée (code ISO 3166-1 alpha-2) */
export function isPositionInRegion(lat: number, lon: number, regionCode: string): boolean {
    const bboxes = REGIONS[regionCode];
    if (!bboxes) return false;
    return bboxes.some(bbox => 
        lat > bbox.minLat && lat < bbox.maxLat && 
        lon > bbox.minLon && lon < bbox.maxLon
    );
}

/**
 * Décode une altitude depuis des valeurs R, G, B (Terrain-RGB MapTiler/Mapbox).
 * Formule : h = -10000 + (R*65536 + G*256 + B) * 0.1
 * @param r Composante Rouge (0-255)
 * @param g Composante Verte (0-255)
 * @param b Composante Bleue (0-255)
 * @param exaggeration Facteur d'exagération du relief (défaut: 1.0)
 */
export function decodeTerrainRGB(r: number, g: number, b: number, exaggeration: number = 1.0): number {
    return (-10000 + (r * 65536 + g * 256 + b) * 0.1) * exaggeration;
}

export function isPositionInSwitzerland(lat: number, lon: number): boolean {
    return isPositionInRegion(lat, lon, 'CH');
}

export function isPositionInFrance(lat: number, lon: number): boolean {
    return isPositionInRegion(lat, lon, 'FR');
}

export function lngLatToWorld(lon: number, lat: number, originTile: {x: number, y: number, z: number}): { x: number; z: number } {
    const xNorm = (lon + 180) / 360;
    const yNorm = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2;
    
    const originUnit = 1.0 / Math.pow(2, originTile.z);
    const oxNorm = (originTile.x + 0.5) * originUnit;
    const oyNorm = (originTile.y + 0.5) * originUnit;
    
    return { 
        x: (xNorm - oxNorm) * EARTH_CIRCUMFERENCE, 
        z: (yNorm - oyNorm) * EARTH_CIRCUMFERENCE 
    };
}

export function worldToLngLat(worldX: number, worldZ: number, originTile: {x: number, y: number, z: number}): { lat: number; lon: number } {
    const originUnit = 1.0 / Math.pow(2, originTile.z);
    const oxNorm = (originTile.x + 0.5) * originUnit;
    const oyNorm = (originTile.y + 0.5) * originUnit;
    
    const xNorm = worldX / EARTH_CIRCUMFERENCE + oxNorm;
    const yNorm = worldZ / EARTH_CIRCUMFERENCE + oyNorm;
    
    const lon = xNorm * 360 - 180;
    const n = Math.PI - 2 * Math.PI * yNorm;
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    
    return { lat, lon };
}

export function lngLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number; z: number } {
    const n = Math.pow(2, zoom);
    let x = Math.floor((lon + 180) / 360 * n);
    let y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
    x = Math.max(0, Math.min(n - 1, x));
    y = Math.max(0, Math.min(n - 1, y));
    return { x, y, z: zoom };
}

/** Limites géographiques valides du système de tuiles Web Mercator */
export const WORLD_BOUNDS = {
    minLat: -85.051,
    maxLat:  85.051,
    minLon: -180,
    maxLon:  180,
};

/**
 * Clampe une position world (x, z) aux limites géographiques valides.
 * Empêche la caméra de sortir des bords du monde de tuiles.
 * Retourne { x, z } inchangés si déjà dans les limites.
 */
export function clampTargetToBounds(
    worldX: number, worldZ: number,
    originTile: { x: number; y: number; z: number }
): { x: number; z: number } {
    const { lat, lon } = worldToLngLat(worldX, worldZ, originTile);
    const clampedLat = Math.max(WORLD_BOUNDS.minLat, Math.min(WORLD_BOUNDS.maxLat, lat));
    const clampedLon = Math.max(WORLD_BOUNDS.minLon, Math.min(WORLD_BOUNDS.maxLon, lon));
    if (clampedLat === lat && clampedLon === lon) return { x: worldX, z: worldZ };
    return lngLatToWorld(clampedLon, clampedLat, originTile);
}

export function getTileBounds(tile: {zoom: number, tx: number, ty: number}) {
    const n = Math.pow(2, tile.zoom);
    const lonWest = tile.tx / n * 360 - 180;
    const lonEast = (tile.tx + 1) / n * 360 - 180;
    const latRadNorth = Math.atan(Math.sinh(Math.PI * (1 - 2 * tile.ty / n)));
    const latNorth = latRadNorth * 180 / Math.PI;
    const latRadSouth = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tile.ty + 1) / n)));
    const latSouth = latRadSouth * 180 / Math.PI;
    return { north: latNorth, south: latSouth, west: lonWest, east: lonEast };
}

/**
 * Calcule la distance Haversine entre deux points GPS (en km).
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Rayon de la Terre en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}
