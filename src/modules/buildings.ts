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

// Caches bornés
const buildingMemoryCache = new BoundedCache<string, any[]>({ maxSize: 200 });
const maptilerFeaturesCache = new BoundedCache<string, any[]>({ maxSize: 100 });

const buildingFetchPromises = new Map<string, Promise<any[] | null>>();
const maptilerFetchPromises = new Map<string, Promise<any[] | null>>();
const zoneFailureCooldown = new Map<string, number>();
const CACHE_NAME = 'suntrail-buildings-v4';

// Matériaux partagés
const buildingMaterial = new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    roughness: 0.7,
    metalness: 0.2
});

const buildingMaterial2D = new THREE.MeshBasicMaterial({
    color: 0xcccccc
});

/**
 * Charge les bâtiments 3D pour une tuile (v5.30.7)
 * Priorité : MapTiler (Vector Tiles) > OSM Overpass (Fallback)
 */
export async function loadBuildingsForTile(tile: Tile) {
    if (!state.SHOW_BUILDINGS || tile.zoom < 14 || (tile.status as string) === 'disposed') return;
    
    // Lock pour éviter les doublons et attendre que l'altitude soit prête
    if (tile.buildingGroup || (tile as any)._loadingBuildings) return;
    if (!tile.pixelData || tile.status !== 'loaded') {
        setTimeout(() => loadBuildingsForTile(tile), 500);
        return;
    }

    (tile as any)._loadingBuildings = true;

    try {
        // --- PHASE 1 : MAPTILER (Vector Tiles) ---
        if (!state.isMapTilerDisabled) {
            const maptilerBuildings = await fetchBuildingsMapTiler(tile);
            if (maptilerBuildings && maptilerBuildings.length > 0) {
                renderBuildingsMerged(tile, maptilerBuildings, 150);
                return;
            }
        }

        // --- PHASE 2 : OVERPASS (OSM Fallback) ---
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
            if (buildings) buildingMemoryCache.set(zoneKey, buildings);
            else zoneFailureCooldown.set(zoneKey, Date.now() + 60000);
            buildingFetchPromises.delete(zoneKey);
        }

        if (!buildings || buildings.length === 0 || (tile.status as string) === 'disposed') return;

        const bounds = tile.getBounds();
        const latPad = (bounds.north - bounds.south) * 0.05;
        const lonPad = (bounds.east - bounds.west) * 0.05;

        const tileBuildings = buildings.filter(el => {
            if (!el.geometry || el.geometry.length === 0) return false;
            let sumLat = 0, sumLon = 0;
            for (const p of el.geometry) { sumLat += p.lat; sumLon += p.lon; }
            const clat = sumLat / el.geometry.length;
            const clon = sumLon / el.geometry.length;
            return clat <= (bounds.north + latPad) && clat >= (bounds.south - latPad) && 
                   clon <= (bounds.east + lonPad) && clon >= (bounds.west - lonPad);
        });

        if (tileBuildings.length > 0) {
            renderBuildingsMerged(tile, tileBuildings, 150);
        }
    } catch (e) {
        console.warn('[Buildings] Load failed:', e);
    } finally {
        (tile as any)._loadingBuildings = false;
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

function renderBuildingsMerged(tile: Tile, elements: any[], limit: number = 150) {
    if ((tile.status as string) === 'disposed' || !tile.mesh) return;

    // Nettoyage de l'ancien groupe s'il existe
    if (tile.buildingGroup) {
        if (state.scene) state.scene.remove(tile.buildingGroup);
        disposeObject(tile.buildingGroup);
        tile.buildingGroup = null;
    }

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
                const skirt = 10 * state.RELIEF_EXAGGERATION; 
                
                let minTerrainAlt = Infinity;
                points.forEach(p => {
                    const alt = getAltitudeAt(tile.worldX + p.x, tile.worldZ - p.y, tile);
                    if (alt < minTerrainAlt) minTerrainAlt = alt;
                });
                
                // Si l'altitude est nulle ou infinie, on attend
                if (minTerrainAlt === Infinity || minTerrainAlt === 0) return;

                const matrix = new THREE.Matrix4()
                    .makeRotationX(-Math.PI / 2)
                    .setPosition(0, minTerrainAlt - skirt, 0);
                
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

            tile.buildingGroup = new THREE.Group();
            tile.buildingGroup.add(mesh);
            tile.buildingGroup.position.set(tile.worldX, 0, tile.worldZ);
            if (state.scene) state.scene.add(tile.buildingGroup);
        } catch (e) {}
        finally {
            geometries.forEach(g => g.dispose());
        }
    }
}
