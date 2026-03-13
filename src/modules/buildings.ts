import * as THREE from 'three';
import { state, PRESETS } from './state';
import { getAltitudeAt } from './analysis';
import { lngLatToWorld, getTileBounds } from './geo';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface BuildingFeature {
    id: number;
    tags: Record<string, string>;
    coordinates: { lat: number; lon: number }[];
}

const CACHE_NAME = 'suntrail-buildings-v2';
const OVERPASS_SERVERS = [
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'https://overpass-api.de/api/interpreter'
];
let currentServerIdx = 0;
let globalRequestLock = Promise.resolve(); 

const buildingMemoryCache = new Map<string, BuildingFeature[]>();
const buildingFetchPromises = new Map<string, Promise<BuildingFeature[] | null>>();
const zoneFailureCooldown = new Map<string, number>(); 

// Matériau Style "Maquette blanche" premium
const buildingMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.4,
    metalness: 0.2,
    emissive: 0x222222,
});

export async function loadBuildingsForTile(tile: any): Promise<THREE.Mesh | null> {
    if (!state.SHOW_BUILDINGS) return null;
    
    const preset = state.PERFORMANCE_PRESET !== 'custom' ? PRESETS[state.PERFORMANCE_PRESET] : null;
    const maxZoom = preset ? preset.MAX_ALLOWED_ZOOM : 18;
    if (tile.zoom < 14 || tile.zoom > maxZoom) return null;

    const zoneZ = 12;
    const ratio = Math.pow(2, tile.zoom - zoneZ);
    const zx = Math.floor(tile.tx / ratio);
    const zy = Math.floor(tile.ty / ratio);
    const zoneKey = `bldg_${zoneZ}_${zx}_${zy}`;

    const failTime = zoneFailureCooldown.get(zoneKey);
    if (failTime && Date.now() < failTime) return null;

    let buildings = buildingMemoryCache.get(zoneKey);

    if (!buildings) {
        let fetchPromise = buildingFetchPromises.get(zoneKey);
        if (!fetchPromise) {
            fetchPromise = fetchBuildingsWithLock(zoneZ, zx, zy);
            buildingFetchPromises.set(zoneKey, fetchPromise);
        }
        
        const fetched = await fetchPromise;
        if (fetched && fetched.length > 0) {
            buildings = fetched;
            buildingMemoryCache.set(zoneKey, buildings);
        } else {
            zoneFailureCooldown.set(zoneKey, Date.now() + 30000); 
        }
        buildingFetchPromises.delete(zoneKey);
    }

    if (!buildings || buildings.length === 0) return null;

    const bounds = getTileBounds(tile);
    const tileBuildings = buildings.filter(b => {
        if (!b.coordinates || b.coordinates.length === 0) return false;
        const pt = b.coordinates[0];
        return pt.lat >= bounds.south && pt.lat <= bounds.north &&
               pt.lon >= bounds.west && pt.lon <= bounds.east;
    });

    if (tileBuildings.length === 0) return null;

    return createBuildingMesh(tileBuildings);
}

async function fetchBuildingsWithLock(z: number, x: number, y: number): Promise<BuildingFeature[] | null> {
    await globalRequestLock;
    const res = await fetchBuildingsWithCache(z, x, y);
    globalRequestLock = new Promise(resolve => setTimeout(resolve, 2000));
    return res;
}

async function fetchBuildingsWithCache(z: number, x: number, y: number): Promise<BuildingFeature[] | null> {
    const cacheKey = `bldg_${z}_${x}_${y}`;
    
    try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(cacheKey);
        if (cached) return await cached.json();
    } catch (e) {}

    const bounds = getTileBounds({ zoom: z, tx: x, ty: y });
    const query = `[out:json][timeout:30];(way["building"](${bounds.south.toFixed(6)},${bounds.west.toFixed(6)},${bounds.north.toFixed(6)},${bounds.east.toFixed(6)});way["tourism"="alpine_hut"](${bounds.south.toFixed(6)},${bounds.west.toFixed(6)},${bounds.north.toFixed(6)},${bounds.east.toFixed(6)}););out body geom;`;
    
    for (let attempt = 0; attempt < OVERPASS_SERVERS.length; attempt++) {
        const server = OVERPASS_SERVERS[currentServerIdx];
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 35000);
            const response = await fetch(`${server}?data=${encodeURIComponent(query)}`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                const features: BuildingFeature[] = [];
                if (data.elements) {
                    data.elements.forEach((el: any) => {
                        if (el.type === 'way' && el.geometry) {
                            features.push({
                                id: el.id,
                                tags: el.tags || {},
                                coordinates: el.geometry.map((g: any) => ({ lat: g.lat, lon: g.lon }))
                            });
                        }
                    });
                }
                const cache = await caches.open(CACHE_NAME);
                await cache.put(cacheKey, new Response(JSON.stringify(features)));
                return features;
            }
            currentServerIdx = (currentServerIdx + 1) % OVERPASS_SERVERS.length;
        } catch (e) {
            currentServerIdx = (currentServerIdx + 1) % OVERPASS_SERVERS.length;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    return null;
}

function createBuildingMesh(buildings: BuildingFeature[]): THREE.Mesh | null {
    const geometries: THREE.BufferGeometry[] = [];

    buildings.forEach(bldg => {
        try {
            const worldPoints = bldg.coordinates.map(gps => lngLatToWorld(gps.lon, gps.lat, state.originTile));
            let cx = 0, cz = 0;
            worldPoints.forEach(p => { cx += p.x; cz += p.z; });
            cx /= worldPoints.length;
            cz /= worldPoints.length;
            
            const alt = getAltitudeAt(cx, cz);
            if (alt === 0) return; 

            const shapePoints: THREE.Vector2[] = [];
            worldPoints.forEach(p => {
                shapePoints.push(new THREE.Vector2(p.x - cx, -(p.z - cz)));
            });

            if (shapePoints.length > 2 && shapePoints[0].distanceTo(shapePoints[shapePoints.length-1]) < 0.1) {
                shapePoints.pop();
            }

            const shape = new THREE.Shape(shapePoints);
            let heightMeters = 6; 
            if (bldg.tags['height']) heightMeters = parseFloat(bldg.tags['height']) || 6;
            else if (bldg.tags['building:levels']) heightMeters = (parseFloat(bldg.tags['building:levels']) || 2) * 3.5;

            const foundationDepth = 30; 
            const totalHeight = (heightMeters + foundationDepth) * state.RELIEF_EXAGGERATION;

            const geom = new THREE.ExtrudeGeometry(shape, { depth: totalHeight, bevelEnabled: false });
            geom.rotateX(-Math.PI / 2);
            geom.translate(cx, alt - (foundationDepth * state.RELIEF_EXAGGERATION), cz);
            geometries.push(geom);
        } catch (e) {}
    });

    if (geometries.length === 0) return null;

    try {
        const mergedGeometry = mergeGeometries(geometries, false);
        if (!mergedGeometry) return null;
        const mesh = new THREE.Mesh(mergedGeometry, buildingMaterial);
        
        const preset = state.PERFORMANCE_PRESET !== 'custom' ? PRESETS[state.PERFORMANCE_PRESET] : null;
        const allowShadows = preset ? preset.BUILDINGS_SHADOWS : true;
        
        mesh.castShadow = state.SHADOWS && allowShadows;
        mesh.receiveShadow = true;
        return mesh;
    } catch (e) {
        return null;
    }
}
