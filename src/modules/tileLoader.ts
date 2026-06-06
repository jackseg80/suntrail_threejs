import { state } from './state';
import { getCountryAtTile, isTileInCountry, countPointsInCountry } from './geo';
import { COUNTRY_SOURCES } from './tileSources';
import { showToast } from './toast';

import { tileWorkerManager } from './workerManager';
import { disposeAllCachedTiles } from './tileCache';
import * as pmtiles from 'pmtiles';
import { packManager } from './packManager';
import { STORAGE_KEYS } from '../constants/storage';
import type { TileWorkerResponse } from '../types/worker';

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
        if (state.DEBUG_MODE)
            console.log(
                `[PMTiles] Source chargée. Bounds: ${header.minLon},${header.minLat} to ${header.maxLon},${header.maxLat}`
            );
        localPMTiles = archive;
        showToast('Carte locale PMTiles activée');
    } catch (e) {
        console.error('[PMTiles] Erreur de chargement', e);
        showToast('Erreur PMTiles');
        localPMTiles = null;
    }
}

/**
 * Tente d'extraire une tuile depuis l'archive PMTiles locale.
 */
async function getTileFromPMTiles(
    z: number,
    x: number,
    y: number
): Promise<Blob | null> {
    if (!localPMTiles) return null;
    try {
        if (pmtilesController) pmtilesController.abort();
        pmtilesController = new AbortController();

        // PMTiles utilise le schéma XYZ standard
        const tileData = await localPMTiles.getZxy(
            z,
            x,
            y,
            pmtilesController.signal
        );
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
            .filter(
                (name) =>
                    name.startsWith('suntrail-tiles-') && name !== CACHE_NAME
            )
            .map((name) => {
                if (state.DEBUG_MODE)
                    console.log(
                        `[Cache] Suppression de l'ancienne version : ${name}`
                    );
                return caches.delete(name);
            });
        await Promise.all(deletions);
    } catch (e) {
        console.warn('[Cache] Échec du nettoyage des anciens caches', e);
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
            })(),
        ]);

        _workerCache = cache;
        embeddedPMTiles = archive;

        if (state.DEBUG_MODE) console.log(`[Embedded] Overview chargé.`);

        // Warmup en arrière-plan pour ne pas bloquer le thread principal au démarrage
        // (après ce call, les extractions suivantes sont ~10× plus rapides)
        setTimeout(() => {
            if (embeddedPMTiles)
                embeddedPMTiles.getZxy(6, 33, 22).catch(() => {});
        }, 1000);
    } catch (e) {
        console.warn('[Embedded] Échec chargement overview', e);
        embeddedPMTiles = null;
    }
}

/**
 * Tente d'extraire une tuile depuis l'archive overview embarquée (LOD ≤ 7 seulement).
 */
async function getTileFromEmbedded(
    z: number,
    x: number,
    y: number
): Promise<Blob | null> {
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
 * Si z, x, y sont fournis, les chutes PMTiles, country packs et embedded overview
 * fonctionnent quelle que soit la forme de l'URL (XYZ, KVP, RESTful...).
 */
export async function fetchWithCache(
    url: string,
    usePersistentCache: boolean = false,
    z?: number,
    x?: number,
    y?: number
): Promise<Blob | null> {
    const hasCoords = z !== undefined && x !== undefined && y !== undefined;

    // --- PMTILES INTERCEPTION (v5.7.0) ---
    if (localPMTiles && hasCoords) {
        const pmBlob = await getTileFromPMTiles(z!, x!, y!);
        if (pmBlob) {
            if (state.DEBUG_MODE)
                console.log(`[PMTiles] HIT pour ${z}/${x}/${y}`);
            return pmBlob;
        }
    }

    // --- COUNTRY PACKS INTERCEPTION (v5.21.0) — fonctionne offline ---
    if (packManager.hasMountedPacks() && hasCoords) {
        const packBlob = await packManager.getTileFromPacks(z!, x!, y!);
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
        if (embeddedPMTiles && hasCoords) {
            if (z! <= EMBEDDED_MAX_ZOOM) {
                const useLocal =
                    state.MAP_SOURCE !== 'satellite' || state.IS_OFFLINE;
                if (useLocal) {
                    const blob = await getTileFromEmbedded(z!, x!, y!);
                    if (blob) return blob;
                }
            }
        }
        if (state.IS_OFFLINE) return null;

        // v5.29.5 : Ajout d'un timeout pour ne pas bloquer les slots de connexion (max 6)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const r = await fetch(url, {
                mode: 'cors',
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            // v5.29.3 : Disjoncteur MapTiler (Rate Limit ou Clé invalide)
            if (url.includes('api.maptiler.com')) {
                if (r.status === 403 || r.status === 429) {
                    console.error(
                        `[MapTiler] Erreur ${r.status}. Basculement sur les sources de secours (OSM/OpenTopo).`
                    );
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
                    try {
                        await _workerCache.put(url, new Response(blob));
                    } catch {
                        /* cache write can fail */
                    }
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
 * Génère l'URL pour la texture de couleur/carte d'une tuile.
 * Data-driven : le pays est détecté via les polygones Natural Earth,
 * la source de tuiles est configurée dans tileSources.ts.
 */
export function getColorUrl(tx: number, ty: number, zoom: number): string {
    const hasKey =
        state.MK && state.MK.length > 10 && !state.isMapTilerDisabled;

    // --- MODE SATELLITE ---
    if (state.MAP_SOURCE === 'satellite') {
        const code = getCountryAtTile(tx, ty, zoom, 3);
        if (code) {
            const src = COUNTRY_SOURCES[code];
            if (
                src?.colorSatellite &&
                (src.minZoom ?? 0) <= zoom &&
                (src.maxZoom ?? 99) >= zoom
            ) {
                return src.colorSatellite(zoom, tx, ty);
            }
        }
        if (hasKey)
            return `https://api.maptiler.com/maps/satellite/256/${zoom}/${tx}/${ty}@2x.webp?key=${state.MK}`;
        return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;
    }

    // --- MODE TOPO / AUTRE ---

    // Bas zoom (vue d'ensemble) : OpenTopoMap pour tout le monde
    if (zoom <= 10) {
        const sub = ['a', 'b', 'c'][(tx + ty) % 3];
        return `https://${sub}.tile.opentopomap.org/${zoom}/${tx}/${ty}.png`;
    }

    // --- MODE OPENTOPOMAP (manuel) ---
    // L'utilisateur a explicitement choisi OpenTopoMap → on l'utilise toujours,
    // sans passer par MapTiler (qui lui ressemble trop visuellement)
    if (state.MAP_SOURCE === 'opentopomap') {
        if (zoom <= 17) {
            const sub = ['a', 'b', 'c'][(tx + ty) % 3];
            return `https://${sub}.tile.opentopomap.org/${zoom}/${tx}/${ty}.png`;
        }
        return `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
    }

    // Swisstopo / Topo (Auto) : data-driven via COUNTRY_SOURCES
    if (state.MAP_SOURCE === 'swisstopo') {
        let code = getCountryAtTile(tx, ty, zoom, 3);

        // v6.0 : Si la tuile a une présence CH, on préfère SwissTopo.
        // Évite le patchwork IGN/OpenTopoMap aux frontières même quand
        // le polygone OSM est imprécis (Bonfol, Damphreux, Aigle, Monthey).
        if (code !== 'CH' && zoom > 10) {
            const chPoints = countPointsInCountry(tx, ty, zoom, 'CH');
            if (chPoints >= 1) code = 'CH';
        }

        if (code) {
            const src = COUNTRY_SOURCES[code];
            if (
                src?.colorTopo &&
                (src.minZoom ?? 0) <= zoom &&
                (src.maxZoom ?? 99) >= zoom
            ) {
                // Vérification strictAtHighZoom (ex: CH Swisstopo LOD > 14)
                if (
                    src.strictAtHighZoom?.useStrictAbove &&
                    zoom > src.strictAtHighZoom.thresholdZoom
                ) {
                    const inStrict = isTileInCountry(tx, ty, zoom, code, 4);
                    if (inStrict) return src.colorTopo(zoom, tx, ty);
                    // Fallback : ne pas utiliser cette source, continuer la chaîne
                } else {
                    return src.colorTopo(zoom, tx, ty);
                }
            }
        }
    }

    // Fallback Topo Global (OpenTopoMap > MapTiler outdoor > OSM)
    // OpenTopoMap est gratuit et optimise rando → prioritaire sur MapTiler
    if (zoom <= 17) {
        const sub = ['a', 'b', 'c'][(tx + ty) % 3];
        return `https://${sub}.tile.opentopomap.org/${zoom}/${tx}/${ty}.png`;
    }
    if (hasKey)
        return `https://api.maptiler.com/maps/outdoor/256/${zoom}/${tx}/${ty}@2x.webp?key=${state.MK}`;
    return `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
}

/**
 * Génère l'URL pour la texture des sentiers/POI.
 */
export function getOverlayUrl(
    tx: number,
    ty: number,
    zoom: number
): string | null {
    const MIN_TRAIL_LOD = 11;
    if (!state.SHOW_TRAILS || zoom < MIN_TRAIL_LOD) return null;

    // SwissTopo wanderwege
    if (isTileInCountry(tx, ty, zoom, 'CH', 3)) {
        if (zoom < 13 || zoom > 18) return null;
        return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/${zoom}/${tx}/${ty}.png`;
    }
    // Waymarked Trails
    if (zoom > 17) return null;
    return `https://tile.waymarkedtrails.org/hiking/${zoom}/${tx}/${ty}.png`;
}

/**
 * Génère l'URL pour les données d'élévation (Terrain-RGB).
 */
export function getElevationUrl(
    tx: number,
    ty: number,
    zoom: number,
    is2D: boolean
): { url: string | null; sourceZoom: number } {
    if (is2D) return { url: null, sourceZoom: zoom };
    // Pas d'élévation si MapTiler désactivé (403) ou clé absente — la tuile sera plate mais visible
    if (state.isMapTilerDisabled || !state.MK || state.MK.length <= 10)
        return { url: null, sourceZoom: zoom };

    const sourceZoom = Math.min(zoom, 14);
    const r = Math.pow(2, Math.max(0, zoom - 14));
    const url = `https://api.maptiler.com/tiles/terrain-rgb-v2/${sourceZoom}/${Math.floor(tx / r)}/${Math.floor(ty / r)}.png?key=${state.MK}`;
    return { url, sourceZoom };
}

// Référence cachée au CacheStorage worker — évite caches.open() à chaque tuile
let _workerCache: Cache | null = null;

/**
 * Lance le chargement d'une tuile via les Workers.
 */
export async function loadTileData(
    tx: number,
    ty: number,
    zoom: number,
    is2D: boolean
): Promise<{ promise: Promise<TileWorkerResponse | null>; taskId: number }> {
    const { url: elevUrl, sourceZoom } = getElevationUrl(tx, ty, zoom, is2D);

    const nativeMax = 18;
    const cz = Math.min(zoom, nativeMax);
    const cr = Math.pow(2, Math.max(0, zoom - nativeMax));

    // Définition des flags pays via polygones Natural Earth
    const countryCode = getCountryAtTile(
        Math.floor(tx / cr),
        Math.floor(ty / cr),
        cz,
        3
    );
    const inCH = countryCode === 'CH';
    const inFR = countryCode === 'FR';
    const inIT = countryCode === 'IT';

    const colorUrl = getColorUrl(Math.floor(tx / cr), Math.floor(ty / cr), cz);
    const overlayUrl = getOverlayUrl(tx, ty, zoom);

    // v5.29.35 : Extraction directe des Blobs depuis les sources locales
    // v5.29.39 : Fix Satellite en Suisse (LOD 11-14).
    // Les sources locales (packs/embedded) ne contiennent que la Topo.
    // On ne les utilise pour la 'color' que si on n'est PAS en mode satellite,
    // SAUF si on est offline (où c'est mieux que rien).
    const blobs: {
        elev?: Blob | null;
        color?: Blob | null;
        overlay?: Blob | null;
    } = {};
    const useLocalColor = state.MAP_SOURCE !== 'satellite' || state.IS_OFFLINE;

    if (useLocalColor) {
        if (embeddedPMTiles && zoom <= EMBEDDED_MAX_ZOOM) {
            blobs.color = await getTileFromEmbedded(
                cz,
                Math.floor(tx / cr),
                Math.floor(ty / cr)
            );
        }

        if (packManager.hasMountedPacks() && zoom >= 12) {
            const cx = Math.floor(tx / cr);
            const cy = Math.floor(ty / cr);
            // v5.35.2 : N'utiliser les packs color que si on est strictement en zone CH ou FR (évite débordement Italie)
            // v5.56.20 : Ne pas utiliser les packs si l'utilisateur a choisi opentopomap manuellement
            const inPackZone =
                (inCH || inFR) && !inIT && state.MAP_SOURCE !== 'opentopomap';
            if (!blobs.color && inPackZone) {
                blobs.color = await packManager.getTileFromPacks(
                    cz,
                    cx,
                    cy,
                    'color'
                );
            }
        }
    }

    // L'élévation et l'overlay du pack sont toujours utiles, même en satellite
    if (packManager.hasMountedPacks() && zoom >= 12) {
        if (elevUrl && zoom <= 14)
            blobs.elev = await packManager.getTileFromPacks(
                zoom,
                tx,
                ty,
                'elevation'
            );
        if (overlayUrl)
            blobs.overlay = await packManager.getTileFromPacks(
                zoom,
                tx,
                ty,
                'overlay'
            );
    }

    return tileWorkerManager.loadTile(
        tx,
        ty,
        elevUrl,
        colorUrl,
        overlayUrl,
        zoom,
        sourceZoom,
        blobs,
        is2D
    );
}

/**
 * Annule un fetch de tuile en cours.
 * Résout la Promise avec null ET envoie un signal abort au worker concerné.
 */
export function cancelTileLoad(taskId: number): void {
    tileWorkerManager.cancelTile(taskId);
}

// ── Offline zone helpers ─────────────────────────────────────────────────────

/** Nombre de zones hors-ligne téléchargées (toutes sessions confondues). */
export function getOfflineZoneCount(): number {
    return parseInt(
        localStorage.getItem(STORAGE_KEYS.OFFLINE_ZONES_COUNT) ?? '0',
        10
    );
}

/** Incrémente le compteur de zones téléchargées. */
export function incrementOfflineZoneCount(): void {
    localStorage.setItem(
        STORAGE_KEYS.OFFLINE_ZONES_COUNT,
        String(getOfflineZoneCount() + 1)
    );
}

/**
 * Estime la taille du téléchargement à partir du nombre de tuiles.
 * ~80 Ko par tuile (couleur + élévation + overlay).
 */
export function estimateZoneSizeMB(tileCount: number): string {
    const kb = tileCount * 80;
    return kb < 1024 ? `~${kb} Ko` : `~${(kb / 1024).toFixed(1)} Mo`;
}

export interface VisibleTileRef {
    tx: number;
    ty: number;
    zoom: number;
}

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
    const queue: { url: string; z: number; x: number; y: number }[] = [];
    for (const { tx, ty, zoom } of capped) {
        const colorUrl = getColorUrl(tx, ty, zoom);
        const { url: elevUrl } = getElevationUrl(tx, ty, zoom, false);
        const overlayUrl = getOverlayUrl(tx, ty, zoom);
        queue.push({ url: colorUrl, z: zoom, x: tx, y: ty });
        if (elevUrl) queue.push({ url: elevUrl, z: zoom, x: tx, y: ty });
        if (overlayUrl) queue.push({ url: overlayUrl, z: zoom, x: tx, y: ty });
    }

    const total = queue.length;
    let done = 0;
    let successCount = 0;

    for (const { url, z, x, y } of queue) {
        try {
            const blob = await fetchWithCache(url, true, z, x, y);
            if (blob) successCount++;
        } catch (_) {
            /* silence */
        }

        done++;
        if (done % 5 === 0) onProgress(done, total);
    }

    onProgress(total, total);
    return successCount === total;
}

const MAX_ZONE_TILES = 2000;

/**
 * Télécharge toutes les tuiles d'une zone pour une plage de LOD.
 * Version multi-LOD avec feedback par niveau.
 */
export async function downloadZoneMultiLOD(
    tilesByLod: Map<number, VisibleTileRef[]>,
    onProgress: (
        done: number,
        total: number,
        currentLod: number,
        lodLabel: string
    ) => void
): Promise<boolean> {
    let totalTiles = 0;
    for (const tiles of tilesByLod.values()) {
        totalTiles += tiles.length;
    }
    if (totalTiles > MAX_ZONE_TILES) return false;

    const allUrls: { url: string; z: number; x: number; y: number }[] = [];
    const sortedLods = Array.from(tilesByLod.keys()).sort((a, b) => a - b);

    const lodQueues: Map<
        number,
        { url: string; z: number; x: number; y: number }[]
    > = new Map();

    for (const lod of sortedLods) {
        const tiles = tilesByLod.get(lod)!;
        const queue: { url: string; z: number; x: number; y: number }[] = [];
        for (const { tx, ty, zoom } of tiles) {
            const colorUrl = getColorUrl(tx, ty, zoom);
            const { url: elevUrl } = getElevationUrl(tx, ty, zoom, false);
            const overlayUrl = getOverlayUrl(tx, ty, zoom);
            queue.push({ url: colorUrl, z: zoom, x: tx, y: ty });
            if (elevUrl) queue.push({ url: elevUrl, z: zoom, x: tx, y: ty });
            if (overlayUrl)
                queue.push({ url: overlayUrl, z: zoom, x: tx, y: ty });
        }
        lodQueues.set(lod, queue);
        allUrls.push(...queue);
    }

    const total = allUrls.length;
    let done = 0;

    for (const lod of sortedLods) {
        const queue = lodQueues.get(lod)!;
        for (const { url, z, x, y } of queue) {
            try {
                await fetchWithCache(url, true, z, x, y);
            } catch (_) {
                /* silence */
            }
            done++;
            if (done % 5 === 0) {
                onProgress(done, total, lod, `LOD ${lod}`);
            }
        }
    }

    onProgress(total, total, -1, '');
    return true;
}
