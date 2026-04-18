import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { state } from './state';
import { Tile } from './terrain/Tile';
import { fetchOverpassData, isOverpassInBackoff } from './utils';
import { getAltitudeAt } from './analysis';
import { BoundedCache } from './boundedCache';
import { disposeObject } from './memory';

// ── REGISTRE GLOBAL (v5.30.13) ──────────────────────────────────────────────
// SEUL point de vérité pour éviter les doublons orphelins dans la scène.
const activeBuildingGroups = new Map<string, THREE.Group>();

// Caches mémoire
const buildingMemoryCache = new BoundedCache<string, any[]>({ maxSize: 200 });
const maptilerFeaturesCache = new BoundedCache<string, any[]>({ maxSize: 100 });
const maptilerFetchPromises = new Map<string, Promise<any[] | null>>();
const CACHE_NAME = 'suntrail-buildings-v4';

// Matériaux
const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7, metalness: 0.2 });
const buildingMaterial2D = new THREE.MeshBasicMaterial({ color: 0xcccccc });

/**
 * Charge les bâtiments 3D pour une tuile.
 */
export async function loadBuildingsForTile(tile: Tile) {
    if (!state.SHOW_BUILDINGS || tile.zoom < 14 || (tile.status as string) === 'disposed') return;
    
    const tileKey = tile.key;
    
    // v5.30.13 : Si un chargement est déjà en cours ou fini pour cette clé, on ne fait RIEN.
    if (activeBuildingGroups.has(tileKey) || (tile as any)._isFetchingBuildings) return;

    (tile as any)._isFetchingBuildings = true;

    try {
        // --- PHASE 1 : MAPTILER ---
        if (!state.isMapTilerDisabled) {
            const maptilerBuildings = await fetchBuildingsMapTiler(tile);
            if (tile.status as string === 'disposed') return;
            if (maptilerBuildings && maptilerBuildings.length > 0) {
                renderBuildingsMerged(tile, maptilerBuildings);
                return;
            }
        }

        // --- PHASE 2 : OVERPASS (Fallback) ---
        if (isOverpassInBackoff()) return;
        
        const zoneZ = 14; 
        const ratio = Math.pow(2, tile.zoom - zoneZ);
        const zx = Math.floor(tile.tx / ratio);
        const zy = Math.floor(tile.ty / ratio);
        const zoneKey = `bld_z${zoneZ}_${zx}_${zy}`;

        let buildings = buildingMemoryCache.get(zoneKey);
        if (!buildings) {
            buildings = await fetchBuildingsWithCache(zoneZ, zx, zy, zoneKey);
        }

        if (tile.status as string === 'disposed' || !buildings || buildings.length === 0) return;

        const bounds = tile.getBounds();
        const tileBuildings = buildings.filter(el => {
            if (!el.geometry || el.geometry.length === 0) return false;
            let sumLat = 0, sumLon = 0;
            for (const p of el.geometry) { sumLat += p.lat; sumLon += p.lon; }
            const clat = sumLat / el.geometry.length;
            const clon = sumLon / el.geometry.length;
            return clat <= bounds.north && clat >= bounds.south && clon <= bounds.east && clon >= bounds.west;
        });

        if (tileBuildings.length > 0) {
            renderBuildingsMerged(tile, tileBuildings);
        }
    } catch (e) {
        console.warn('[Buildings] Load failed:', e);
    } finally {
        (tile as any)._isFetchingBuildings = false;
    }
}

/**
 * Supprime les bâtiments d'une tuile du registre et de la scène (v5.30.13).
 */
export function removeBuildingsForTile(tileKey: string) {
    const group = activeBuildingGroups.get(tileKey);
    if (group) {
        if (state.scene) state.scene.remove(group);
        disposeObject(group);
        activeBuildingGroups.delete(tileKey);
    }
}

function renderBuildingsMerged(tile: Tile, elements: any[], limit: number = 150) {
    const tileKey = tile.key;
    if ((tile.status as string) === 'disposed') return;

    // 1. Nettoyage absolu via le registre avant tout nouvel ajout
    removeBuildingsForTile(tileKey);

    const geometries: THREE.BufferGeometry[] = [];
    const processed = elements.slice(0, limit);

    processed.forEach(el => {
        if (el.geometry && el.geometry.length > 2) {
            const points: THREE.Vector2[] = [];
            el.geometry.forEach((p: any) => {
                const localPos = tile.lngLatToLocal(p.lon, p.lat);
                points.push(new THREE.Vector2(localPos.x, -localPos.z));
            });

            try {
                const shape = new THREE.Shape(points);
                const levels = el.tags?.['building:levels'] || el.tags?.levels;
                const height = (levels ? parseFloat(levels) * 3.5 : 8) * state.RELIEF_EXAGGERATION;
                const skirt = 20 * state.RELIEF_EXAGGERATION; 
                
                let minTerrainAlt = Infinity;
                points.forEach(p => {
                    const alt = getAltitudeAt(tile.worldX + p.x, tile.worldZ - p.y, tile);
                    if (alt < minTerrainAlt) minTerrainAlt = alt;
                });
                
                if (minTerrainAlt === Infinity || minTerrainAlt === 0) return;

                const matrix = new THREE.Matrix4()
                    .makeRotationX(-Math.PI / 2)
                    .setPosition(tile.worldX, minTerrainAlt - skirt, tile.worldZ);
                
                const finalGeo = new THREE.ExtrudeGeometry(shape, { depth: height + skirt, bevelEnabled: false });
                finalGeo.applyMatrix4(matrix);
                geometries.push(finalGeo);
            } catch (e) {}
        }
    });

    if (geometries.length > 0) {
        try {
            const merged = BufferGeometryUtils.mergeGeometries(geometries);
            const is2D = state.IS_2D_MODE;
            const mesh = new THREE.Mesh(merged, is2D ? buildingMaterial2D : buildingMaterial);
            mesh.castShadow = !is2D && (state.PERFORMANCE_PRESET === 'ultra' || state.PERFORMANCE_PRESET === 'performance');
            mesh.receiveShadow = !is2D;

            const group = new THREE.Group();
            group.add(mesh);
            
            // 2. Ajout à la scène et au registre
            if (state.scene) {
                state.scene.add(group);
                activeBuildingGroups.set(tileKey, group);
            }
        } catch (e) {}
        finally {
            geometries.forEach(g => g.dispose());
        }
    }
}

// Les fonctions de fetch (MapTiler/Cache) restent identiques à la logique stable
async function fetchBuildingsMapTiler(tile: Tile): Promise<any[] | null> {
    const requestZoom = Math.min(tile.zoom, 14);
    const ratio = Math.pow(2, tile.zoom - requestZoom);
    const rtx = Math.floor(tile.tx / ratio);
    const rty = Math.floor(tile.ty / ratio);
    const cacheKey = `${requestZoom}/${rtx}/${rty}`;

    const cached = maptilerFeaturesCache.get(cacheKey);
    if (cached) return cached;

    let promise = maptilerFetchPromises.get(cacheKey);
    if (!promise) {
        promise = (async () => {
            if (!state.MK) return null;
            const url = `https://api.maptiler.com/tiles/buildings/${requestZoom}/${rtx}/${rty}.pbf?key=${state.MK}`;
            try {
                const response = await fetch(url);
                if (response.status === 403 || response.status === 401) {
                    state.isMapTilerDisabled = true;
                    return null;
                }
                if (!response.ok) return null;
                const buffer = await response.arrayBuffer();
                // @ts-ignore
                const PbfConstructor = (Pbf.default || Pbf);
                const vtile = new VectorTile(new PbfConstructor(buffer));
                const layer = vtile.layers.building;
                if (!layer) return [];
                const features = [];
                const n = Math.pow(2, requestZoom);
                for (let i = 0; i < layer.length; i++) {
                    const feat = layer.feature(i);
                    const rings = feat.loadGeometry();
                    if (!rings || rings.length === 0) continue;
                    const points = rings[0].map(p => {
                        const lon = (p.x / 4096 + rtx) / n * 360 - 180;
                        const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (p.y / 4096 + rty) / n)));
                        return { lat: latRad * 180 / Math.PI, lon };
                    });
                    features.push({ tags: feat.properties, geometry: points });
                }
                return features;
            } catch (e) { return null; }
        })();
        maptilerFetchPromises.set(cacheKey, promise);
    }
    const features = await promise;
    if (features) maptilerFeaturesCache.set(cacheKey, features);
    maptilerFetchPromises.delete(cacheKey);
    return features;
}

async function fetchBuildingsWithCache(z: number, x: number, y: number, key: string): Promise<any[] | null> {
    try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(key);
        if (cached) return await cached.json();
    } catch (e) {}
    const n = Math.pow(2, z);
    const w = x / n * 360 - 180;
    const e = (x + 1) / n * 360 - 180;
    const latNorth = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
    const latSouth = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;
    const query = `[out:json][timeout:25];way["building"](${latSouth.toFixed(4)},${w.toFixed(4)},${latNorth.toFixed(4)},${e.toFixed(4)});out body geom;`;
    const data = await fetchOverpassData(query);
    if (data && data.elements) {
        try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(key, new Response(JSON.stringify(data.elements)));
        } catch(e) {}
        return data.elements;
    }
    return null;
}
