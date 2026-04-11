import * as THREE from 'three';
import { state } from './state';
import { getAltitudeAt } from './analysis';
import { fetchOverpassData } from './utils';
import { Tile } from './terrain/Tile';
import { boundedCacheSet } from './boundedCache';

const poiMemoryCache = new Map<string, any[]>();
const poiFetchPromises = new Map<string, Promise<any[] | null>>();
const zoneFailureCooldown = new Map<string, number>();
const CACHE_NAME = 'suntrail-poi-v2';

const signpostTexture = createSignpostTexture();

function createSignpostTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        // v5.28.1 : Losange jaune (standard randonnée suisse)
        ctx.beginPath();
        ctx.moveTo(32, 10);  // Haut
        ctx.lineTo(54, 32);  // Droite
        ctx.lineTo(32, 54);  // Bas
        ctx.lineTo(10, 32);  // Gauche
        ctx.closePath();
        
        ctx.fillStyle = '#FFD700';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.stroke();
    }
    return new THREE.CanvasTexture(canvas);
}

export async function loadPOIsForTile(tile: Tile) {
    // Utilisation du seuil dynamique du preset
    if (!state.SHOW_SIGNPOSTS || tile.zoom < state.POI_ZOOM_THRESHOLD || (tile.status as string) === 'disposed') return;
    if (tile.poiGroup) return;

    if (state.isUserInteracting) {
        setTimeout(() => loadPOIsForTile(tile), 1000);
        return;
    }
    const zoneZ = 12;
    const ratio = Math.pow(2, tile.zoom - zoneZ);
    const zx = Math.floor(tile.tx / ratio);
    const zy = Math.floor(tile.ty / ratio);
    const zoneKey = `poi_z${zoneZ}_${zx}_${zy}`;

    const failTime = zoneFailureCooldown.get(zoneKey);
    if (failTime && Date.now() < failTime) return;

    let pois: any[] | null | undefined = poiMemoryCache.get(zoneKey);

    if (!pois) {
        let promise = poiFetchPromises.get(zoneKey);
        if (!promise) {
            promise = fetchPOIsWithCache(zoneZ, zx, zy, zoneKey);
            poiFetchPromises.set(zoneKey, promise);
        }
        pois = await promise;
        if (pois) {
            boundedCacheSet(poiMemoryCache, zoneKey, pois);
        } else {
            zoneFailureCooldown.set(zoneKey, Date.now() + 60000);
        }
        poiFetchPromises.delete(zoneKey);
    }

    if (!pois || pois.length === 0 || (tile.status as string) === 'disposed') return;

    const bounds = tile.getBounds();
    const tilePOIs = pois.filter(el => {
        return el.lat <= bounds.north && el.lat >= bounds.south && el.lon <= bounds.east && el.lon >= bounds.west;
    });

    if (tilePOIs.length > 0) {
        renderPOIs(tile, tilePOIs);
    }
}

async function fetchPOIsWithCache(z: number, x: number, y: number, key: string): Promise<any[] | null> {
    try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(key);
        if (cached) return await cached.json();
    } catch (e) { console.warn('[POI] Cache read failed, proceeding without cache:', e); }

    const n = Math.pow(2, z);
    const w = x / n * 360 - 180;
    const e = (x + 1) / n * 360 - 180;
    const latNorth = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
    const latSouth = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;

    const query = `[out:json][timeout:20];node["information"~"guidepost|map|board"](${latSouth.toFixed(4)},${w.toFixed(4)},${latNorth.toFixed(4)},${e.toFixed(4)});out body;`;

    const data = await fetchOverpassData(query);
    if (data && data.elements) {
        try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(key, new Response(JSON.stringify(data.elements)));
        } catch(e) { console.warn('[POI] Cache write failed silently:', e); }
        return data.elements;
    }
    return null;
}

function renderPOIs(tile: Tile, elements: any[]) {
    if (tile.status === 'disposed' || !state.scene) return;

    const group = new THREE.Group();
    const material = new THREE.SpriteMaterial({ 
        map: signpostTexture, 
        transparent: true, 
        depthTest: true,
        sizeAttenuation: true
    });

    elements.forEach(el => {
        const local = tile.lngLatToLocal(el.lon, el.lat);
        // Altitude terrain au point précis
        const baseAlt = getAltitudeAt(tile.worldX + local.x, tile.worldZ + local.z, tile);

        const sprite = new THREE.Sprite(material);
        sprite.scale.set(16, 16, 1); // Taille ajustée pour v5.28
        sprite.position.set(local.x, baseAlt + 12, local.z);
        sprite.userData = { name: el.tags?.name || "Signalétique", lat: el.lat, lon: el.lon };
        group.add(sprite);
    });

    // v5.28.1 : Mandat - PAS de hierarchy attachment (scene.add)
    if (tile.poiGroup) state.scene.remove(tile.poiGroup);
    
    tile.poiGroup = group;
    tile.poiGroup.position.set(tile.worldX, 0, tile.worldZ);
    state.scene.add(tile.poiGroup);
}
