import * as THREE from 'three';
import { state } from './state';
import type { Tile } from './terrain';
import { fetchOverpassData } from './utils';
import { getAltitudeAt } from './analysis';
import { terrainUniforms } from './terrain';

const hydroMemoryCache = new Map<string, any[]>();
const hydroFetchPromises = new Map<string, Promise<any[] | null>>();
const zoneFailureCooldown = new Map<string, number>();
const CACHE_NAME = 'suntrail-hydro-v1';

// Matériau partagé pour l'eau (Performance)
const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x0055bb,
    transparent: true,
    opacity: 0.5,
    roughness: 0.05,
    metalness: 0.6,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
});

// --- AJOUT DES ONDULATIONS DYNAMIQUES (v5.8.4) ---
waterMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = terrainUniforms.uTime;
        shader.vertexShader = `
        uniform float uTime;
        ${shader.vertexShader}
    `.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        // Rouleaux coordonnés entre les tuiles (coordonnées monde absolues)
        // Amplitude réduite à ±0.8m max (vs ±3.7m avant) pour éviter les artéfacts
        // shadow map aux LOD 17-18 où l'eau pénétrait le terrain (v5.11.1)
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        float t = uTime * 0.8;
        float w1 = sin(worldPos.x * 0.002 + worldPos.z * 0.0015 + t) * 0.6;
        float w2 = sin(worldPos.x * 0.001 - worldPos.z * 0.0025 + t * 0.7) * 0.3;
        transformed.z += (w1 + w2); 
    `);
    
    shader.fragmentShader = `
        uniform float uTime;
        ${shader.fragmentShader}
    `.replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>
        // Scintillement des normales en lignes coordonné sur la vue
        float t = uTime * 1.5;
        // Basse fréquence (0.005) pour éviter le moiré
        float ripple = sin(vViewPosition.x * 0.005 + vViewPosition.y * 0.003 + t);
        ripple += sin(vViewPosition.x * 0.002 - vViewPosition.y * 0.006 + t * 0.8) * 0.5;
        
        vec3 rippleNormal = vec3(
            ripple * 0.1,
            1.0,
            ripple * 0.08
        );
        normal = normalize(rippleNormal);
    `);
};

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
    } catch (e) { console.warn('[Hydrology] Cache read failed, proceeding without cache:', e); }

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
        } catch(e) { console.warn('[Hydrology] Cache write failed silently:', e); }
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
                // Base rehaussée à +2m (vs +1m) pour compenser l'amplitude résiduelle ±0.9m
                // et éviter que la vague à son creux passe sous le terrain (artefact LOD 17-18)
                mesh.position.y = baseAlt + 2.0;
                mesh.receiveShadow = true;
                
                group.add(mesh);
            } catch (e) { console.warn('[Hydrology] Water mesh creation failed silently:', e); }
        }
    });

    if (group.children.length > 0) {
        tile.hydroGroup = group;
        tile.mesh.add(group);
    }
}
