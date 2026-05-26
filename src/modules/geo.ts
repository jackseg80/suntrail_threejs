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
 * Polygone simplifié de la Suisse (~54 points, précision ~2 km).
 * Contour OSM (relation 51701) simplifié via Ramer-Douglas-Peucker.
 * Format : [lon, lat] (convention GeoJSON).
 */
export const SWITZERLAND_POLYGON: number[][] = [
    [5.956248, 46.132004],
    [6.294686, 46.225153],
    [6.219551, 46.311884],
    [6.335202, 46.403716],
    [6.681871, 46.454333],
    [6.821070, 46.427157],
    [6.797569, 46.136710],
    [7.101549, 45.859175],
    [7.570121, 45.987679],
    [7.863563, 45.916700],
    [8.154025, 46.146219],
    [8.085672, 46.266551],
    [8.446126, 46.463701],
    [8.444463, 46.248958],
    [8.852035, 46.075631],
    [8.785922, 45.989150],
    [9.017535, 45.817988],
    [9.038,    45.829000],  // Chiasso — correction pointe du Tessin
    [9.009541, 46.037382],
    [9.248590, 46.233699],
    [9.282229, 46.496479],
    [9.463549, 46.508876],
    [9.549538, 46.302342],
    [9.952759, 46.379301],
    [10.132300, 46.224879],
    [10.043958, 46.540118],
    [10.238877, 46.635352],
    [10.471554, 46.542865],
    [10.381797, 46.684305],
    [10.489352, 46.937789],
    [10.384695, 46.999997],
    [10.105242, 46.840885],
    [9.876130, 46.934628],
    [9.876246, 47.021227],
    [9.475786, 47.051752],
    [9.658569, 47.452617],
    [9.267701, 47.656237],
    [8.894162, 47.648255],
    [8.568028, 47.808454],
    [8.405576, 47.674200],
    [8.628632, 47.648985],
    [8.464184, 47.572192],
    [7.589039, 47.589897],
    [7.246518, 47.420342],
    [6.982967, 47.494551],
    [6.879326, 47.352580],
    [7.056984, 47.334368],
    [6.432655, 46.928684],
    [6.452400, 46.773983],
    [6.110491, 46.576448],
    [6.063858, 46.416395],
    [6.169917, 46.366084],
    [5.955832, 46.132308],
    [5.956248, 46.132004],
];

/** BBox englobante de la Suisse — pré-calculée au chargement du module. */
const _CH_BBOX: BBox = (() => {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const [lon, lat] of SWITZERLAND_POLYGON) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
    }
    return { minLat, maxLat, minLon, maxLon };
})();

/**
 * Polygones par pays. Structure extensible : ajouter une entrée pour
 * généraliser le test frontalier à n'importe quel pays.
 */
const COUNTRY_POLYGONS: Record<string, number[][]> = {
    CH: SWITZERLAND_POLYGON,
};

/** BBox pré-calculées par pays. */
const COUNTRY_BBOX: Record<string, BBox> = {
    CH: _CH_BBOX,
};

/**
 * Test point-dans-polygone (algorithme ray-casting, O(n), zéro allocation).
 * Accepte des coordonnées [lon, lat] (compatibles GeoJSON).
 */
export function isPointInPolygon(px: number, py: number, polygon: number[][]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Vérifie si un point (lat, lon) est dans un pays donné.
 * Pré-vérification rapide via BBox suivie d'un test polygone.
 * Si le pays n'a pas de polygone, retourne false.
 */
export function isPointInCountry(lat: number, lon: number, countryCode: string): boolean {
    const polygon = COUNTRY_POLYGONS[countryCode];
    if (!polygon) return false;
    const bbox = COUNTRY_BBOX[countryCode];
    if (lon < bbox.minLon || lon > bbox.maxLon || lat < bbox.minLat || lat > bbox.maxLat) return false;
    return isPointInPolygon(lon, lat, polygon);
}

/**
 * Vérifie si une tuile est majoritairement dans un pays en testant 5 points
 * (centre + 4 coins). Retourne true si ≥ threshold points sont à l'intérieur.
 *
 * @param threshold 3 = majorité simple, 5 = strict (tous les points).
 *                  Recommandé : 3 pour LOD ≤ 14, 5 pour LOD > 14.
 */
export function isTileInCountry(
    tx: number, ty: number, zoom: number,
    countryCode: string,
    threshold: number = 3
): boolean {
    const n = getPow2(zoom);
    const points: [number, number][] = [[tx + 0.5, ty + 0.5], [tx, ty], [tx + 1, ty], [tx, ty + 1], [tx + 1, ty + 1]];
    let inside = 0;
    for (const [px, py] of points) {
        const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * py / n))) * 180 / Math.PI;
        const lon = (px / n) * 360 - 180;
        if (isPointInCountry(lat, lon, countryCode)) inside++;
    }
    return inside >= threshold;
}

/** Tuile majoritairement en Suisse (≥ 3/5 points). */
export function isTileInSwitzerland(tx: number, ty: number, zoom: number): boolean {
    return isTileInCountry(tx, ty, zoom, 'CH', 3);
}

/** Tuile intégralement en Suisse (5/5 points). Utilisé pour le cap Swisstopo LOD > 14. */
export function isTileInSwitzerlandStrict(tx: number, ty: number, zoom: number): boolean {
    return isTileInCountry(tx, ty, zoom, 'CH', 5);
}

/** 
 * Limites géographiques par rectangles — conservées pour FR et IT
 * (couverture IGN / MapTiler). La Suisse utilise désormais un polygone.
 */
export const REGIONS: Record<string, BBox[]> = {
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
    return isPointInCountry(lat, lon, 'CH');
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
