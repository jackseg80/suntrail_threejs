import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { BoundedCache } from './boundedCache';
import { state } from './state';
import { isPositionInSwitzerland, getPow2, xNormToLon, yNormToLat } from './geo';
import type { Tile } from './terrain';

export interface BBox { minX: number; maxX: number; minY: number; maxY: number; }
export interface Point2D { x: number; y: number; }

export interface VectorFeature {
    geometry: Point2D[][];
    bbox?: BBox;
    properties?: Record<string, any>;
    type?: number;
    extent?: number;
}

export interface LandcoverData {
    forests: VectorFeature[];
    water: VectorFeature[];
    buildings: VectorFeature[];
    forestGrid?: VectorFeature[][]; // v5.36.0 : Grille spatiale pour accélération
}

const GRID_SIZE = 16;
const CELL_UNITS = 4096 / GRID_SIZE;

/**
 * Construit une grille spatiale pour accélérer les tests Point-in-Polygon (v5.36.0)
 */
function buildSpatialGrid(features: VectorFeature[]): VectorFeature[][] {
    const grid: VectorFeature[][] = Array.from({ length: GRID_SIZE * GRID_SIZE }, () => []);
    features.forEach(feat => {
        if (!feat.bbox) return;
        const startX = Math.max(0, Math.floor(feat.bbox.minX / CELL_UNITS));
        const endX = Math.min(GRID_SIZE - 1, Math.floor(feat.bbox.maxX / CELL_UNITS));
        const startY = Math.max(0, Math.floor(feat.bbox.minY / CELL_UNITS));
        const endY = Math.min(GRID_SIZE - 1, Math.floor(feat.bbox.maxY / CELL_UNITS));

        for (let gx = startX; gx <= endX; gx++) {
            for (let gy = startY; gy <= endY; gy++) {
                grid[gy * GRID_SIZE + gx].push(feat);
            }
        }
    });
    return grid;
}

// Cache des données vectorielles (Z10-Z14)
const landcoverCache = new BoundedCache<string, LandcoverData>({ maxSize: 100 });
const fetchPromises = new Map<string, Promise<LandcoverData | null>>();

/**
 * Récupère les données sémantiques (Forêts, Eau, Bâtiments) via tuiles vectorielles.
 * Tier 1: SwissTopo (Gratuit, Suisse, Z12)
 * Tier 3: MapTiler (Monde, Overzoom Z10 pour préserver quota)
 */
export async function fetchLandcoverPBF(tile: Tile): Promise<LandcoverData | null> {
    const n = getPow2(tile.zoom);
    const lon = xNormToLon((tile.tx + 0.5) / n);
    const lat = yNormToLat((tile.ty + 0.5) / n);

    const inCH = isPositionInSwitzerland(lat, lon);
    
    // v5.33.1 : Utilisation de Z12 pour SwissTopo pour une meilleure couverture sémantique
    // v5.40.27 : Passage à Z14 pour la Suisse pour éviter la généralisation des bâtiments en blocs
    const requestZoom = inCH ? 14 : 10;
    const ratio = getPow2(tile.zoom - requestZoom);
    const rtx = Math.floor(tile.tx / ratio);
    const rty = Math.floor(tile.ty / ratio);
    const cacheKey = `${inCH ? 'ch' : 'mt'}-${requestZoom}-${rtx}-${rty}`;

    const cached = landcoverCache.get(cacheKey);
    if (cached) return cached;

    if (fetchPromises.has(cacheKey)) return fetchPromises.get(cacheKey)!;

    const promise = (async () => {
        let url = "";
        if (inCH) {
            // v5.33.1 : Correction URL officielle SwissTopo
            url = `https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/${requestZoom}/${rtx}/${rty}.pbf`;
        } else {
            if (!state.MK || state.isMapTilerDisabled) return null;
            // v5.33.1 : Correction URL MapTiler (la couche landcover est dans la v3 standard)
            url = `https://api.maptiler.com/tiles/v3/${requestZoom}/${rtx}/${rty}.pbf?key=${state.MK}`;
        }

        try {
            const res = await fetch(url, { referrerPolicy: 'same-origin' });
            if (!res.ok) {
                if (res.status === 404) console.warn(`[Landcover] Tile not found: ${url}`);
                return null;
            }
            const buffer = await res.arrayBuffer();
            
            // @ts-ignore
            const PbfConstructor = Pbf.default || Pbf;
            const vtile = new VectorTile(new PbfConstructor(buffer));
            
            const forests: any[] = [];
            const water: any[] = [];
            const buildings: any[] = [];

            // --- 1. EXTRACTION FORÊTS ---
            const forestLayer = vtile.layers.landcover || vtile.layers.park || vtile.layers.landuse;
            if (forestLayer) {
                for (let i = 0; i < forestLayer.length; i++) {
                    const feat = forestLayer.feature(i);
                    const cls = feat.properties.class || feat.properties.subclass || feat.properties.type;
                    if (cls === 'wood' || cls === 'forest' || feat.properties.landuse === 'forest') {
                        const geometry = feat.loadGeometry();
                        
                        // Calcul d'une BBox simplifiée pour filtrage rapide
                        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                        geometry.forEach((ring: any[]) => {
                            ring.forEach(p => {
                                if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
                                if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
                            });
                        });

                        forests.push({
                            geometry,
                            bbox: { minX, maxX, minY, maxY }
                        });
                    }
                }
            }

            // --- 2. EXTRACTION EAU ---
            const waterLayer = vtile.layers.water || vtile.layers.waterway;
            if (waterLayer) {
                for (let i = 0; i < waterLayer.length; i++) {
                    const feat = waterLayer.feature(i);
                    // On ne prend que les polygones (water) ou les rivières larges
                    if (feat.type === 3 || feat.properties.class === 'river' || feat.properties.class === 'stream') {
                        const geometry = feat.loadGeometry();
                        const extent = waterLayer.extent || 4096;
                        
                        // Calcul d'une BBox simplifiée pour filtrage rapide
                        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                        geometry.forEach((ring: any[]) => {
                            ring.forEach(p => {
                                if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
                                if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
                            });
                        });

                        water.push({
                            type: feat.type,
                            geometry: geometry,
                            properties: feat.properties,
                            extent: extent,
                            bbox: { minX, maxX, minY, maxY }
                        });
                    }
                }
            }

            // --- 3. EXTRACTION BÂTIMENTS (v5.35.0) ---
            const buildingLayer = vtile.layers.building || vtile.layers.buildings;
            if (buildingLayer) {
                for (let i = 0; i < buildingLayer.length; i++) {
                    const feat = buildingLayer.feature(i);
                    const geometry = feat.loadGeometry();
                    const extent = buildingLayer.extent || 4096;
                    
                    // Calcul BBox
                    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                    geometry.forEach((ring: any[]) => {
                        ring.forEach(p => {
                            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
                            if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
                        });
                    });

                    buildings.push({
                        geometry,
                        properties: feat.properties,
                        extent,
                        bbox: { minX, maxX, minY, maxY }
                    });
                }
            }

            const data: LandcoverData = { 
                forests, 
                water, 
                buildings,
                forestGrid: buildSpatialGrid(forests)
            };
            landcoverCache.set(cacheKey, data);
            return data;
        } catch (e) {
            console.warn('[Landcover] Fetch failed:', e);
            return null;
        } finally {
            fetchPromises.delete(cacheKey);
        }
    })();

    fetchPromises.set(cacheKey, promise);
    return promise;
}

/**
 * Vérifie si un point local à une tuile (0-scanRes) se trouve dans une forêt.
 */
export function isPointInForest(
    px: number, 
    py: number, 
    scanRes: number, 
    forests: VectorFeature[], 
    ratio: number, 
    tileTx: number, 
    tileTy: number,
    forestGrid?: VectorFeature[][]
): boolean {
    if (!forests || forests.length === 0) return false;

    // Coordonnées locales (0-4095) dans la tuile source vectorielle
    const localX = (px / scanRes) * 4096;
    const localY = (py / scanRes) * 4096;
    
    // Projection vers les coordonnées de la tuile overzoomée (Mercator Linéaire)
    const targetX = (tileTx % ratio) * (4096 / ratio) + (localX / ratio);
    const targetY = (tileTy % ratio) * (4096 / ratio) + (localY / ratio);

    // v5.36.0 : Utilisation de la grille pour ne tester que les candidats probables
    let candidates = forests;
    if (forestGrid) {
        const gx = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(targetX / CELL_UNITS)));
        const gy = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(targetY / CELL_UNITS)));
        candidates = forestGrid[gy * GRID_SIZE + gx];
    }

    for (const poly of candidates) {
        // v5.33.6 : Filtrage spatial ultra-rapide (Bounding Box)
        if (poly.bbox) {
            if (targetX < poly.bbox.minX || targetX > poly.bbox.maxX || targetY < poly.bbox.minY || targetY > poly.bbox.maxY) {
                continue;
            }
        }

        let inside = false;
        for (const ring of poly.geometry) {
            if (isPointInRing(targetX, targetY, ring)) {
                inside = !inside;
            }
        }
        if (inside) return true;
    }
    return false;
}

function isPointInRing(x: number, y: number, ring: {x: number, y: number}[]) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        if (((ring[i].y > y) !== (ring[j].y > y)) &&
            (x < (ring[j].x - ring[i].x) * (y - ring[i].y) / (ring[j].y - ring[i].y) + ring[i].x)) {
            inside = !inside;
        }
    }
    return inside;
}
