export const EARTH_CIRCUMFERENCE = 40075016.68;

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
 * Calcule la distance perpendiculaire d'un point par rapport à un segment [start, end].
 */
export function perpendicularDistance(pt: {x: number; z: number}, start: {x: number; z: number}, end: {x: number; z: number}): number {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    if (dx === 0 && dz === 0) {
        return Math.sqrt(Math.pow(pt.x - start.x, 2) + Math.pow(pt.z - start.z, 2));
    }
    const t = ((pt.x - start.x) * dx + (pt.z - start.z) * dz) / (dx * dx + dz * dz);
    const closestX = start.x + t * dx;
    const closestZ = start.z + t * dz;
    return Math.sqrt(Math.pow(pt.x - closestX, 2) + Math.pow(pt.z - closestZ, 2));
}

/**
 * Algorithme de Ramer-Douglas-Peucker pour simplifier une liste de points 2D (x, z).
 * @param points Liste de points à simplifier
 * @param epsilon Seuil de distance (en mètres) pour la simplification
 */
export function ramerDouglasPeucker<T extends {x: number; z: number}>(points: T[], epsilon: number): T[] {
    if (points.length <= 2) return points;

    let dmax = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
        const d = perpendicularDistance(points[i], points[0], points[end]);
        if (d > dmax) {
            index = i;
            dmax = d;
        }
    }

    if (dmax > epsilon) {
        const res1 = ramerDouglasPeucker(points.slice(0, index + 1), epsilon);
        const res2 = ramerDouglasPeucker(points.slice(index), epsilon);
        return [...res1.slice(0, res1.length - 1), ...res2];
    } else {
        return [points[0], points[end]];
    }
}
