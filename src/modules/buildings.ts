import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { state } from './state';
import { getAltitudeAt } from './analysis';
import { fetchOverpassData } from './utils';
import { getTileBounds } from './geo';
import type { Tile } from './terrain';

const buildingMemoryCache = new Map<string, any[]>();
const buildingFetchPromises = new Map<string, Promise<any[] | null>>();
const zoneFailureCooldown = new Map<string, number>();
const CACHE_NAME = 'suntrail-buildings-v4';

export async function loadBuildingsForTile(tile: Tile) {
    // Utilisation du seuil dynamique du preset
    if (!state.SHOW_BUILDINGS || tile.zoom < state.BUILDING_ZOOM_THRESHOLD || tile.status === 'disposed') return;
    if (tile.buildingMesh) return;

    if (state.isUserInteracting) {
        setTimeout(() => loadBuildingsForTile(tile), 1000);
        return;
    }
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
            zoneFailureCooldown.set(zoneKey, Date.now() + 10000); 
        }
        buildingFetchPromises.delete(zoneKey);
    }

    if (!buildings || buildings.length === 0) return;

    const bounds = getTileBounds({ zoom: tile.zoom, tx: tile.tx, ty: tile.ty });
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

    const query = `[out:json][timeout:25];(way["building"](${latSouth.toFixed(4)},${w.toFixed(4)},${latNorth.toFixed(4)},${e.toFixed(4)});way["tourism"="alpine_hut"](${latSouth.toFixed(4)},${w.toFixed(4)},${latNorth.toFixed(4)},${e.toFixed(4)}););out body geom;`;
    
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

function renderBuildingsMerged(tile: Tile, elements: any[]) {
    if (tile.status === 'disposed' || !tile.mesh) return;

    const geometries: THREE.BufferGeometry[] = [];
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x888888, 
        roughness: 0.8,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
    });
    
    // Utilisation de la limite dynamique du preset
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
                // --- HAUTEUR BOOSTÉE POUR LES OMBRES (v5.5.1) ---
                const height = (el.tags?.['building:levels'] ? el.tags['building:levels'] * 4.5 : 12) * state.RELIEF_EXAGGERATION;
                const bGeo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });

                const center = tile.lngLatToLocal(el.geometry[0].lon, el.geometry[0].lat);
                const baseAlt = getAltitudeAt(tile.worldX + center.x, tile.worldZ + center.z, tile);

                bGeo.rotateX(-Math.PI / 2);
                bGeo.translate(0, baseAlt, 0);
                geometries.push(bGeo);
            } catch (e) {}
        }
    });

    if (geometries.length > 0) {
        try {
            const merged = BufferGeometryUtils.mergeGeometries(geometries);
            const mesh = new THREE.Mesh(merged, material);
            
            // --- ACTIVATION DES OMBRES RTX ---
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
            
            if (tile.buildingMesh) tile.mesh.remove(tile.buildingMesh);
            tile.buildingMesh = mesh;
            tile.mesh.add(mesh);
        } catch (e) {
        } finally {
            geometries.forEach(g => g.dispose());
        }
    }
}
