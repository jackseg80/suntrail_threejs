import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { state } from './state';
import { Tile } from './terrain/Tile';
import { fetchOverpassData, isOverpassInBackoff } from './utils';
import { getAltitudeAt } from './analysis';
import { BoundedCache } from './boundedCache';

// Caches bornés pour éviter l'explosion mémoire (LRU v5.28.20)
const buildingMemoryCache = new BoundedCache<string, any[]>({ maxSize: 200 });
const maptilerFeaturesCache = new BoundedCache<string, any[]>({ maxSize: 100 });

const buildingFetchPromises = new Map<string, Promise<any[] | null>>();
const maptilerFetchPromises = new Map<string, Promise<any[] | null>>();
const zoneFailureCooldown = new Map<string, number>();
const COOLDOWN_MAX_SIZE = 200;
const CACHE_NAME = 'suntrail-buildings-v4';

// Matériaux partagés (Performance v5.4.1)
const buildingMaterial = new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    roughness: 0.7,
    metalness: 0.2
});

/**
 * Charge les bâtiments 3D pour une tuile (v5.28.20)
 * Priorité : MapTiler (Vector Tiles) > OSM Overpass (Fallback)
 */
export async function loadBuildingsForTile(tile: Tile) {
    if (!state.SHOW_BUILDINGS || tile.zoom < 14 || (tile.status as string) === 'disposed') return;
    if (tile.buildingGroup) return;

    // Throttle des requêtes pendant l'interaction utilisateur
    if (state.isUserInteracting) {
        setTimeout(() => loadBuildingsForTile(tile), 1000);
        return;
    }

    // --- PHASE 1 : MAPTILER (Vector Tiles ultra-rapides) ---
    if (!state.isMapTilerDisabled) {
        const maptilerBuildings = await fetchBuildingsMapTiler(tile);
        if (maptilerBuildings && maptilerBuildings.length > 0) {
            renderBuildingsMerged(tile, maptilerBuildings, 50);
            return;
        }
    }

    // --- PHASE 2 : OVERPASS (OSM Fallback ou zones non couvertes) ---
    if (isOverpassInBackoff()) return;

    const zoneZ = 14; 
    const ratio = Math.pow(2, tile.zoom - zoneZ);
    const zx = Math.floor(tile.tx / ratio);
    const zy = Math.floor(tile.ty / ratio);
    const zoneKey = `bld_z${zoneZ}_${zx}_${zy}`;

    const failTime = zoneFailureCooldown.get(zoneKey);
    if (failTime && Date.now() < failTime) return;

    let buildings: any[] | null | undefined = buildingMemoryCache.get(zoneKey);

    if (!buildings) {
        let promise = buildingFetchPromises.get(zoneKey);
        if (!promise) {
            promise = fetchBuildingsWithCache(zoneZ, zx, zy, zoneKey);
            buildingFetchPromises.set(zoneKey, promise);
        }
        buildings = await promise;
        if (buildings) {
            buildingMemoryCache.set(zoneKey, buildings);
        } else {
            // Purger les entrées expirées pour borner la taille du cache
            if (zoneFailureCooldown.size > COOLDOWN_MAX_SIZE) {
                const now = Date.now();
                for (const [k, v] of zoneFailureCooldown) {
                    if (now >= v) zoneFailureCooldown.delete(k);
                }
            }
            zoneFailureCooldown.set(zoneKey, Date.now() + 60000);
        }
        buildingFetchPromises.delete(zoneKey);
    }

    if (!buildings || buildings.length === 0 || (tile.status as string) === 'disposed') return;

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
        renderBuildingsMerged(tile, tileBuildings, 50);
    }
}

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
            const url = `https://api.maptiler.com/tiles/buildings/${requestZoom}/${rtx}/${rty}.pbf?key=${state.MK}`;
            try {
                const response = await fetch(url);
                if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 429) {
                    console.warn(`[MapTiler] API Error ${response.status}. Fallback to OSM.`);
                    state.isMapTilerDisabled = true;
                    return null;
                }
                const buffer = await response.arrayBuffer();
                const vtile = new VectorTile(new Pbf(buffer));
                const layer = vtile.layers.building;
                if (!layer) return [];

                const features = [];
                for (let i = 0; i < layer.length; i++) {
                    const feat = layer.feature(i);
                    const geo = feat.loadGeometry();
                    // Conversion MapTiler (4096 units) vers LngLat
                    const points = geo[0].map(p => {
                        const lon = (p.x / 4096 + rtx) / Math.pow(2, requestZoom) * 360 - 180;
                        const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (p.y / 4096 + rty) / Math.pow(2, requestZoom))));
                        return { lat: latRad * 180 / Math.PI, lon };
                    });
                    features.push({
                        tags: feat.properties,
                        geometry: points
                    });
                }
                return features;
            } catch (e) {
                console.warn('[MapTiler] Fetch failed:', e);
                return null;
            }
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
    } catch (e) { console.warn('[Buildings] Cache read failed:', e); }

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
        } catch(e) { console.warn('[Buildings] Cache write failed silently:', e); }
        return data.elements;
    }
    return null;
}

function renderBuildingsMerged(tile: Tile, elements: any[], limit: number = 50) {
    if ((tile.status as string) === 'disposed' || !tile.mesh) return;

    const geometries: THREE.BufferGeometry[] = [];
    const processed = elements.slice(0, limit);

    processed.forEach(el => {
        if (el.geometry && el.geometry.length > 2) {
            const points: THREE.Vector2[] = [];
            // Points pour l'échantillonnage de l'altitude (4 coins + centre)
            const samples: {x: number, z: number}[] = [];
            
            el.geometry.forEach((p: any) => {
                const localPos = tile.lngLatToLocal(p.lon, p.lat);
                points.push(new THREE.Vector2(localPos.x, -localPos.z));
            });

            try {
                const shape = new THREE.Shape(points);
                const height = (el.tags?.['building:levels'] ? parseFloat(el.tags['building:levels']) * 3.5 : 8) * state.RELIEF_EXAGGERATION;
                const extrudeGeo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });

                // --- CORRECTION ANTI-GRAVITÉ (v5.28.5) ---
                // On échantillonne l'altitude à plusieurs points pour trouver le point le plus bas
                // de l'emprise du bâtiment sur le terrain.
                const box = new THREE.Box2().setFromPoints(points);
                const center = new THREE.Vector2(); box.getCenter(center);
                samples.push({x: center.x, z: -center.y});
                samples.push({x: box.min.x, z: -box.min.y});
                samples.push({x: box.max.x, z: -box.max.y});
                samples.push({x: box.min.x, z: -box.max.y});
                samples.push({x: box.max.x, z: -box.min.y});

                let minTerrainAlt = Infinity;
                samples.forEach(s => {
                    const alt = getAltitudeAt(tile.worldX + s.x, tile.worldZ + s.z, tile);
                    if (alt < minTerrainAlt) minTerrainAlt = alt;
                });

                // On ancre le bâtiment au point le plus bas et on ajoute une "jupe" de 5m
                // pour s'assurer qu'il pénètre le terrain partout, même sur pente raide.
                const skirt = 5 * state.RELIEF_EXAGGERATION;
                const matrix = new THREE.Matrix4()
                    .makeRotationX(-Math.PI / 2)
                    .setPosition(0, minTerrainAlt - skirt, 0);
                
                // Ajuster la géométrie pour inclure la jupe
                const finalHeight = height + skirt;
                // Note: On recrée avec la bonne profondeur car ExtrudeGeometry ne se scale pas bien en Y
                const finalGeo = new THREE.ExtrudeGeometry(shape, { depth: finalHeight, bevelEnabled: false });
                finalGeo.applyMatrix4(matrix);

                geometries.push(finalGeo);
            } catch (e) { console.warn('[Buildings] Mesh creation failed silently:', e); }
        }
    });

    if (geometries.length > 0) {
        try {
            const merged = BufferGeometryUtils.mergeGeometries(geometries);
            const mesh = new THREE.Mesh(merged, buildingMaterial);
            mesh.castShadow = (state.PERFORMANCE_PRESET === 'ultra');
            mesh.receiveShadow = true;

            // v5.28.1 : Mandat - PAS de hierarchy attachment (scene.add)
            if (tile.buildingGroup && state.scene) state.scene.remove(tile.buildingGroup);
            
            tile.buildingGroup = new THREE.Group();
            tile.buildingGroup.add(mesh);
            tile.buildingGroup.position.set(tile.worldX, 0, tile.worldZ);
            
            if (state.scene) state.scene.add(tile.buildingGroup);
        } catch (e) { console.warn('[Buildings] Geometry merge failed:', e); }
        finally {
            geometries.forEach(g => g.dispose());
        }
    }
}
