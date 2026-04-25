import * as THREE from 'three';
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { state } from './state';
import { getAltitudeAt } from './analysis';
import { isPositionInSwitzerland } from './geo';
import { Tile } from './terrain/Tile';
import { BoundedCache } from './boundedCache';

/**
 * poi.ts — Migration PBF (v5.38.4)
 * Récupération de la signalétique randonnée via tuiles vectorielles.
 */

const poiMemoryCache = new BoundedCache<string, any[]>({ maxSize: 200 });
const poiFetchPromises = new Map<string, Promise<any[] | null>>();
const zoneFailureCooldown = new Map<string, number>();
const CACHE_NAME = 'suntrail-poi-v7-stable';

const signpostTexture = createSignpostTexture();

function createSignpostTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.beginPath();
        ctx.moveTo(32, 6);
        ctx.lineTo(58, 32);
        ctx.lineTo(32, 58);
        ctx.lineTo(6, 32);
        ctx.closePath();
        if (ctx.createRadialGradient) {
            const grad = ctx.createRadialGradient(32, 32, 5, 32, 32, 30);
            grad.addColorStop(0, '#FFEB3B'); 
            grad.addColorStop(1, '#FBC02D');
            ctx.fillStyle = grad;
        } else { ctx.fillStyle = '#FFD700'; }
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.stroke();
    }
    return new THREE.CanvasTexture(canvas);
}

export async function loadPOIsForTile(tile: Tile) {
    if (!state.SHOW_SIGNPOSTS || tile.zoom < state.POI_ZOOM_THRESHOLD || tile.status !== 'loaded') return;
    if (tile.poiGroup) return;

    if (state.isUserInteracting) {
        setTimeout(() => loadPOIsForTile(tile), 1000);
        return;
    }
    const zoneZ = 14;
    const ratio = Math.pow(2, tile.zoom - zoneZ);
    const zx = Math.floor(tile.tx / ratio);
    const zy = Math.floor(tile.ty / ratio);
    
    const n = Math.pow(2, zoneZ);
    const lon = (zx + 0.5) / n * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (zy + 0.5) / n)));
    const lat = latRad * 180 / Math.PI;
    const inCH = isPositionInSwitzerland(lat, lon);

    const zoneKey = `poi_z${zoneZ}_${zx}_${zy}_${inCH ? 'ch' : 'mt'}`;

    const failTime = zoneFailureCooldown.get(zoneKey);
    if (failTime && Date.now() < failTime) return;

    let pois: any[] | null | undefined = poiMemoryCache.get(zoneKey);

    if (!pois) {
        let promise = poiFetchPromises.get(zoneKey);
        if (!promise) {
            promise = fetchPOIsWithCache(zoneZ, zx, zy, zoneKey, inCH);
            poiFetchPromises.set(zoneKey, promise);
        }
        pois = await promise;
        if (pois) {
            poiMemoryCache.set(zoneKey, pois);
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

async function fetchPOIsWithCache(z: number, x: number, y: number, key: string, inCH: boolean): Promise<any[] | null> {
    try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(key);
        if (cached) return await cached.json();
    } catch (e) {}

    let url = "";
    if (inCH) {
        url = `https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/${z}/${x}/${y}.pbf`;
    } else {
        if (!state.MK || state.isMapTilerDisabled) return null;
        url = `https://api.maptiler.com/tiles/v3/${z}/${x}/${y}.pbf?key=${state.MK}`;
    }

    try {
        const res = await fetch(url, { referrerPolicy: 'same-origin' });
        if (!res.ok) return null;
        const buffer = await res.arrayBuffer();
        
        // @ts-ignore
        const PbfConstructor = Pbf.default || Pbf;
        const vtile = new VectorTile(new PbfConstructor(buffer));
        
        const elements: any[] = [];
        const layers = Object.keys(vtile.layers);
        
        layers.forEach(layerName => {
            const layer = vtile.layers[layerName];
            if (!layer) return;

            for (let i = 0; i < layer.length; i++) {
                const feat = layer.feature(i);
                const props = feat.properties;
                
                const rawString = JSON.stringify(props).toLowerCase();
                const isSignpost = 
                    rawString.includes('guidepost') || 
                    rawString.includes('signpost') ||
                    rawString.includes('hiking') ||
                    props.class === 'information' ||
                    props.subclass === 'information' ||
                    props.tourism === 'information';

                if (isSignpost) {
                    const geom = feat.loadGeometry()[0][0];
                    const extent = layer.extent || 4096;
                    
                    const lon = (x + geom.x / extent) / Math.pow(2, z) * 360 - 180;
                    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + geom.y / extent) / Math.pow(2, z))));
                    const lat = latRad * 180 / Math.PI;

                    elements.push({
                        id: feat.id || Math.random(),
                        lat,
                        lon,
                        tags: { name: props.name || props.name_en || "Signalétique" }
                    });
                }
            }
        });

        const uniqueElements = Array.from(new Map(elements.map(e => [`${e.lat.toFixed(5)}|${e.lon.toFixed(5)}`, e])).values());

        try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(key, new Response(JSON.stringify(uniqueElements)));
        } catch(e) {}
        
        return uniqueElements;
    } catch (e) {
        console.warn('[POI] PBF Fetch failed:', e);
        return null;
    }
}

function renderPOIs(tile: Tile, elements: any[]) {
    if (tile.status !== 'loaded' || !state.scene) return;

    const group = new THREE.Group();
    const material = new THREE.SpriteMaterial({ 
        map: signpostTexture, 
        transparent: true, 
        depthTest: true,
        depthWrite: false,
        sizeAttenuation: true
    });

    elements.forEach(el => {
        // Position relative au début de la tuile ( worldX / worldZ )
        const local = tile.lngLatToLocal(el.lon, el.lat);
        
        // Altitude : 0 en 2D pour éviter le "vol" au-dessus de la carte plate,
        // sinon altitude réelle du terrain en 3D.
        let h = 0;
        if (!state.IS_2D_MODE) {
            const worldX = tile.worldX + local.x;
            const worldZ = tile.worldZ + local.z;
            h = getAltitudeAt(worldX, worldZ, tile);
        }

        const sprite = new THREE.Sprite(material);
        sprite.scale.set(24, 24, 1);
        
        // On place le sprite. En 2D h=0, donc il est collé à la carte.
        sprite.position.set(local.x, h + 12, local.z);
        sprite.userData = { name: el.tags?.name || "Signalétique", lat: el.lat, lon: el.lon };
        group.add(sprite);
    });

    if (tile.poiGroup && state.scene) state.scene.remove(tile.poiGroup);
    
    tile.poiGroup = group;
    // On cale le groupe à la position monde de la tuile pour que tout soit stable
    tile.poiGroup.position.set(tile.worldX, 0, tile.worldZ);
    state.scene.add(tile.poiGroup);
}
