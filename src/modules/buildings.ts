import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import { state } from './state';
import { getAltitudeAt } from './analysis';
import { fetchOverpassData } from './utils';
import type { Tile } from './terrain';

const buildingMemoryCache = new Map<string, any[]>();
const buildingFetchPromises = new Map<string, Promise<any[] | null>>();
const zoneFailureCooldown = new Map<string, number>();
const CACHE_NAME = 'suntrail-buildings-v5';

export async function loadBuildingsForTile(tile: Tile) {
    if (!state.isPro || !state.SHOW_BUILDINGS || tile.zoom < state.BUILDING_ZOOM_THRESHOLD || (tile.status as string) === 'disposed') return;
    if (tile.buildingMesh) return;

    if (state.isUserInteracting) {
        setTimeout(() => loadBuildingsForTile(tile), 1000);
        return;
    }

    // 1. TENTATIVE VIA MAPTILER VECTOR TILES (Plus rapide, optimisé tuile)
    if (!state.isMapTilerDisabled && state.MK) {
        try {
            const maptilerBuildings = await fetchBuildingsMapTiler(tile);
            if (maptilerBuildings && maptilerBuildings.length > 0) {
                renderBuildingsMapTiler(tile, maptilerBuildings);
                return;
            }
        } catch (e) {
            console.warn("[MapTiler] Erreur bâtiments, bascule sur OSM");
        }
    }

    // 2. REPLI SUR OSM OVERPASS (Logic existante)
    const zoneZ = 12;
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
            zoneFailureCooldown.set(zoneKey, Date.now() + 60000); 
        }
        buildingFetchPromises.delete(zoneKey);
    }

    if (!buildings || buildings.length === 0 || (tile.status as string) === 'disposed') return;

    const bounds = tile.getBounds();
    const tileBuildings = buildings.filter(el => {
        if (!el.geometry || el.geometry.length === 0) return false;
        const lat = el.geometry[0].lat;
        const lon = el.geometry[0].lon;
        return lat <= bounds.north && lat >= bounds.south && lon <= bounds.east && lon >= bounds.west;
    });

    if (tileBuildings.length > 0) {
        renderBuildingsMerged(tile, tileBuildings);
    }
}

async function fetchBuildingsMapTiler(tile: Tile): Promise<any[] | null> {
    // Les Vector Tiles 'buildings' de MapTiler sont natifs jusqu'au Z14
    const requestZoom = Math.min(tile.zoom, 14);
    const ratio = Math.pow(2, tile.zoom - requestZoom);
    const rtx = Math.floor(tile.tx / ratio);
    const rty = Math.floor(tile.ty / ratio);

    const url = `https://api.maptiler.com/tiles/buildings/${requestZoom}/${rtx}/${rty}.pbf?key=${state.MK}`;
    
    try {
        const response = await fetch(url);
        // Si 400 ou 403, on désactive MapTiler pour cette session
        if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 429) {
            console.warn(`[MapTiler] API Error ${response.status}. Fallback to OSM.`);
            state.isMapTilerDisabled = true;
            return null;
        }
        if (!response.ok) return null;

        const buffer = await response.arrayBuffer();
        const vt = new VectorTile(new Pbf(buffer));
        // La couche s'appelle 'building' dans le tileset 'buildings'
        const layer = vt.layers.building;
        if (!layer) return null;

        const features = [];
        
        for (let i = 0; i < layer.length; i++) {
            const f = layer.feature(i);
            features.push({
                geometry: f.loadGeometry(),
                properties: f.properties,
                type: f.type
            });
        }
        return features;
    } catch (e) {
        return null;
    }
}

function renderBuildingsMapTiler(tile: Tile, features: any[]) {
    if ((tile.status as string) === 'disposed' || !tile.mesh) return;

    const geometries: THREE.BufferGeometry[] = [];
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x999999, 
        roughness: 0.7,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
    });

    const limit = state.BUILDING_LIMIT || 150; 
    const EXTENT = 4096; // MapTiler default extent
    
    const requestZoom = Math.min(tile.zoom, 14);
    const ratio = Math.pow(2, tile.zoom - requestZoom);
    const offsetX = (tile.tx % ratio) * EXTENT / ratio;
    const offsetY = (tile.ty % ratio) * EXTENT / ratio;
    const subExtent = EXTENT / ratio;

    features.slice(0, limit * 2).forEach(f => {
        if (f.geometry && f.geometry.length > 0) {
            // Filtrage : est-ce que le bâtiment est dans notre sous-tuile ?
            const firstP = f.geometry[0][0];
            if (firstP.x < offsetX || firstP.x >= offsetX + subExtent || firstP.y < offsetY || firstP.y >= offsetY + subExtent) {
                return;
            }

            const points: THREE.Vector2[] = [];
            f.geometry[0].forEach((p: any) => {
                const lx = ((p.x - offsetX) / subExtent - 0.5) * tile.tileSizeMeters;
                const lz = ((p.y - offsetY) / subExtent - 0.5) * tile.tileSizeMeters;
                points.push(new THREE.Vector2(lx, -lz));
            });

            try {
                const shape = new THREE.Shape(points);
                const height = (f.properties.render_height || 12) * state.RELIEF_EXAGGERATION;
                const minHeight = (f.properties.render_min_height || 0) * state.RELIEF_EXAGGERATION;
                
                const bGeo = new THREE.ExtrudeGeometry(shape, { 
                    depth: Math.max(1, height - minHeight), 
                    bevelEnabled: false 
                });

                const centerLX = ((f.geometry[0][0].x - offsetX) / subExtent - 0.5) * tile.tileSizeMeters;
                const centerLZ = ((f.geometry[0][0].y - offsetY) / subExtent - 0.5) * tile.tileSizeMeters;
                const baseAlt = getAltitudeAt(tile.worldX + centerLX, tile.worldZ + centerLZ, tile);

                bGeo.rotateX(-Math.PI / 2);
                bGeo.translate(0, baseAlt + minHeight, 0);
                geometries.push(bGeo);
            } catch (e) { console.warn('[Buildings] Geometry processing (MapTiler) failed silently:', e); }
        }
    });

    finalizeMergedMesh(tile, geometries, material);
}

function finalizeMergedMesh(tile: Tile, geometries: THREE.BufferGeometry[], material: THREE.Material) {
    if (geometries.length > 0) {
        try {
            const merged = BufferGeometryUtils.mergeGeometries(geometries);
            const mesh = new THREE.Mesh(merged, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
            
            if (tile.buildingMesh) tile.mesh!.remove(tile.buildingMesh);
            tile.buildingMesh = mesh;
            tile.mesh!.add(mesh);
        } catch (e) {
        } finally {
            geometries.forEach(g => g.dispose());
        }
    }
}

async function fetchBuildingsWithCache(z: number, x: number, y: number, key: string): Promise<any[] | null> {
    try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(key);
        if (cached) return await cached.json();
    } catch (e) { console.warn('[Buildings] Cache read failed, proceeding without cache:', e); }

    const n = Math.pow(2, z);
    const w = x / n * 360 - 180;
    const e = (x + 1) / n * 360 - 180;
    const latNorth = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
    const latSouth = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;

    const query = `[out:json][timeout:25];(way["building"](${latSouth.toFixed(4)},${w.toFixed(4)},${latNorth.toFixed(4)},${e.toFixed(4)});way["tourism"~"alpine_hut|hotel"](${latSouth.toFixed(4)},${w.toFixed(4)},${latNorth.toFixed(4)},${e.toFixed(4)}););out body geom;`;
    
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

function renderBuildingsMerged(tile: Tile, elements: any[]) {
    if ((tile.status as string) === 'disposed' || !tile.mesh) return;

    const geometries: THREE.BufferGeometry[] = [];
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x888888, 
        roughness: 0.8,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
    });
    
    const limit = state.BUILDING_LIMIT || 60;

    elements.slice(0, limit).forEach(el => {
        if (el.type === 'way' && el.geometry) {
            const points: THREE.Vector2[] = [];
            for (let j = el.geometry.length - 1; j >= 0; j--) {
                const p = el.geometry[j];
                const localPos = tile.lngLatToLocal(p.lon, p.lat);
                points.push(new THREE.Vector2(localPos.x, -localPos.z));
            }

            try {
                const shape = new THREE.Shape(points);
                const height = (el.tags?.['building:levels'] ? el.tags['building:levels'] * 4.5 : 12) * state.RELIEF_EXAGGERATION;
                const bGeo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });

                const center = tile.lngLatToLocal(el.geometry[0].lon, el.geometry[0].lat);
                const baseAlt = getAltitudeAt(tile.worldX + center.x, tile.worldZ + center.z, tile);

                bGeo.rotateX(-Math.PI / 2);
                bGeo.translate(0, baseAlt, 0);
                geometries.push(bGeo);
            } catch (e) { console.warn('[Buildings] Geometry processing (Overpass) failed silently:', e); }
        }
    });

    finalizeMergedMesh(tile, geometries, material);
}

