import * as THREE from 'three';
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { state } from './state';
import { getAltitudeAt } from './analysis';
import { isPositionInSwitzerland, getPow2, xNormToLon, yNormToLat } from './geo';
import { Tile } from './terrain/Tile';
import { BoundedCache } from './boundedCache';

/**
 * poi.ts — Finalisation de la Signalétique (v5.39.2)
 * Récupération et rendu différencié des POIs via tuiles vectorielles.
 */

type POICategory = 'guidepost' | 'viewpoint' | 'shelter' | 'info' | 'trail' | 'hut' | 'rest' | 'attraction';

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
        } else if (category === 'trail') {
            // Losange jaune pour sentiers nommés
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
        } else if (category === 'hut') {
            // Refuge : carré brun avec icône maison
            ctx.fillStyle = '#8B4513';
            // @ts-ignore
            if (ctx.roundRect) {
                // @ts-ignore
                ctx.roundRect(6, 6, 52, 52, 10);
            } else {
                ctx.rect(6, 6, 52, 52);
            }
            ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 28px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('🛖', 32, 34);
        } else if (category === 'rest') {
            // Halte : cercle vert avec icône pique-nique
            ctx.beginPath(); ctx.arc(32, 32, 26, 0, Math.PI * 2);
            ctx.fillStyle = '#22c55e'; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 28px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('🧺', 32, 34);
        } else if (category === 'attraction') {
            // Curiosité naturelle : cercle cyan avec icône étoile
            ctx.beginPath(); ctx.arc(32, 32, 26, 0, Math.PI * 2);
            ctx.fillStyle = '#06b6d4'; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 28px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('✨', 32, 34);
        }
    }

    const tex = new THREE.CanvasTexture(canvas);
    textureCache.set(category, tex);
    return tex;
}

export async function loadPOIsForTile(tile: Tile) {
    if (!state.SHOW_SIGNPOSTS || tile.zoom < state.POI_ZOOM_THRESHOLD || (tile.status as string) === 'disposed') return;
    if (tile.poiGroup) return;

    const n = getPow2(tile.zoom);
    const lonC = xNormToLon((tile.tx + 0.5) / n);
    const latC = yNormToLat((tile.ty + 0.5) / n);
    const inCH = isPositionInSwitzerland(latC, lonC);
    
    // Zoom fixe pour la signalétique (v5.38.4) : Z14 SwissTopo, Z12 MapTiler
    const requestZoom = inCH ? 14 : 12;
    const ratio = getPow2(tile.zoom - requestZoom);
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

function extractPOIName(props: Record<string, unknown>, category: string): string {
    const nameFields = ['name', 'name_en', 'text', 'name_fr', 'name_de', 'name_it', 'name:fr', 'name:de', 'name:it', 'label'];
    for (const field of nameFields) {
        const val = props[field];
        if (val && typeof val === 'string' && val.trim()) return val.trim();
    }
    const catLabels: Record<string, string> = {
        guidepost: 'Signalisation',
        viewpoint: 'Point de vue',
        shelter: 'Abri',
        info: 'Information',
        trail: 'Sentier',
        hut: 'Refuge',
        rest: 'Halte',
        attraction: 'Curiosité'
    };
    return catLabels[category] || "Point d'intérêt";
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
            
            const isTransportName = lowerLayer.includes('transport') && lowerLayer.includes('name');

            // Filtrage des couches de géométrie (polygones/lignes) — on ignore sauf transportation_name
            if (!isTransportName && (
                lowerLayer.includes('line') || lowerLayer.includes('poly') || 
                lowerLayer.includes('water') || lowerLayer.includes('landuse') ||
                lowerLayer.includes('building') || lowerLayer.includes('transport') ||
                lowerLayer.includes('road') || lowerLayer.includes('highway')
            )) return;

            for (let i = 0; i < layer.length; i++) {
                const feat = layer.feature(i);
                const props = feat.properties;
                const raw = JSON.stringify(props).toLowerCase();
                const cls = String(props.class || '').toLowerCase();
                const sub = String(props.subclass || '').toLowerCase();

                let category: POICategory | null = null;

                // Sentiers nommés (transportation_name — Suisse : sentiers de rando avec nom)
                if (isTransportName) {
                    const trailClasses = ['footway', 'path', 'track', 'bridleway', 'steps'];
                    const hasName = props.name && typeof props.name === 'string' && (props.name as string).trim();
                    if (hasName && trailClasses.includes(cls)) {
                        category = 'trail';
                    }
                }

                if (!category) {
                    // Détection unifiée (SwissTopo class/subclass + MapTiler class seule)
                    // Refuges & cabanes
                    if ((cls === 'lodging' && ['alpine_hut', 'wilderness_hut'].includes(sub)) ||
                        cls === 'alpine_hut' || cls === 'wilderness_hut' ||
                        (cls === 'tourism' && sub === 'alpine_hut')) {
                        category = 'hut';
                    }
                    // Haltes (pique-nique, campings, eau potable)
                    else if ((cls === 'tourism' && ['picnic_site', 'camp_site'].includes(sub)) ||
                        (cls === 'lodging' && sub === 'camp_site') ||
                        (cls === 'amenity' && ['drinking_water', 'fountain'].includes(sub)) ||
                        cls === 'picnic_site' || cls === 'camp_site' ||
                        props.amenity === 'drinking_water' || props.tourism === 'picnic_site') {
                        category = 'rest';
                    }
                    // Curiosités naturelles
                    else if ((cls === 'natural' && ['waterfall', 'cave_entrance'].includes(sub)) ||
                        cls === 'waterfall' || cls === 'cave_entrance' ||
                        props.natural === 'cave_entrance' || props.waterway === 'waterfall') {
                        category = 'attraction';
                    }
                    // Points de vue
                    else if (cls === 'viewpoint' || props.tourism === 'viewpoint' ||
                        (cls === 'tourism' && sub === 'viewpoint')) {
                        category = 'viewpoint';
                    }
                    // Abris
                    else if (cls === 'shelter' || props.amenity === 'shelter' ||
                        (cls === 'amenity' && sub === 'shelter')) {
                        category = 'shelter';
                    }
                    // Information
                    else if (props.information === 'map' || props.information === 'board' || 
                        props.tourism === 'information' ||
                        (cls === 'tourism' && sub === 'information')) {
                        category = 'info';
                    }
                    // Guideposts
                    else if (props.information === 'guidepost' || 
                        raw.includes('guidepost') || raw.includes('signpost')) {
                        category = 'guidepost';
                    }
                }

                if (category) {
                    const geom = feat.loadGeometry()[0][0];
                    const extent = layer.extent || 4096;

                    const invN = 1.0 / getPow2(z);
                    const xNorm = (x + geom.x / extent) * invN;
                    const yNorm = (y + geom.y / extent) * invN;
                    const lon = xNormToLon(xNorm);
                    const lat = yNormToLat(yNorm);

                    elements.push({
                        id: feat.id || `${lat.toFixed(6)}|${lon.toFixed(6)}`,
                        lat,
                        lon,
                        name: extractPOIName(props, category),
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
