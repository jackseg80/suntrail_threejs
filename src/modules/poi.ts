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
            
            if (ctx.createRadialGradient) {
                const grad = ctx.createRadialGradient(32, 32, 5, 32, 32, 30);
                grad.addColorStop(0, '#FFEB3B'); grad.addColorStop(1, '#FBC02D');
                ctx.fillStyle = grad;
            } else {
                ctx.fillStyle = '#FBC02D';
            }
            
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
            // @ts-ignore
            if (ctx.roundRect) {
                // @ts-ignore
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
    if (!state.SHOW_SIGNPOSTS || tile.zoom < state.POI_ZOOM_THRESHOLD || (tile.status as string) === 'disposed') return;
    if (tile.poiGroup) return;

    const n = Math.pow(2, tile.zoom);
    const lonC = (tile.tx + 0.5) / n * 360 - 180;
    const latC = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tile.ty + 0.5) / n))) * 180 / Math.PI;
    const inCH = isPositionInSwitzerland(latC, lonC);
    
    // Zoom fixe pour la signalétique (v5.38.4) : Z14 SwissTopo, Z12 MapTiler
    const requestZoom = inCH ? 14 : 12;
    const ratio = Math.pow(2, tile.zoom - requestZoom);
    const rtx = Math.floor(tile.tx / ratio), rty = Math.floor(tile.ty / ratio);
    const zoneKey = `${requestZoom}/${rtx}/${rty}`;

    // Éviter de re-fetcher si une erreur récente a eu lieu sur cette zone
    const failTime = zoneFailureCooldown.get(zoneKey);
    if (failTime && Date.now() < failTime) return;

    let pois: POIData[] | null | undefined = poiMemoryCache.get(zoneKey);

    if (!pois) {
        let promise = poiFetchPromises.get(zoneKey);
        if (!promise) {
            promise = fetchPOIsWithCache(requestZoom, rtx, rty, zoneKey, inCH);
            poiFetchPromises.set(zoneKey, promise);
        }
        pois = await promise;
        poiFetchPromises.delete(zoneKey);
    }

    if (pois && pois.length > 0) {
        renderPOIs(tile, pois);
    }
}

async function fetchPOIsWithCache(z: number, x: number, y: number, key: string, inCH: boolean): Promise<POIData[] | null> {
    try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(key);
        let buffer: ArrayBuffer;

        if (cached) {
            buffer = await cached.arrayBuffer();
        } else {
            const url = inCH 
                ? `https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/${z}/${x}/${y}.pbf`
                : `https://api.maptiler.com/tiles/v3/${z}/${x}/${y}.pbf?key=${state.MK}`;
            
            const res = await fetch(url, { referrerPolicy: 'same-origin' });
            if (!res.ok) {
                zoneFailureCooldown.set(key, Date.now() + 60000); 
                return null;
            }
            buffer = await res.arrayBuffer();
            void cache.put(key, new Response(buffer.slice(0)));
        }

        // @ts-ignore
        const PbfConstructor = Pbf.default || Pbf;
        const vtile = new VectorTile(new PbfConstructor(buffer));
        
        const elements: POIData[] = [];
        const layers = Object.keys(vtile.layers);

        layers.forEach(layerName => {
            const layer = vtile.layers[layerName];
            const lowerLayer = layerName.toLowerCase();
            
            // v5.40.13 : Filtrage intelligent — on ignore les couches de polygones/lignes 
            // mais on accepte tout le reste (poi, label, point, transportation) pour ne rien rater.
            if (lowerLayer.includes('line') || lowerLayer.includes('poly') || 
                lowerLayer.includes('water') || lowerLayer.includes('landuse') ||
                lowerLayer.includes('building')) return;

            for (let i = 0; i < layer.length; i++) {
                const feat = layer.feature(i);
                const props = feat.properties;
                const raw = JSON.stringify(props).toLowerCase();

                let category: POICategory | null = null;

                // Logique de catégorisation améliorée (v5.40.12 : assouplissement pour guidepost)
                if (props.class === 'viewpoint' || props.tourism === 'viewpoint') {
                    category = 'viewpoint';
                } else if (props.amenity === 'shelter' || props.class === 'shelter') {
                    category = 'shelter';
                } else if (props.information === 'map' || props.information === 'board' || props.tourism === 'information') {
                    category = 'info';
                } else if (raw.includes('guidepost') || raw.includes('signpost') || raw.includes('hiking') || props.information === 'guidepost') {
                    category = 'guidepost';
                }

                if (category) {
                    const geom = feat.loadGeometry()[0][0];
                    const extent = layer.extent || 4096;

                    const lon = geom.x / extent * 360 / Math.pow(2, z) + x * 360 / Math.pow(2, z) - 180;
                    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (geom.y / extent + y) / Math.pow(2, z))));
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
            poiMemoryCache.set(key, uniqueElements);
        } catch(e) {}
        
        return uniqueElements;
    } catch (e) {
        return null;
    }
}

function renderPOIs(tile: Tile, elements: POIData[]) {
    if ((tile.status as string) !== 'loaded' || !state.scene) return;

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

        const mat = materials.get(el.category);
        if (mat) {
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(24, 24, 1);
            sprite.position.set(local.x, h + 12, local.z);
            sprite.userData = { name: el.name, lat: el.lat, lon: el.lon, category: el.category };
            group.add(sprite);
        }
    });

    if (tile.poiGroup && state.scene) state.scene.remove(tile.poiGroup);

    tile.poiGroup = group;
    tile.poiGroup.position.set(tile.worldX, 0, tile.worldZ);
    state.scene.add(tile.poiGroup);
}
