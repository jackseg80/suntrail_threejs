import * as THREE from 'three';
import { state } from './state';
import { getAltitudeAt } from './analysis';
import { lngLatToWorld } from './terrain';

interface Signpost {
    id: number; lat: number; lon: number; name?: string;
}

const signpostMemoryCache = new Map<string, Signpost[]>();
const signpostFetchPromises = new Map<string, Promise<Signpost[] | null>>();
const zoneFailureCooldown = new Map<string, number>(); // ZoneKey -> Timestamp expiration
const signpostTexture = createSignpostTexture();

const CACHE_NAME = 'suntrail-poi-v1';
const OVERPASS_SERVERS = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter'
];
let currentServerIdx = 0;
let globalRequestLock = Promise.resolve(); 

function createSignpostTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.beginPath();
        ctx.moveTo(32, 10); ctx.lineTo(54, 32); ctx.lineTo(32, 54); ctx.lineTo(10, 32);
        ctx.closePath();
        ctx.fillStyle = '#FFD700'; ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.stroke();
    }
    return new THREE.CanvasTexture(canvas);
}

export async function loadPOIsForTile(tile: any): Promise<THREE.Group | null> {
    if (tile.zoom < 14 || !state.SHOW_SIGNPOSTS) return null;

    // --- MEGA-ZONES Z10 (~40km) ---
    const zoneZ = 10;
    const ratio = Math.pow(2, tile.zoom - zoneZ);
    const zx = Math.floor(tile.tx / ratio);
    const zy = Math.floor(tile.ty / ratio);
    const zoneKey = `${zoneZ}_${zx}_${zy}`;

    // 1. Vérifier si la zone est en "cooldown" suite à un échec récent
    const failTime = zoneFailureCooldown.get(zoneKey);
    if (failTime && Date.now() < failTime) return null;

    // 2. Vérifier le cache mémoire
    let signposts: Signpost[] | null | undefined = signpostMemoryCache.get(zoneKey);

    if (!signposts) {
        let fetchPromise = signpostFetchPromises.get(zoneKey);
        if (!fetchPromise) {
            fetchPromise = fetchWithGlobalLock(zoneZ, zx, zy);
            signpostFetchPromises.set(zoneKey, fetchPromise);
        }
        signposts = await fetchPromise;
        if (signposts) {
            signpostMemoryCache.set(zoneKey, signposts);
        } else {
            // En cas d'échec, on met la zone en sommeil 2 minutes pour ne pas harceler l'API
            zoneFailureCooldown.set(zoneKey, Date.now() + 120000);
        }
        signpostFetchPromises.delete(zoneKey);
    }

    if (!signposts || signposts.length === 0) return null;

    const bounds = getTileBounds(tile);
    const tileSignposts = signposts.filter(p => 
        p.lat >= bounds.south && p.lat <= bounds.north &&
        p.lon >= bounds.west && p.lon <= bounds.east
    );

    if (tileSignposts.length === 0) return null;
    return createSignpostGroup(tileSignposts, tile);
}

async function fetchWithGlobalLock(z: number, x: number, y: number): Promise<Signpost[] | null> {
    const res = await globalRequestLock.then(() => fetchPOIsWithCache(z, x, y));
    // Délai de 5s entre chaque appel global pour la v4.0.2
    globalRequestLock = new Promise(resolve => setTimeout(resolve, 5000));
    return res;
}

import { isPositionInSwitzerland, showToast } from './utils';

// ... (existing imports)

async function fetchPOIsWithCache(z: number, x: number, y: number): Promise<Signpost[] | null> {
    const cacheKey = `poi_${z}_${x}_${y}`;
    
    try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(cacheKey);
        if (cached) return await cached.json();
    } catch (e) {}

    const bounds = getTileBounds({ zoom: z, tx: x, ty: y });
    const query = `[out:json][timeout:30];node["information"~"guidepost|map|board"](${bounds.south.toFixed(6)},${bounds.west.toFixed(6)},${bounds.north.toFixed(6)},${bounds.east.toFixed(6)});out body;`;
    
    for (let attempt = 0; attempt < OVERPASS_SERVERS.length; attempt++) {
        const server = OVERPASS_SERVERS[currentServerIdx];
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 35000); // Timeout réduit

            const response = await fetch(`${server}?data=${encodeURIComponent(query)}`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                const signposts = data.elements.map((el: any) => ({
                    id: el.id, lat: el.lat, lon: el.lon, name: el.tags.name
                }));
                const cache = await caches.open(CACHE_NAME);
                await cache.put(cacheKey, new Response(JSON.stringify(signposts)));
                return signposts;
            }

            if (response.status === 429) {
                currentServerIdx = (currentServerIdx + 1) % OVERPASS_SERVERS.length;
                // Attendre un peu avant de changer de serveur
                await new Promise(r => setTimeout(r, 2000));
                continue; 
            }
            
            currentServerIdx = (currentServerIdx + 1) % OVERPASS_SERVERS.length;
        } catch (e) {
            currentServerIdx = (currentServerIdx + 1) % OVERPASS_SERVERS.length;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    
    console.warn("Overpass API: Tous les serveurs ont échoué ou sont saturés.");
    showToast("📍 Signalétique : Réseau saturé");
    return null;
}

function createSignpostGroup(signposts: Signpost[], tile: any): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.SpriteMaterial({ map: signpostTexture, transparent: true, depthTest: true });

    signposts.forEach(poi => {
        const worldPos = lngLatToWorld(poi.lon, poi.lat);
        const localX = worldPos.x - tile.worldX;
        const localZ = worldPos.z - tile.worldZ;
        const alt = getAltitudeAt(worldPos.x, worldPos.z);
        if (alt === 0) return;

        const sprite = new THREE.Sprite(material);
        sprite.scale.set(25, 25, 1);
        sprite.position.set(localX, alt + 25, localZ);
        sprite.userData = { name: poi.name, id: poi.id };
        group.add(sprite);
    });

    return group;
}

function getTileBounds(tile: {zoom: number, tx: number, ty: number}) {
    const n = Math.pow(2, tile.zoom);
    const lonWest = tile.tx / n * 360 - 180;
    const lonEast = (tile.tx + 1) / n * 360 - 180;
    const latRadNorth = Math.atan(Math.sinh(Math.PI * (1 - 2 * tile.ty / n)));
    const latNorth = latRadNorth * 180 / Math.PI;
    const latRadSouth = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tile.ty + 1) / n)));
    const latSouth = latRadSouth * 180 / Math.PI;
    return { north: latNorth, south: latSouth, west: lonWest, east: lonEast };
}
