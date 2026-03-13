import * as THREE from 'three';
import { state } from './state';
import { getAltitudeAt } from './analysis';
import { lngLatToWorld } from './terrain';

interface Signpost {
    id: number;
    lat: number;
    lon: number;
    name?: string;
}

const signpostMemoryCache = new Map<string, Signpost[]>();
const signpostFetchPromises = new Map<string, Promise<Signpost[] | null>>();
const signpostTexture = createSignpostTexture();

const CACHE_NAME = 'suntrail-poi-v1';
const OVERPASS_SERVERS = [
    'https://overpass.openstreetmap.fr/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
];
let currentServerIdx = 0;
let lastRequestTime = 0;
const GLOBAL_FETCH_DELAY = 2500;

function createSignpostTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        // Losange Jaune (Style Swisstopo)
        ctx.beginPath();
        ctx.moveTo(32, 8); ctx.lineTo(56, 32); ctx.lineTo(32, 56); ctx.lineTo(8, 32);
        ctx.closePath();
        ctx.fillStyle = '#FFD700'; ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 5; ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
}

export async function loadPOIsForTile(tile: any): Promise<THREE.Group | null> {
    if (tile.zoom < 14 || !state.SHOW_SIGNPOSTS) return null;

    const zoneZ = 12;
    const ratio = Math.pow(2, tile.zoom - zoneZ);
    const zx = Math.floor(tile.tx / ratio);
    const zy = Math.floor(tile.ty / ratio);
    const zoneKey = `${zoneZ}_${zx}_${zy}`;

    let signposts = signpostMemoryCache.get(zoneKey);

    if (!signposts) {
        let fetchPromise = signpostFetchPromises.get(zoneKey);
        if (!fetchPromise) {
            fetchPromise = fetchPOIsWithRetry(zoneZ, zx, zy);
            signpostFetchPromises.set(zoneKey, fetchPromise);
        }
        signposts = await fetchPromise;
        if (signposts) signpostMemoryCache.set(zoneKey, signposts);
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

async function fetchPOIsWithRetry(z: number, x: number, y: number): Promise<Signpost[] | null> {
    const cacheKey = `poi_${z}_${x}_${y}`;
    
    try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(cacheKey);
        if (cached) return await cached.json();
    } catch (e) {}

    const now = Date.now();
    const waitTime = Math.max(0, (lastRequestTime + GLOBAL_FETCH_DELAY) - now);
    if (waitTime > 0) await new Promise(r => setTimeout(r, waitTime));
    lastRequestTime = Date.now();

    const bounds = getTileBounds({ zoom: z, tx: x, ty: y });
    const query = `[out:json][timeout:15];node["information"~"guidepost|map|board"](${bounds.south.toFixed(6)},${bounds.west.toFixed(6)},${bounds.north.toFixed(6)},${bounds.east.toFixed(6)});out body;`;
    
    for (let attempt = 0; attempt < OVERPASS_SERVERS.length; attempt++) {
        const server = OVERPASS_SERVERS[currentServerIdx];
        try {
            const response = await fetch(`${server}?data=${encodeURIComponent(query)}`);
            if (response.ok) {
                const data = await response.json();
                const signposts = data.elements.map((el: any) => ({
                    id: el.id, lat: el.lat, lon: el.lon, name: el.tags.name
                }));
                const cache = await caches.open(CACHE_NAME);
                await cache.put(cacheKey, new Response(JSON.stringify(signposts)));
                return signposts;
            }
            currentServerIdx = (currentServerIdx + 1) % OVERPASS_SERVERS.length;
        } catch (e) {
            currentServerIdx = (currentServerIdx + 1) % OVERPASS_SERVERS.length;
        }
    }
    return null;
}

function createSignpostGroup(signposts: Signpost[], tile: any): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.SpriteMaterial({ 
        map: signpostTexture, 
        transparent: true, 
        depthTest: true,
        sizeAttenuation: true 
    });

    signposts.forEach(poi => {
        const worldPos = lngLatToWorld(poi.lon, poi.lat);
        const localX = worldPos.x - tile.worldX;
        const localZ = worldPos.z - tile.worldZ;
        
        let alt = getAltitudeAt(worldPos.x, worldPos.z);
        if (alt === 0) alt = 1500; 

        const sprite = new THREE.Sprite(material);
        sprite.scale.set(25, 25, 1);
        sprite.position.set(localX, alt + 10, localZ); 
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
