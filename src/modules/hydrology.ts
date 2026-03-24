import * as THREE from 'three';
import { state } from './state';
import type { Tile } from './terrain';
import { fetchOverpassData } from './utils';
import { getAltitudeAt } from './analysis';

const hydroMemoryCache = new Map<string, any[]>();
const hydroFetchPromises = new Map<string, Promise<any[] | null>>();
const zoneFailureCooldown = new Map<string, number>();
const CACHE_NAME = 'suntrail-hydro-v1';

// Matériau partagé pour l'eau (Performance)
const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x0055bb,
    transparent: true,
    opacity: 0.5,
    roughness: 0.02,
    metalness: 0.6,
    polygonOffset: true,
    polygonOffsetFactor: -2, // Légèrement plus haut pour dominer les variations de relief
    polygonOffsetUnits: -2
});

/**
 * Charge l'hydrologie 3D (Lacs et Rivières larges)
 */
export async function loadHydrologyForTile(tile: Tile) {
    if (!state.SHOW_HYDROLOGY || tile.zoom < 13 || (tile.status as string) === 'disposed') return;
    if (tile.hydroGroup) return;

    if (state.isUserInteracting) {
        setTimeout(() => loadHydrologyForTile(tile), 1000);
        return;
    }

    const zoneZ = 12;
    const ratio = Math.pow(2, tile.zoom - zoneZ);
    const zx = Math.floor(tile.tx / ratio);
    const zy = Math.floor(tile.ty / ratio);
    const zoneKey = `hydro_z${zoneZ}_${zx}_${zy}`;

    const failTime = zoneFailureCooldown.get(zoneKey);
    if (failTime && Date.now() < failTime) return;

    let elements: any[] | null | undefined = hydroMemoryCache.get(zoneKey);

    if (!elements) {
        let promise = hydroFetchPromises.get(zoneKey);
        if (!promise) {
            promise = fetchHydroWithCache(zoneZ, zx, zy, zoneKey);
            hydroFetchPromises.set(zoneKey, promise);
        }
        elements = await promise;
        if (elements) {
            hydroMemoryCache.set(zoneKey, elements);
        } else {
            zoneFailureCooldown.set(zoneKey, Date.now() + 60000);
        }
        hydroFetchPromises.delete(zoneKey);
    }

    if (!elements || elements.length === 0 || (tile.status as string) === 'disposed') return;

    const bounds = tile.getBounds();
    
    const tileHydro = elements.filter(el => {
        if (!el.geometry || el.geometry.length === 0) return false;
        const lat = el.geometry[0].lat;
        const lon = el.geometry[0].lon;
        return lat <= bounds.north && lat >= bounds.south && lon <= bounds.east && lon >= bounds.west;
    });

    if (tileHydro.length > 0) {
        renderHydrology(tile, tileHydro);
    }
}

async function fetchHydroWithCache(z: number, x: number, y: number, key: string): Promise<any[] | null> {
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

    // On cherche les lacs (natural=water) et les larges rivières (waterway=riverbank)
    const query = `[out:json][timeout:25];(way["natural"="water"](${latSouth.toFixed(4)},${w.toFixed(4)},${latNorth.toFixed(4)},${e.toFixed(4)});way["waterway"~"riverbank|dock"](${latSouth.toFixed(4)},${w.toFixed(4)},${latNorth.toFixed(4)},${e.toFixed(4)}););out body geom;`;
    
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

function renderHydrology(tile: Tile, elements: any[]) {
    if ((tile.status as string) === 'disposed' || !tile.mesh) return;

    const group = new THREE.Group();

    elements.forEach(el => {
        if (el.type === 'way' && el.geometry && el.geometry.length > 2) {
            const points: THREE.Vector2[] = [];
            let avgX = 0, avgZ = 0;

            el.geometry.forEach((p: any) => {
                const localPos = tile.lngLatToLocal(p.lon, p.lat);
                points.push(new THREE.Vector2(localPos.x, -localPos.z));
                avgX += localPos.x;
                avgZ += localPos.z;
            });
            avgX /= el.geometry.length;
            avgZ /= el.geometry.length;

            try {
                const shape = new THREE.Shape(points);
                const geometry = new THREE.ShapeGeometry(shape);
                
                // Détection de l'altitude : On échantillonne le terrain au centre de l'objet d'eau
                const worldX = tile.worldX + avgX;
                const worldZ = tile.worldZ + avgZ;
                const baseAlt = getAltitudeAt(worldX, worldZ, tile);

                const mesh = new THREE.Mesh(geometry, waterMaterial);
                mesh.rotateX(-Math.PI / 2);
                mesh.position.y = baseAlt + 1.0; 
                mesh.receiveShadow = true;
                
                group.add(mesh);
            } catch (e) {}
        }
    });

    if (group.children.length > 0) {
        tile.hydroGroup = group;
        tile.mesh.add(group);
    }
}
