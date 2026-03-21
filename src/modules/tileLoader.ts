import { state } from './state';
import { isPositionInSwitzerland, isPositionInFrance, showToast } from './utils';
import { lngLatToTile } from './geo';
import { tileWorkerManager } from './workerManager';
import { disposeAllCachedTiles } from './tileCache';

export const CACHE_NAME = 'suntrail-tiles-v1';

/**
 * Vide le cache persistant et le cache mémoire.
 */
export async function deleteTerrainCache(): Promise<void> {
    disposeAllCachedTiles();
    try {
        const success = await caches.delete(CACHE_NAME);
        showToast(success ? 'Cache vidé' : 'Cache déjà vide');
    } catch (e) {
        showToast('Erreur cache');
    }
}

/**
 * Met à jour les statistiques de stockage dans l'UI.
 */
export function updateStorageUI() {
    const netCount = document.getElementById('net-count');
    const cacheCount = document.getElementById('cache-count');
    if (netCount) netCount.textContent = state.networkRequests.toString();
    if (cacheCount) cacheCount.textContent = state.cacheHits.toString();
}

/**
 * Récupère une ressource via le cache persistant ou le réseau.
 */
export async function fetchWithCache(url: string, usePersistentCache: boolean = false): Promise<Blob | null> {
    if (state.IS_OFFLINE && !usePersistentCache) return null;
    try {
        if (usePersistentCache) {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(url);
            if (cached) {
                state.cacheHits++;
                updateStorageUI();
                return await cached.blob();
            }
        }
        if (state.IS_OFFLINE) return null;
        const r = await fetch(url, { mode: 'cors' });
        if (r.ok) {
            const blob = await r.blob();
            state.networkRequests++;
            updateStorageUI();
            if (usePersistentCache) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(url, new Response(blob));
            }
            return blob;
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Calcule les coordonnées Lng/Lat du centre d'une tuile.
 */
function getTileCenter(tx: number, ty: number, zoom: number): { lat: number, lon: number } {
    const n = Math.pow(2, zoom);
    const lon = (tx + 0.5) / n * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + 0.5) / n)));
    const lat = latRad * 180 / Math.PI;
    return { lat, lon };
}

/**
 * Génère l'URL pour la texture de couleur/carte d'une tuile.
 */
export function getColorUrl(tx: number, ty: number, zoom: number): string {
    const center = getTileCenter(tx, ty, zoom);
    const inCH = isPositionInSwitzerland(center.lat, center.lon);
    const inFR = isPositionInFrance(center.lat, center.lon);
    
    // 1. SATELLITE (Hybride Swisstopo/IGN/MapTiler)
    if (state.MAP_SOURCE === 'satellite') {
        if (inCH) return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/${zoom}/${tx}/${ty}.jpeg`;
        if (inFR) return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX=${zoom}&TILEROW=${ty}&TILECOL=${tx}`;
        return `https://api.maptiler.com/maps/satellite/256/${zoom}/${tx}/${ty}@2x.webp?key=${state.MK}`;
    }
    
    // 2. TOPO CH (Priorité Swisstopo/IGN, fallback Topo MapTiler)
    if (state.MAP_SOURCE === 'swisstopo') {
        if (inCH) return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${zoom}/${tx}/${ty}.jpeg`;
        if (inFR) return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX=${zoom}&TILEROW=${ty}&TILECOL=${tx}`;
        return `https://api.maptiler.com/maps/topo-v2/256/${zoom}/${tx}/${ty}@2x.webp?key=${state.MK}`;
    }
    
    // 3. OPENTOPOMAP (MapTiler Topo v2 - Stable)
    return `https://api.maptiler.com/maps/topo-v2/256/${zoom}/${tx}/${ty}@2x.webp?key=${state.MK}`;
}

/**
 * Génère l'URL pour les données vectorielles des sentiers (MVT/PBF).
 */
export function getOverlayUrl(tx: number, ty: number, zoom: number): string | null {
    if (!state.SHOW_TRAILS || zoom < 10) return null;
    
    const center = getTileCenter(tx, ty, zoom);
    
    // Suisse (SwissTopo Vector)
    if (isPositionInSwitzerland(center.lat, center.lon)) {
        return `https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.swisstlm3d-wanderwege.vector/v1/${zoom}/${tx}/${ty}.pbf`;
    }
    
    // Global & France (MapTiler Hiking Vector)
    return `https://api.maptiler.com/tiles/hiking/${zoom}/${tx}/${ty}.pbf?key=${state.MK}`;
}

/**
 * Génère l'URL pour les données d'élévation (Terrain-RGB).
 */
export function getElevationUrl(tx: number, ty: number, zoom: number, is2D: boolean): string | null {
    if (is2D) return null;
    
    let ez = Math.min(zoom, 14);
    let r = Math.pow(2, Math.max(0, zoom - 14));
    return `https://api.maptiler.com/tiles/terrain-rgb-v2/${ez}/${Math.floor(tx/r)}/${Math.floor(ty/r)}.png?key=${state.MK}`;
}

/**
 * Charge les données complètes d'une tuile via les Workers.
 */
export async function loadTileData(tx: number, ty: number, zoom: number, is2D: boolean) {
    const elevUrl = getElevationUrl(tx, ty, zoom, is2D);
    
    // Logique native color zoom
    const nativeMax = (state.MAP_SOURCE === 'opentopomap') ? 15 : 18;
    const cz = Math.min(zoom, nativeMax);
    const cr = Math.pow(2, Math.max(0, zoom - nativeMax));
    
    let colorUrl = getColorUrl(Math.floor(tx/cr), Math.floor(ty/cr), cz);
    const overlayUrl = getOverlayUrl(tx, ty, zoom);

    return await tileWorkerManager.loadTile(elevUrl, colorUrl, overlayUrl, zoom);
}



/**
 * Télécharge récursivement une zone pour l'usage hors-ligne.
 */
export async function downloadOfflineZone(lat: number, lon: number, onProgress: (done: number, total: number) => void): Promise<void> {
    const radiusKm = 6;
    const zooms = [12, 13, 14, 15];
    const latOffset = radiusKm / 111.0;
    const lonOffset = radiusKm / (111.0 * Math.cos(lat * Math.PI / 180));
    const bbox = { n: lat + latOffset, s: lat - latOffset, e: lon + lonOffset, w: lon - lonOffset };
    const urls: string[] = [];

    for (const z of zooms) {
        const t1 = lngLatToTile(bbox.w, bbox.n, z);
        const t2 = lngLatToTile(bbox.e, bbox.s, z);
        for (let x = t1.x; x <= t2.x; x++) {
            for (let y = t1.y; y <= t2.y; y++) {
                // Utilisation des générateurs d'URL officiels pour éviter les 404
                const colorUrl = getColorUrl(x, y, z);
                const elevUrl = getElevationUrl(x, y, z, false);
                const overlayUrl = getOverlayUrl(x, y, z);
                
                urls.push(colorUrl);
                if (elevUrl) urls.push(elevUrl);
                if (overlayUrl) urls.push(overlayUrl);
            }
        }
    }

    
    const total = urls.length;
    let done = 0;
    for (const url of urls) {
        try {
            await fetchWithCache(url, true);
        } catch (e) {
            // Silence silent errors
        }
        done++;
        if (done % 5 === 0) onProgress(done, total);
    }
    onProgress(total, total);
}
