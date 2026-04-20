import { state } from './state';
import { isPositionInSwitzerland, isPositionInFrance } from './geo';
import { showToast } from './toast';

import { tileWorkerManager } from './workerManager';
import { disposeAllCachedTiles } from './tileCache';
import * as pmtiles from 'pmtiles';
import { packManager } from './packManager';

export const CACHE_NAME = 'suntrail-tiles-v30';

// --- PMTILES SUPPORT (v5.7.0) ---
let localPMTiles: pmtiles.PMTiles | null = null;
let pmtilesController: AbortController | null = null;

// --- EMBEDDED OVERVIEW (v5.20.0) ---
// Archive PMTiles pré-embarquée dans l'APK (LOD 5-7, Europe)
// Séparée de localPMTiles pour ne pas interférer avec les uploads utilisateur
let embeddedPMTiles: pmtiles.PMTiles | null = null;
const EMBEDDED_MAX_ZOOM = 11; // LOD 5-7 Europe + LOD 8-11 Suisse

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
 * Nettoie les anciennes versions du cache (v5.29.40).
 * Supprime tout cache dont le nom commence par 'suntrail-tiles-' mais ne correspond pas à CACHE_NAME.
 */
async function cleanupOldCaches(): Promise<void> {
    try {
        const cacheNames = await caches.keys();
        const deletions = cacheNames
            .filter(name => name.startsWith('suntrail-tiles-') && name !== CACHE_NAME)
            .map(name => {
                if (state.DEBUG_MODE) console.log(`[Cache] Suppression de l'ancienne version : ${name}`);
                return caches.delete(name);
            });
        await Promise.all(deletions);
    } catch (e) {
        console.warn("[Cache] Échec du nettoyage des anciens caches", e);
    }
}

/**
 * Monte l'archive PMTiles overview embarquée dans l'APK/PWA (LOD 5-11).
 * Appelée une fois au démarrage, fire-and-forget.
 */
export async function initEmbeddedOverview(): Promise<void> {
    // Nettoyer les vieux résidus de cache avant de commencer
    void cleanupOldCaches();

    try {
        const url = './tiles/europe-overview.pmtiles';
        
        // Paralléliser l'ouverture du cache worker et l'init PMTiles
        const [cache, archive] = await Promise.all([
            caches.open(CACHE_NAME),
            (async () => {
                const p = new pmtiles.PMTiles(url);
                await p.getHeader();
                return p;
            })()
        ]);

        _workerCache = cache;
        embeddedPMTiles = archive;

        if (state.DEBUG_MODE) console.log(`[Embedded] Overview chargé.`);

        // Warmup en arrière-plan pour ne pas bloquer le thread principal au démarrage
        // (après ce call, les extractions suivantes sont ~10× plus rapides)
        setTimeout(() => {
            if (embeddedPMTiles) embeddedPMTiles.getZxy(6, 33, 22).catch(() => {});
        }, 1000);

    } catch (e) {
        console.warn("[Embedded] Échec chargement overview", e);
        embeddedPMTiles = null;
    }
}

/**
 * Tente d'extraire une tuile depuis l'archive overview embarquée (LOD ≤ 7 seulement).
 */
async function getTileFromEmbedded(z: number, x: number, y: number): Promise<Blob | null> {
    if (!embeddedPMTiles || z > EMBEDDED_MAX_ZOOM) return null;
    try {
        const tileData = await embeddedPMTiles.getZxy(z, x, y);
        if (tileData && tileData.data) {
            return new Blob([tileData.data], { type: 'image/webp' });
        }
    } catch {
        // Tuile hors bounds ou erreur silencieuse
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
    // Les sources locales (PMTiles upload, country packs) sont consultées EN PREMIER,
    // avant la garde offline — elles fonctionnent sans réseau.
    const tileMatch = url.match(/\/(\d+)\/(\d+)\/(\d+)(?:@2x)?\.(jpeg|jpg|png|webp)/i);

    // --- PMTILES INTERCEPTION (v5.7.0) ---
    if (localPMTiles && tileMatch) {
        const pmBlob = await getTileFromPMTiles(
            parseInt(tileMatch[1]), parseInt(tileMatch[2]), parseInt(tileMatch[3])
        );
        if (pmBlob) {
            console.log(`[PMTiles] HIT pour ${tileMatch[1]}/${tileMatch[2]}/${tileMatch[3]}`);
            return pmBlob;
        }
    }

    // --- COUNTRY PACKS INTERCEPTION (v5.21.0) — fonctionne offline ---
    if (packManager.hasMountedPacks() && tileMatch) {
        const packBlob = await packManager.getTileFromPacks(
            parseInt(tileMatch[1]), parseInt(tileMatch[2]), parseInt(tileMatch[3])
        );
        if (packBlob) return packBlob;
    }

    // Garde offline : après les sources locales, avant réseau/cache
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
        // Fallback embedded overview (LOD ≤ 11) — avant le réseau
        if (embeddedPMTiles && tileMatch) {
            const ez = parseInt(tileMatch[1]);
            if (ez <= EMBEDDED_MAX_ZOOM) {
                // v5.29.39 : Ne pas utiliser le fallback Topo si on est en mode satellite et online
                const useLocal = state.MAP_SOURCE !== 'satellite' || state.IS_OFFLINE;
                if (useLocal) {
                    const blob = await getTileFromEmbedded(ez, parseInt(tileMatch[2]), parseInt(tileMatch[3]));
                    if (blob) return blob;
                }
            }
        }
        if (state.IS_OFFLINE) return null;
        
        // v5.29.5 : Ajout d'un timeout pour ne pas bloquer les slots de connexion (max 6)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const r = await fetch(url, { mode: 'cors', signal: controller.signal });
            clearTimeout(timeoutId);

            // v5.29.3 : Disjoncteur MapTiler (Rate Limit ou Clé invalide)
            if (url.includes('api.maptiler.com')) {
                if (r.status === 403 || r.status === 429) {
                    console.error(`[MapTiler] Erreur ${r.status}. Basculement sur les sources de secours (OSM/OpenTopo).`);
                    state.isMapTilerDisabled = true;
                    disposeAllCachedTiles();
                    return null;
                }
            }

            if (r.ok) {
                const blob = await r.blob();
                state.networkRequests++;
                updateStorageUI();
                if (usePersistentCache && _workerCache) {
                    try { await _workerCache.put(url, new Response(blob)); } catch (e) {}
                }
                return blob;
            }
        } catch (e) {
            clearTimeout(timeoutId);
            if ((e as Error).name === 'AbortError') {
                console.warn(`[tileLoader] Timeout ou Abort sur ${url}`);
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Vérifie si une tuile est majoritairement dans une région (check le centre).
 * Plus tolérant que le check des 4 coins pour les zones frontalières.
 */
function isTileInRegion(tx: number, ty: number, zoom: number, check: (lat: number, lon: number) => boolean): boolean {
    const n = Math.pow(2, zoom);
    const centerLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + 0.5) / n))) * 180 / Math.PI;
    const centerLon = (tx + 0.5) / n * 360 - 180;
    return check(centerLat, centerLon);
}

/**
 * Génère l'URL pour la texture de couleur/carte d'une tuile.
 */
export function getColorUrl(tx: number, ty: number, zoom: number): string {
    const inCH = isTileInRegion(tx, ty, zoom, isPositionInSwitzerland);
    const inFR = isTileInRegion(tx, ty, zoom, isPositionInFrance);
    const hasKey = state.MK && state.MK.length > 10 && !state.isMapTilerDisabled;
    
    // --- MODE SATELLITE (v5.29.40 : Priorité absolue et stricte) ---
    if (state.MAP_SOURCE === 'satellite') {
        // Fallback progressif pour garantir du satellite partout
        if (inCH && zoom >= 10) return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/${zoom}/${tx}/${ty}.jpeg`;
        if (inFR && zoom >= 10) return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX=${zoom}&TILEROW=${ty}&TILECOL=${tx}`;
        
        // Global Satellite (MapTiler ou ESRI en dernier recours)
        if (hasKey) return `https://api.maptiler.com/maps/satellite/256/${zoom}/${tx}/${ty}@2x.webp?key=${state.MK}`;
        
        // Fallback ultime SATELLITE (ESRI) si pas de clé MapTiler, pour éviter de tomber sur de la Topo/OSM
        return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;
    }

    // --- MODE TOPO / AUTRE ---
    
    // Bas zoom (vue d'ensemble) : OpenTopoMap pour tout le monde
    if (zoom <= 10) {
        const sub = ['a', 'b', 'c'][(tx + ty) % 3];
        return `https://${sub}.tile.opentopomap.org/${zoom}/${tx}/${ty}.png`;
    }

    // Swisstopo / Topo CH
    if (state.MAP_SOURCE === 'swisstopo') {
        if (inCH) return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${zoom}/${tx}/${ty}.jpeg`;
        if (inFR) return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX=${zoom}&TILEROW=${ty}&TILECOL=${tx}`;
        if (hasKey) return `https://api.maptiler.com/maps/topo-v2/256/${zoom}/${tx}/${ty}@2x.webp?key=${state.MK}`;
    }
    
    // Fallback Topo Global (MapTiler > OpenTopoMap > OSM)
    if (hasKey) return `https://api.maptiler.com/maps/topo-v2/256/${zoom}/${tx}/${ty}@2x.webp?key=${state.MK}`;
    if (zoom <= 17) { const sub = ['a','b','c'][(tx+ty)%3]; return `https://${sub}.tile.opentopomap.org/${zoom}/${tx}/${ty}.png`; }
    return `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
}

/**
 * Génère l'URL pour la texture des sentiers/POI (Raster fallback pour stabilité).
 */
export function getOverlayUrl(tx: number, ty: number, zoom: number): string | null {
    const MIN_TRAIL_LOD = 11;
    if (!state.SHOW_TRAILS || zoom < MIN_TRAIL_LOD) return null;

    // SwissTopo wanderwege : CDN gouvernemental, supporte Z0-28, rapide et fiable
    if (isTileInRegion(tx, ty, zoom, isPositionInSwitzerland)) {
        if (zoom > 18) return null;
        return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/${zoom}/${tx}/${ty}.png`;
    }
    // Waymarked Trails : serveur OSM bénévole — plafonné à Z17 (tuiles Z18 souvent vides)
    if (zoom > 17) return null;
    return `https://tile.waymarkedtrails.org/hiking/${zoom}/${tx}/${ty}.png`;
}

/**
 * Génère l'URL pour les données d'élévation (Terrain-RGB).
 */
export function getElevationUrl(tx: number, ty: number, zoom: number, is2D: boolean): { url: string | null, sourceZoom: number } {
    if (is2D) return { url: null, sourceZoom: zoom };
    // Pas d'élévation si MapTiler désactivé (403) ou clé absente — la tuile sera plate mais visible
    if (state.isMapTilerDisabled || !state.MK || state.MK.length <= 10) return { url: null, sourceZoom: zoom };

    const sourceZoom = Math.min(zoom, 14);
    let r = Math.pow(2, Math.max(0, zoom - 14));
    const url = `https://api.maptiler.com/tiles/terrain-rgb-v2/${sourceZoom}/${Math.floor(tx/r)}/${Math.floor(ty/r)}.png?key=${state.MK}`;
    return { url, sourceZoom };
}

// Référence cachée au CacheStorage worker — évite caches.open() à chaque tuile
let _workerCache: Cache | null = null;

/**
 * Lance le chargement d'une tuile via les Workers.
 */
export async function loadTileData(tx: number, ty: number, zoom: number, is2D: boolean): Promise<{ promise: Promise<any>, taskId: number }> {
    const { url: elevUrl, sourceZoom } = getElevationUrl(tx, ty, zoom, is2D);

    const nativeMax = 18;
    const cz = Math.min(zoom, nativeMax);
    const cr = Math.pow(2, Math.max(0, zoom - nativeMax));

    const colorUrl = getColorUrl(Math.floor(tx/cr), Math.floor(ty/cr), cz);
    const overlayUrl = getOverlayUrl(tx, ty, zoom);

    // v5.29.35 : Extraction directe des Blobs depuis les sources locales
    // v5.29.39 : Fix Satellite en Suisse (LOD 11-14). 
    // Les sources locales (packs/embedded) ne contiennent que la Topo.
    // On ne les utilise pour la 'color' que si on n'est PAS en mode satellite, 
    // SAUF si on est offline (où c'est mieux que rien).
    const blobs: { elev?: Blob | null, color?: Blob | null, overlay?: Blob | null } = {};
    const useLocalColor = state.MAP_SOURCE !== 'satellite' || state.IS_OFFLINE;

    if (useLocalColor) {
        if (embeddedPMTiles && zoom <= EMBEDDED_MAX_ZOOM) {
            blobs.color = await getTileFromEmbedded(cz, Math.floor(tx/cr), Math.floor(ty/cr));
        }

        if (packManager.hasMountedPacks() && zoom >= 12) {
            const cx = Math.floor(tx/cr);
            const cy = Math.floor(ty/cr);
            if (!blobs.color) blobs.color = await packManager.getTileFromPacks(cz, cx, cy, 'color');
        }
    }

    // L'élévation et l'overlay du pack sont toujours utiles, même en satellite
    if (packManager.hasMountedPacks() && zoom >= 12) {
        if (elevUrl && zoom <= 14) blobs.elev = await packManager.getTileFromPacks(zoom, tx, ty, 'elevation');
        if (overlayUrl) blobs.overlay = await packManager.getTileFromPacks(zoom, tx, ty, 'overlay');
    }

    return tileWorkerManager.loadTile(elevUrl, colorUrl, overlayUrl, zoom, sourceZoom, blobs, is2D);
}

/**
 * Annule un fetch de tuile en cours.
 * Résout la Promise avec null ET envoie un signal abort au worker concerné.
 */
export function cancelTileLoad(taskId: number): void {
    tileWorkerManager.cancelTile(taskId);
}



// ── Offline zone helpers ─────────────────────────────────────────────────────

const OFFLINE_ZONES_KEY = 'suntrail-offline-zones-count';

/** Nombre de zones hors-ligne téléchargées (toutes sessions confondues). */
export function getOfflineZoneCount(): number {
    return parseInt(localStorage.getItem(OFFLINE_ZONES_KEY) ?? '0', 10);
}

/** Incrémente le compteur de zones téléchargées. */
export function incrementOfflineZoneCount(): void {
    localStorage.setItem(OFFLINE_ZONES_KEY, String(getOfflineZoneCount() + 1));
}

/**
 * Estime la taille du téléchargement à partir du nombre de tuiles.
 * ~80 Ko par tuile (couleur + élévation + overlay).
 */
export function estimateZoneSizeMB(tileCount: number): string {
    const kb = tileCount * 80;
    return kb < 1024 ? `~${kb} Ko` : `~${(kb / 1024).toFixed(1)} Mo`;
}

export interface VisibleTileRef { tx: number; ty: number; zoom: number; }

/**
 * Télécharge exactement les tuiles visibles à l'écran pour l'usage hors-ligne.
 * Max 300 tuiles pour éviter les téléchargements accidentels.
 * Retourne true si TOUTES les tuiles ont été récupérées avec succès.
 */
export async function downloadVisibleZone(
    tiles: VisibleTileRef[],
    onProgress: (done: number, total: number) => void
): Promise<boolean> {
    const capped = tiles.slice(0, 300);
    const urls: string[] = [];
    for (const { tx, ty, zoom } of capped) {
        const colorUrl = getColorUrl(tx, ty, zoom);
        const { url: elevUrl } = getElevationUrl(tx, ty, zoom, false);
        const overlayUrl = getOverlayUrl(tx, ty, zoom);
        urls.push(colorUrl);
        if (elevUrl) urls.push(elevUrl);
        if (overlayUrl) urls.push(overlayUrl);
    }
    
    const total = urls.length;
    let done = 0;
    let successCount = 0;

    for (const url of urls) {
        try { 
            const blob = await fetchWithCache(url, true); 
            if (blob) successCount++;
        } catch (_) { /* silence */ }
        
        done++;
        if (done % 5 === 0) onProgress(done, total);
    }
    
    onProgress(total, total);
    return successCount === total;
}

