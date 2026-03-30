import { state } from './state';
import { isPositionInSwitzerland, isPositionInFrance, showToast } from './utils';
import { lngLatToTile } from './geo';
import { tileWorkerManager } from './workerManager';
import { disposeAllCachedTiles } from './tileCache';
import * as pmtiles from 'pmtiles';

export const CACHE_NAME = 'suntrail-tiles-v5.11';

// --- PMTILES SUPPORT (v5.7.0) ---
let localPMTiles: pmtiles.PMTiles | null = null;
let pmtilesController: AbortController | null = null;

/**
 * Configure une source PMTiles locale (fichier ou URL HTTP Range).
 */
export async function setPMTilesSource(urlOrFile: string | File) {
    try {
        let archive;
        if (urlOrFile instanceof File) {
            // Lecture locale via File API (zéro réseau)
            archive = new pmtiles.PMTiles(new pmtiles.FileSource(urlOrFile));
        } else {
            // Lecture distante via HTTP Range requests
            archive = new pmtiles.PMTiles(urlOrFile);
        }
        
        const header = await archive.getHeader();
        console.log(`[PMTiles] Source chargée. Bounds: ${header.minLon},${header.minLat} to ${header.maxLon},${header.maxLat}`);
        localPMTiles = archive;
        showToast("Carte locale PMTiles activée");
    } catch (e) {
        console.error("[PMTiles] Erreur de chargement", e);
        showToast("Erreur PMTiles");
        localPMTiles = null;
    }
}

/**
 * Tente d'extraire une tuile depuis l'archive PMTiles locale.
 */
async function getTileFromPMTiles(z: number, x: number, y: number): Promise<Blob | null> {
    if (!localPMTiles) return null;
    try {
        if (pmtilesController) pmtilesController.abort();
        pmtilesController = new AbortController();
        
        // PMTiles utilise le schéma XYZ standard
        const tileData = await localPMTiles.getZxy(z, x, y, pmtilesController.signal);
        if (tileData && tileData.data) {
            // On présume que c'est du WebP ou JPEG par défaut dans notre cas d'usage, on renvoie un Blob
            return new Blob([tileData.data], { type: 'image/webp' });
        }
    } catch (e) {
        if ((e as Error).name !== 'AbortError') {
            console.warn(`[PMTiles] Tuile manquante: ${z}/${x}/${y}`);
        }
    }
    return null;
}

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
    
    // --- PMTILES INTERCEPTION (v5.7.0) ---
    // Si une archive locale est montée, on essaie d'abord d'y trouver la tuile
    if (localPMTiles) {
        // Extraction basique du Z/X/Y depuis l'URL (très simplifié, à adapter selon format URL)
        const match = url.match(/\/(\d+)\/(\d+)\/(\d+)(?:@2x)?\.(jpeg|jpg|png|webp)/i);
        if (match) {
            const z = parseInt(match[1]);
            const x = parseInt(match[2]);
            const y = parseInt(match[3]);
            const pmBlob = await getTileFromPMTiles(z, x, y);
            if (pmBlob) {
                console.log(`[PMTiles] HIT pour ${z}/${x}/${y}`);
                return pmBlob;
            }
        }
    }

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
 * Vérifie si une tuile est ENTIÈREMENT dans un pays donné (check 4 coins).
 * Évite les tuiles-frontière partiellement hors couverture (ex: SwissTopo noir hors CH).
 */
function isTileFullyInRegion(
    tx: number, ty: number, zoom: number,
    check: (lat: number, lon: number) => boolean
): boolean {
    const n = Math.pow(2, zoom);
    const latN = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n))) * 180 / Math.PI;
    const latS = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + 1) / n))) * 180 / Math.PI;
    const lonW = tx / n * 360 - 180;
    const lonE = (tx + 1) / n * 360 - 180;
    return check(latN, lonW) && check(latN, lonE) && check(latS, lonW) && check(latS, lonE);
}

/**
 * Génère l'URL pour la texture de couleur/carte d'une tuile.
 */
export function getColorUrl(tx: number, ty: number, zoom: number): string {
    // Pour les sources nationales (SwissTopo, IGN), on vérifie que la tuile entière
    // est dans le pays — évite les zones noires hors-couverture sur les tuiles-frontière.
    const inCH = isTileFullyInRegion(tx, ty, zoom, isPositionInSwitzerland);
    const inFR = isTileFullyInRegion(tx, ty, zoom, isPositionInFrance);

    const hasKey = state.MK && state.MK.length > 10 && !state.isMapTilerDisabled;
    
    // --- UNIFICATION GLOBALE (v5.7.4, révisé v5.14.1) ---
    // Si le zoom est faible (LOD <= 10), on force OpenTopoMap pour éviter l'effet "patchwork".
    // MapTiler n'est PAS utilisé à ces échelles : coût quota élevé pour une qualité visuelle
    // identique, risque de rate-limiting (429) global qui bloquerait tous les LODs.
    // OpenTopoMap : CC-BY-SA, 3 sous-domaines (a/b/c), idéal pour vue d'ensemble alpine.
    if (zoom <= 10) {
        const sub = ['a', 'b', 'c'][(tx + ty) % 3]; // rotation des sous-domaines
        return `https://${sub}.tile.opentopomap.org/${zoom}/${tx}/${ty}.png`;
    }

    // 1. SATELLITE (Hybride Swisstopo/IGN/MapTiler)
    if (state.MAP_SOURCE === 'satellite') {
        if (inCH) return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/${zoom}/${tx}/${ty}.jpeg`;
        if (inFR) return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX=${zoom}&TILEROW=${ty}&TILECOL=${tx}`;
        if (hasKey) return `https://api.maptiler.com/maps/satellite/256/${zoom}/${tx}/${ty}@2x.webp?key=${state.MK}`;
        return `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`; // Fallback OSM Standard sans clé
    }
    
    // 2. TOPO CH (Priorité Swisstopo/IGN, fallback Topo MapTiler)
    if (state.MAP_SOURCE === 'swisstopo') {
        if (inCH) {
            // Utilisation de la version 'pixelkarte-farbe' qui contient des informations de couleur plus saturées pour l'eau
            return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${zoom}/${tx}/${ty}.jpeg`;
        }
        if (inFR) return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX=${zoom}&TILEROW=${ty}&TILECOL=${tx}`;
        if (hasKey) return `https://api.maptiler.com/maps/topo-v2/256/${zoom}/${tx}/${ty}@2x.webp?key=${state.MK}`;
        // Sans clé MapTiler : OpenTopoMap (style topo cohérent avec SwissTopo, évite le patchwork visuel OSM Standard)
        // Zoom ≤ 17 : OpenTopoMap natif. Zoom 18 (Pro uniquement) : OSM Standard acceptable.
        if (zoom <= 17) { const sub = ['a','b','c'][(tx+ty)%3]; return `https://${sub}.tile.opentopomap.org/${zoom}/${tx}/${ty}.png`; }
        return `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
    }
    
    // 3. OPENTOPOMAP / source non reconnue (MapTiler Topo v2 si clé présente, sinon OpenTopoMap)
    if (hasKey) {
        return `https://api.maptiler.com/maps/topo-v2/256/${zoom}/${tx}/${ty}@2x.webp?key=${state.MK}`;
    }
    if (zoom <= 17) { const sub = ['a','b','c'][(tx+ty)%3]; return `https://${sub}.tile.opentopomap.org/${zoom}/${tx}/${ty}.png`; }
    return `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
}

/**
 * Génère l'URL pour la texture des sentiers/POI (Raster fallback pour stabilité).
 */
export function getOverlayUrl(tx: number, ty: number, zoom: number): string | null {
    const MIN_TRAIL_LOD = 11;
    if (!state.SHOW_TRAILS || zoom < MIN_TRAIL_LOD) return null;
    
    // Même logique 4 coins que getColorUrl : sentiers nationaux uniquement si tuile entièrement dans le pays
    if (isTileFullyInRegion(tx, ty, zoom, isPositionInSwitzerland)) {
        return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/${zoom}/${tx}/${ty}.png`;
    }
    if (isTileFullyInRegion(tx, ty, zoom, isPositionInFrance)) {
        return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=TRANSPORT.WANDERWEGE&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX=${zoom}&TILEROW=${ty}&TILECOL=${tx}`;
    }
    
    return null;
}

/**
 * Génère l'URL pour les données d'élévation (Terrain-RGB).
 */
export function getElevationUrl(tx: number, ty: number, zoom: number, is2D: boolean): { url: string | null, sourceZoom: number } {
    if (is2D) return { url: null, sourceZoom: zoom };
    
    const sourceZoom = Math.min(zoom, 14);
    let r = Math.pow(2, Math.max(0, zoom - 14));
    const url = `https://api.maptiler.com/tiles/terrain-rgb-v2/${sourceZoom}/${Math.floor(tx/r)}/${Math.floor(ty/r)}.png?key=${state.MK}`;
    return { url, sourceZoom };
}

/**
 * Lance le chargement d'une tuile via les Workers.
 * Retourne { promise, taskId } — le taskId permet d'annuler via cancelTileLoad()
 * si la tuile est disposée avant la fin du fetch (économise la bande passante).
 */
export function loadTileData(tx: number, ty: number, zoom: number, is2D: boolean): { promise: Promise<any>, taskId: number } {
    const { url: elevUrl, sourceZoom } = getElevationUrl(tx, ty, zoom, is2D);
    
    // OpenTopoMap est utilisé uniquement à LOD ≤ 10 (zoom <= 10 branch dans getColorUrl).
    // À LOD > 10 : swisstopo/IGN/MapTiler — tous supportent zoom 18 nativement.
    const nativeMax = 18;
    const cz = Math.min(zoom, nativeMax);
    const cr = Math.pow(2, Math.max(0, zoom - nativeMax));
    
    const colorUrl = getColorUrl(Math.floor(tx/cr), Math.floor(ty/cr), cz);
    const overlayUrl = getOverlayUrl(tx, ty, zoom);

    return tileWorkerManager.loadTile(elevUrl, colorUrl, overlayUrl, zoom, sourceZoom);
}

/**
 * Annule un fetch de tuile en cours.
 * Résout la Promise avec null ET envoie un signal abort au worker concerné.
 */
export function cancelTileLoad(taskId: number): void {
    tileWorkerManager.cancelTile(taskId);
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
                const { url: elevUrl } = getElevationUrl(x, y, z, false);
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

/**
 * Pré-charge les tuiles de vue Suisse (zoom 6-9) dans le cache persistant.
 *
 * ⚠️ DÉSACTIVÉ (v5.14.1) : le bulk pre-seeding viole la politique d'utilisation
 * d'OpenTopoMap et d'OSM (https://operations.osmfoundation.org/policies/tiles/).
 * "Pre-seeding large areas or multiple zoom levels in advance is prohibited."
 *
 * Alternative : les tuiles LOD 6-10 sont légères (~30KB/tuile PNG) et se cachent
 * naturellement après la 1ère navigation. Le PWA Service Worker gère le cache offline
 * pour les zones visitées sans bulk-fetch préventif.
 *
 * @deprecated Ne pas réactiver sans un accord explicite du fournisseur de tuiles
 * ou l'utilisation d'un serveur de tuiles auto-hébergé (PMTiles).
 */
export async function preloadChOverviewTiles(): Promise<void> {
    // No-op — voir commentaire ci-dessus
    console.log('[Preload CH] Désactivé — bulk pre-seeding interdit par la politique OpenTopoMap/OSM.');
}
