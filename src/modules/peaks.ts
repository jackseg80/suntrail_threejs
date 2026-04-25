import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { state, Peak } from './state';
import { isPositionInSwitzerland } from './geo';
import { BoundedCache } from './boundedCache';

/**
 * peaks.ts — Migration PBF (v5.38.4)
 * Remplace Overpass API par l'extraction des tuiles vectorielles.
 */

const CACHE_NAME = 'suntrail-peaks-v2';
const peaksMemoryCache = new BoundedCache<string, Peak[]>({ maxSize: 100 });
const fetchPromises = new Map<string, Promise<Peak[] | null>>();

/**
 * Récupère les sommets locaux via tuiles vectorielles (PBF).
 */
export async function fetchLocalPeaks(lat: number, lon: number, _radiusKm: number = 50): Promise<void> {
    const inCH = isPositionInSwitzerland(lat, lon);
    
    // On utilise Z12 pour SwissTopo, Z10 pour MapTiler (compromis quota/précision)
    const z = inCH ? 12 : 10;
    const n = Math.pow(2, z);
    const tx = Math.floor(((lon + 180) / 360) * n);
    const ty = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
    
    const cacheKey = `${inCH ? 'ch' : 'mt'}-${z}-${tx}-${ty}`;

    // 1. Cache Mémoire
    const cached = peaksMemoryCache.get(cacheKey);
    if (cached) {
        state.localPeaks = cached;
        return;
    }

    // 2. Déduplication des requêtes en cours
    if (fetchPromises.has(cacheKey)) {
        const peaks = await fetchPromises.get(cacheKey);
        if (peaks) state.localPeaks = peaks;
        return;
    }

    const promise = fetchPeaksWithCache(z, tx, ty, cacheKey, inCH);
    fetchPromises.set(cacheKey, promise);
    
    const result = await promise;
    if (result) {
        state.localPeaks = result;
        peaksMemoryCache.set(cacheKey, result);
    }
    fetchPromises.delete(cacheKey);
}

/**
 * Pour les tests : vide les caches mémoire.
 */
export function _clearPeaksCache(): void {
    peaksMemoryCache.clear();
    fetchPromises.clear();
}

async function fetchPeaksWithCache(z: number, tx: number, ty: number, key: string, inCH: boolean): Promise<Peak[] | null> {
    try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(key);
        if (cached) return await cached.json();
    } catch (e) { /* Cache API non dispo ou erreur */ }

    let url = "";
    if (inCH) {
        url = `https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/${z}/${tx}/${ty}.pbf`;
    } else {
        if (!state.MK || state.isMapTilerDisabled) return null;
        url = `https://api.maptiler.com/tiles/v3/${z}/${tx}/${ty}.pbf?key=${state.MK}`;
    }

    try {
        const res = await fetch(url, { referrerPolicy: 'same-origin' });
        if (!res.ok) return null;
        const buffer = await res.arrayBuffer();
        
        // @ts-ignore
        const PbfConstructor = Pbf.default || Pbf;
        const vtile = new VectorTile(new PbfConstructor(buffer));
        
        const peaks: Peak[] = [];
        // Couches standards pour les sommets
        const peakLayer = vtile.layers.mountain_peak || vtile.layers.poi || vtile.layers.label;
        
        if (peakLayer) {
            for (let i = 0; i < peakLayer.length; i++) {
                const feat = peakLayer.feature(i);
                const props = feat.properties;
                const cls = props.class || props.subclass || props.type || props.label;
                
                // Détection d'un sommet
                if (cls === 'mountain_peak' || props.natural === 'peak' || props.amenity === 'mountain_peak') {
                    const geom = feat.loadGeometry()[0][0]; // Point
                    const extent = peakLayer.extent || 4096;
                    
                    // Conversion locale (0-extent) -> WGS84
                    const lon = (tx + geom.x / extent) / Math.pow(2, z) * 360 - 180;
                    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + geom.y / extent) / Math.pow(2, z))));
                    const lat = latRad * 180 / Math.PI;
                    
                    const ele = parseFloat(String(props.ele)) || parseFloat(String(props.elevation)) || 0;
                    if (ele > 0) {
                        peaks.push({
                            id: feat.id as number || Math.random(),
                            name: String(props.name || props.name_en || props.name_fr || "Sommet"),
                            lat,
                            lon,
                            ele
                        });
                    }
                }
            }
        }

        // Filtrage et tri (on garde les sommets significatifs > 1000m)
        const filtered = peaks
            .filter(p => p.ele > 1000)
            .sort((a, b) => b.ele - a.ele);

        // Mise en cache persistante
        try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(key, new Response(JSON.stringify(filtered)));
        } catch (e) { /* ignore */ }

        return filtered;
    } catch (e) {
        console.warn('[Peaks] PBF Fetch failed:', e);
        return null;
    }
}
