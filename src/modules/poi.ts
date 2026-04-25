import * as THREE from 'three';
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { state } from './state';
import { getAltitudeAt } from './analysis';
import { isPositionInSwitzerland } from './geo';
import { Tile } from './terrain/Tile';
import { BoundedCache } from './boundedCache';

/**
 * poi.ts — Finalisation de la Signalétique (v5.39.2)
 * Récupération et rendu différencié des POIs via tuiles vectorielles.
 */

type POICategory = 'guidepost' | 'viewpoint' | 'shelter' | 'info';

interface POIData {
    id: number | string;
    lat: number;
    lon: number;
    name: string;
    category: POICategory;
}

const poiMemoryCache = new BoundedCache<string, POIData[]>({ maxSize: 200 });
const poiFetchPromises = new Map<string, Promise<POIData[] | null>>();
const zoneFailureCooldown = new Map<string, number>();
const CACHE_NAME = 'suntrail-poi-v8-categories';

// Cache des textures par catégorie
const textureCache = new Map<POICategory, THREE.Texture>();

function getPOITexture(category: POICategory): THREE.Texture {
    if (textureCache.has(category)) return textureCache.get(category)!;

    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
        // Ombre portée commune
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;

        if (category === 'guidepost') {
            // Losange jaune classique
            ctx.beginPath();
            ctx.moveTo(32, 6); ctx.lineTo(58, 32); ctx.lineTo(32, 58); ctx.lineTo(6, 32); ctx.closePath();
            const grad = ctx.createRadialGradient(32, 32, 5, 32, 32, 30);
            grad.addColorStop(0, '#FFEB3B'); grad.addColorStop(1, '#FBC02D');
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.stroke();
        } else if (category === 'viewpoint') {
            // Cercle bleu avec icône belvédère (télescope simplifié)
            ctx.beginPath(); ctx.arc(32, 32, 26, 0, Math.PI * 2);
            ctx.fillStyle = '#3b82f8'; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 32px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('🔭', 32, 34);
        } else if (category === 'shelter') {
            // Carré vert avec icône abri
            ctx.fillStyle = '#10b981';
            if (ctx.roundRect) {
                ctx.roundRect(8, 8, 48, 48, 8);
            } else {
                ctx.rect(8, 8, 48, 48);
            }
            ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 32px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('🏠', 32, 34);
        } else if (category === 'info') {
            // Cercle orange avec icône "i"
            ctx.beginPath(); ctx.arc(32, 32, 26, 0, Math.PI * 2);
            ctx.fillStyle = '#f59e0b'; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 34px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('i', 32, 32);
        }
    }

    const tex = new THREE.CanvasTexture(canvas);
    textureCache.set(category, tex);
    return tex;
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

    let pois: POIData[] | null | undefined = poiMemoryCache.get(zoneKey);

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

async function fetchPOIsWithCache(z: number, x: number, y: number, key: string, inCH: boolean): Promise<POIData[] | null> {
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
        
        const elements: POIData[] = [];
        const layers = Object.keys(vtile.layers);
        
        layers.forEach(layerName => {
            const layer = vtile.layers[layerName];
            if (!layer) return;

            for (let i = 0; i < layer.length; i++) {
                const feat = layer.feature(i);
                const props = feat.properties;
                const raw = JSON.stringify(props).toLowerCase();

                let category: POICategory | null = null;
                
                // Logique de catégorisation améliorée
                if (props.class === 'viewpoint' || props.tourism === 'viewpoint') {
                    category = 'viewpoint';
                } else if (props.amenity === 'shelter' || props.class === 'shelter') {
                    category = 'shelter';
                } else if (props.information === 'map' || props.information === 'board' || props.tourism === 'information') {
                    category = 'info';
                } else if (raw.includes('guidepost') || raw.includes('signpost') || props.hiking === 'yes') {
                    category = 'guidepost';
                }

                if (category) {
                    const geom = feat.loadGeometry()[0][0];
                    const extent = layer.extent || 4096;
                    
                    const lon = (x + geom.x / extent) / Math.pow(2, z) * 360 - 180;
                    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + geom.y / extent) / Math.pow(2, z))));
                    const lat = latRad * 180 / Math.PI;

                    elements.push({
                        id: feat.id || `${lat.toFixed(6)}|${lon.toFixed(6)}`,
                        lat,
                        lon,
                        name: String(props.name || props.name_en || "Point d'intérêt"),
                        category
                    });
                }
            }
        });

        // Déduplication par position
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

function renderPOIs(tile: Tile, elements: POIData[]) {
    if (tile.status !== 'loaded' || !state.scene) return;

    const group = new THREE.Group();
    
    // On crée une Map locale de matériaux pour cette tuile pour éviter les redondances
    const materials = new Map<POICategory, THREE.SpriteMaterial>();

    elements.forEach(el => {
        const local = tile.lngLatToLocal(el.lon, el.lat);
        
        let h = 0;
        if (!state.IS_2D_MODE) {
            const worldX = tile.worldX + local.x;
            const worldZ = tile.worldZ + local.z;
            h = getAltitudeAt(worldX, worldZ, tile);
        }

        // Récupération ou création du matériau pour la catégorie
        if (!materials.has(el.category)) {
            materials.set(el.category, new THREE.SpriteMaterial({
                map: getPOITexture(el.category),
                transparent: true,
                depthTest: true,
                depthWrite: false,
                sizeAttenuation: true
            }));
        }

        const sprite = new THREE.Sprite(materials.get(el.category));
        sprite.scale.set(24, 24, 1);
        sprite.position.set(local.x, h + 12, local.z);
        sprite.userData = { name: el.name, lat: el.lat, lon: el.lon, category: el.category };
        group.add(sprite);
    });

    if (tile.poiGroup && state.scene) state.scene.remove(tile.poiGroup);
    
    tile.poiGroup = group;
    tile.poiGroup.position.set(tile.worldX, 0, tile.worldZ);
    state.scene.add(tile.poiGroup);
}
