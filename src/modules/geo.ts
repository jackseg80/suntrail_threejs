export const EARTH_CIRCUMFERENCE = 40075016.686;

/** 
 * Cache pour les puissances de 2 (Zooms 0 à 25).
 * Évite Math.pow() dans les boucles de rendu et workers.
 */
const POW2_CACHE = new Float64Array(26);
for (let i = 0; i <= 25; i++) POW2_CACHE[i] = Math.pow(2, i);

export function getPow2(zoom: number): number {
    if (zoom >= 0 && zoom <= 25 && Number.isInteger(zoom)) return POW2_CACHE[zoom];
    return Math.pow(2, zoom);
}

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
 */
export const REGIONS: Record<string, BBox[]> = {
    CH: [
        { minLat: 46.12, maxLat: 47.9, minLon: 5.8, maxLon: 7.0 },
        { minLat: 45.94, maxLat: 47.9, minLon: 7.0, maxLon: 8.6 },
        { minLat: 45.7, maxLat: 46.6, minLon: 8.6, maxLon: 9.3 },
        { minLat: 46.6, maxLat: 47.9, minLon: 8.6, maxLon: 9.3 },
        { minLat: 46.2, maxLat: 47.9, minLon: 9.3, maxLon: 10.6 }
    ],
    FR: [
        { minLat: 41.3, maxLat: 51.1, minLon: -5.1, maxLon: 6.0 },
        { minLat: 44.5, maxLat: 46.5, minLon: 6.0, maxLon: 7.1 },
        { minLat: 43.0, maxLat: 44.5, minLon: 6.0, maxLon: 7.6 },
        { minLat: 47.5, maxLat: 51.1, minLon: 6.0, maxLon: 8.2 },
        { minLat: 41.0, maxLat: 43.1, minLon: 8.4, maxLon: 9.7 }
    ],
    IT: [
        { minLat: 35.4, maxLat: 47.1, minLon: 6.6, maxLon: 18.6 }
    ]
};

export function isPositionInRegion(lat: number, lon: number, regionCode: string): boolean {
    const bboxes = REGIONS[regionCode];
    if (!bboxes) return false;
    return bboxes.some(bbox => 
        lat >= bbox.minLat && lat <= bbox.maxLat && 
        lon >= bbox.minLon && lon <= bbox.maxLon
    );
}

/** Conversion Latitude -> Y Normalisé [0, 1] (Web Mercator) */
export function latToYNorm(lat: number): number {
    const latRad = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
}

/** Conversion Longitude -> X Normalisé [0, 1] (Web Mercator) */
export function lonToXNorm(lon: number): number {
    return (lon + 180) / 360;
}

/** Inverse Y Normalisé -> Latitude */
export function yNormToLat(yNorm: number): number {
    const n = Math.PI - 2 * Math.PI * yNorm;
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Inverse X Normalisé -> Longitude */
export function xNormToLon(xNorm: number): number {
    return xNorm * 360 - 180;
}

export function decodeTerrainRGB(r: number, g: number, b: number, exaggeration: number = 1.0): number {
    return (-10000 + (r * 65536 + g * 256 + b) * 0.1) * exaggeration;
}

export function isPositionInSwitzerland(lat: number, lon: number): boolean {
    return isPositionInRegion(lat, lon, 'CH');
}

export function isPositionInFrance(lat: number, lon: number): boolean {
    return isPositionInRegion(lat, lon, 'FR');
}

export function isPositionInItaly(lat: number, lon: number): boolean {
    return isPositionInRegion(lat, lon, 'IT');
}

export function lngLatToWorld(lon: number, lat: number, originTile: {x: number, y: number, z: number}): { x: number; z: number } {
    return lngLatToWorldTarget(lon, lat, originTile, { x: 0, z: 0 });
}

/** Version optimisée sans allocation pour les boucles (ex: tracés GPX) */
export function lngLatToWorldTarget<T extends {x: number, z: number}>(
    lon: number, lat: number, 
    originTile: {x: number, y: number, z: number}, 
    target: T
): T {
    const xNorm = (lon + 180) / 360;
    const latRad = lat * Math.PI / 180;
    const yNorm = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
    
    const originUnit = 1.0 / getPow2(originTile.z);
    const oxNorm = (originTile.x + 0.5) * originUnit;
    const oyNorm = (originTile.y + 0.5) * originUnit;
    
    target.x = (xNorm - oxNorm) * EARTH_CIRCUMFERENCE;
    target.z = (yNorm - oyNorm) * EARTH_CIRCUMFERENCE;
    return target;
}

export function worldToLngLat(worldX: number, worldZ: number, originTile: {x: number, y: number, z: number}): { lat: number; lon: number } {
    return worldToLngLatTarget(worldX, worldZ, originTile, { lat: 0, lon: 0 });
}

/** Version optimisée sans allocation */
export function worldToLngLatTarget<T extends {lat: number, lon: number}>(
    worldX: number, worldZ: number, 
    originTile: {x: number, y: number, z: number}, 
    target: T
): T {
    const originUnit = 1.0 / getPow2(originTile.z);
    const oxNorm = (originTile.x + 0.5) * originUnit;
    const oyNorm = (originTile.y + 0.5) * originUnit;
    
    const xNorm = worldX / EARTH_CIRCUMFERENCE + oxNorm;
    const yNorm = worldZ / EARTH_CIRCUMFERENCE + oyNorm;
    
    target.lon = xNorm * 360 - 180;
    const n = Math.PI - 2 * Math.PI * yNorm;
    target.lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return target;
}

export function lngLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number; z: number } {
    const n = getPow2(zoom);
    let x = Math.floor(lonToXNorm(lon) * n);
    let y = Math.floor(latToYNorm(lat) * n);
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
    const n = getPow2(tile.zoom);
    const lonWest = xNormToLon(tile.tx / n);
    const lonEast = xNormToLon((tile.tx + 1) / n);
    const latNorth = yNormToLat(tile.ty / n);
    const latSouth = yNormToLat((tile.ty + 1) / n);
    return { north: latNorth, south: latSouth, west: lonWest, east: lonEast };
}

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}
