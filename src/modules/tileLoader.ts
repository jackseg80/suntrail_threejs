import { state } from './state';
import {
    getCountryAtTile,
    isTileInCountry,
    countPointsInCountry,
    hasTileCountryOverlap,
} from './geo';
import { COUNTRY_SOURCES } from './tileSources';
import { showToast } from './toast';
import { rotateMapTilerKey } from './config';
import { tileWorkerManager } from './workerManager';
import { disposeAllCachedTiles } from './tileCache';
import * as pmtiles from 'pmtiles';
import { packManager } from './packManager';
import { STORAGE_KEYS } from '../constants/storage';
import type { TileWorkerResponse } from '../types/worker';

export const CACHE_NAME = 'suntrail-tiles-v30';
export const OFFLINE_CACHE_NAME = 'suntrail-offline-zones';

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
    y: number,
    useSharedAbortController = true
): Promise<Blob | null> {
    if (!localPMTiles) return null;
    try {
        let signal: AbortSignal | undefined;
        if (useSharedAbortController) {
            if (pmtilesController) pmtilesController.abort();
            pmtilesController = new AbortController();
            signal = pmtilesController.signal;
        }

        // PMTiles utilise le schéma XYZ standard
        const tileData = await localPMTiles.getZxy(z, x, y, signal);
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
        // v5.62.2 : Suppression séquentielle pour éviter la pression I/O sur mobile
        for (const name of cacheNames) {
            if (
                (name.startsWith('suntrail-tiles-') && name !== CACHE_NAME) ||
                (name.startsWith('suntrail-offline-') &&
                    name !== OFFLINE_CACHE_NAME)
            ) {
                try {
                    if (state.DEBUG_MODE)
                        console.log(
                            `[Cache] Suppression de l'ancienne version : ${name}`
                        );
                    await caches.delete(name);
                } catch {
                    /* skip individual delete failures */
                }
            }
        }
    } catch (e) {
        console.warn('[Cache] Échec du nettoyage des anciens caches', e);
    }
}

/**
 * Réinitialise l'état interne du tileLoader (caches, index, PMTiles).
 * Utilisé par les tests pour isoler chaque scénario.
 */
export function resetTileLoaderState(): void {
    _workerCache = null;
    _offlineCache = null;
    _cacheIndex.clear();
    _offlineCacheIndex.clear();
    embeddedPMTiles = null;
}

/**
 * Initialise la couche CacheStorage (caches normal + offline + index mémoire).
 * Doit être appelée AVANT le premier updateVisibleTiles() pour que les tiles
 * en cache soient trouvées sans passer par le réseau.
 *
 * Séparée de initEmbeddedOverview() pour éviter la dépendance au chargement
 * réseau des PMTiles (race condition au démarrage).
 */
export async function initCacheLayer(): Promise<void> {
    if (_workerCache && _offlineCache) return; // déjà initialisé

    // Les anciens caches ne participent jamais aux lectures courantes. Leur
    // suppression peut être coûteuse après une mise à jour, donc elle ne doit
    // pas retarder l'ouverture des caches utilisés par la première carte.
    void cleanupOldCaches();

    const [cache, offlineCache] = await Promise.all([
        caches.open(CACHE_NAME),
        caches.open(OFFLINE_CACHE_NAME),
    ]);

    _workerCache = cache;
    _offlineCache = offlineCache;

    warmupCacheIndex(cache, _cacheIndex);
    warmupCacheIndex(offlineCache, _offlineCacheIndex);

    if (state.DEBUG_MODE)
        console.log(
            `[Cache] CacheStorage initialisé (${_cacheIndex.size} normal, ${_offlineCacheIndex.size} offline).`
        );
}

/** Vérifie directement le CacheStorage offline, sans réseau. */
export async function hasOfflineTileResource(url: string): Promise<boolean> {
    if (!_offlineCache) await initCacheLayer();
    if (!_offlineCache) return false;
    try {
        const response = await _offlineCache.match(url);
        if (response) {
            _offlineCacheIndex.set(url, true);
            return true;
        }
    } catch {
        // Une lecture impossible n'est jamais transformée en preuve locale.
    }
    _offlineCacheIndex.delete(url);
    return false;
}

/**
 * Supprime uniquement les URLs explicitement confiées par un registre
 * d'ownership. Les appelants doivent avoir vérifié les références partagées.
 */
export async function deleteOfflineTileResources(
    urls: Iterable<string>
): Promise<number> {
    if (!_offlineCache) await initCacheLayer();
    if (!_offlineCache) return 0;
    let deleted = 0;
    for (const url of new Set(urls)) {
        try {
            if (await _offlineCache.delete(url)) deleted++;
        } finally {
            _offlineCacheIndex.delete(url);
        }
    }
    return deleted;
}

/**
 * Monte l'archive PMTiles overview embarquée dans l'APK/PWA (LOD 5-11).
 * Appelée une fois au démarrage. La couche CacheStorage est déjà initialisée
 * par initCacheLayer() en amont.
 */
export async function initEmbeddedOverview(): Promise<void> {
    // S'assurer que la couche cache est prête (idempotent si déjà appelé)
    if (!_workerCache) await initCacheLayer();

    try {
        const url = './tiles/europe-overview.pmtiles';

        const archive = new pmtiles.PMTiles(url);
        await archive.getHeader();
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
    _cacheIndex.clear();
    _offlineCacheIndex.clear();
    try {
        const [deletedNormal, deletedOffline] = await Promise.all([
            caches.delete(CACHE_NAME),
            caches.delete(OFFLINE_CACHE_NAME),
        ]);
        _offlineCache = null;
        showToast(
            deletedNormal || deletedOffline ? 'Cache vidé' : 'Cache déjà vide'
        );
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
 * Priorité de recherche : PMTiles locales > Country Packs > CacheStorage offline > CacheStorage normal > Embedded Overview > Réseau.
 * Si z, x, y sont fournis, les chutes PMTiles, country packs et embedded overview
 * fonctionnent quelle que soit la forme de l'URL (XYZ, KVP, RESTful...).
 * @param storeInOfflineCache Si true, le blob téléchargé est stocké dans le cache offline (zones hors-ligne).
 */
export type TileResourceType = 'color' | 'elevation' | 'overlay';

export interface FetchWithCacheOptions {
    resourceType?: TileResourceType;
    signal?: AbortSignal;
    localOnlyPacks?: boolean;
    requireOfflineStorage?: boolean;
    allowNetwork?: boolean;
}

export async function fetchWithCache(
    url: string,
    usePersistentCache: boolean = false,
    z?: number,
    x?: number,
    y?: number,
    storeInOfflineCache: boolean = false,
    options: FetchWithCacheOptions = {}
): Promise<Blob | null> {
    const hasCoords = z !== undefined && x !== undefined && y !== undefined;
    const resourceType = options.resourceType ?? 'color';
    if (options.signal?.aborted) return null;

    // --- PMTILES INTERCEPTION (v5.7.0) ---
    if (resourceType === 'color' && localPMTiles && hasCoords) {
        const pmBlob = await getTileFromPMTiles(z!, x!, y!);
        if (pmBlob) {
            if (state.DEBUG_MODE)
                console.log(`[PMTiles] HIT pour ${z}/${x}/${y}`);
            return pmBlob;
        }
    }

    // --- COUNTRY PACKS INTERCEPTION (v5.21.0) — fonctionne offline ---
    if (packManager.hasMountedPacks() && hasCoords) {
        const packBlob = options.localOnlyPacks
            ? await packManager.getOfflineTileFromPacks(
                  z!,
                  x!,
                  y!,
                  resourceType
              )
            : resourceType === 'color'
              ? await packManager.getTileFromPacks(z!, x!, y!)
              : await packManager.getTileFromPacks(z!, x!, y!, resourceType);
        if (packBlob) return packBlob;
    }

    // Garde offline : après les sources locales, avant réseau/cache
    if (state.IS_OFFLINE && !usePersistentCache) return null;

    try {
        if (usePersistentCache) {
            // v5.61.4 : Vérifier d'abord le cache offline, puis le cache normal
            if (_offlineCache) {
                try {
                    const cachedOffline = await _offlineCache.match(url);
                    if (cachedOffline) {
                        state.cacheHits++;
                        updateStorageUI();
                        return await cachedOffline.blob();
                    }
                } catch {
                    /* fallthrough to normal cache */
                }
            }
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(url);
            if (cached) {
                state.cacheHits++;
                updateStorageUI();
                const blob = await cached.blob();
                if (storeInOfflineCache) {
                    try {
                        const offlineCache =
                            await caches.open(OFFLINE_CACHE_NAME);
                        await offlineCache.put(url, new Response(blob.slice()));
                        _offlineCacheIndex.set(url, true);
                    } catch {
                        if (options.requireOfflineStorage) return null;
                    }
                }
                return blob;
            }
        }
        // Fallback embedded overview (LOD ≤ 11) — avant le réseau
        if (resourceType === 'color' && embeddedPMTiles && hasCoords) {
            if (z! <= EMBEDDED_MAX_ZOOM) {
                const useLocal =
                    state.MAP_SOURCE !== 'satellite' || state.IS_OFFLINE;
                if (useLocal) {
                    const blob = await getTileFromEmbedded(z!, x!, y!);
                    if (blob) return blob;
                }
            }
        }
        if (state.IS_OFFLINE || options.allowNetwork === false) return null;

        // v5.29.5 : Ajout d'un timeout pour ne pas bloquer les slots de connexion (max 6)
        const controller = new AbortController();
        const abortFromCaller = () => controller.abort();
        options.signal?.addEventListener('abort', abortFromCaller, {
            once: true,
        });
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const r = await fetch(url, {
                mode: 'cors',
                signal: controller.signal,
            });
            // v5.29.3 : Disjoncteur MapTiler (Rate Limit ou Clé invalide)
            if (url.includes('api.maptiler.com')) {
                if (r.status === 403 || r.status === 429) {
                    console.error(`[MapTiler] Erreur ${r.status}.`);
                    const hasMoreKeys = rotateMapTilerKey();
                    if (!hasMoreKeys) {
                        console.warn(
                            '[MapTiler] Aucune clé valide restante — basculement sur les sources de secours (OSM/OpenTopo).'
                        );
                        state.isMapTilerDisabled = true;
                    }
                    disposeAllCachedTiles();
                    return null;
                }
            }

            if (r.ok) {
                const blob = await r.blob();
                state.networkRequests++;
                updateStorageUI();
                if (storeInOfflineCache) {
                    try {
                        const oc = await caches.open(OFFLINE_CACHE_NAME);
                        await oc.put(url, new Response(blob.slice()));
                        _offlineCacheIndex.set(url, true);
                    } catch {
                        if (options.requireOfflineStorage) return null;
                    }
                } else if (usePersistentCache && _workerCache) {
                    try {
                        await _workerCache.put(url, new Response(blob));
                        _cacheIndex.set(url, true);
                    } catch {
                        /* cache write can fail */
                    }
                }
                return blob;
            }
        } catch (e) {
            if ((e as Error).name === 'AbortError') {
                console.warn(`[tileLoader] Timeout ou Abort sur ${url}`);
            }
        } finally {
            clearTimeout(timeoutId);
            options.signal?.removeEventListener('abort', abortFromCaller);
        }
        return null;
    } catch (e) {
        console.warn(
            `[tileLoader] fetchWithCache failed for ${url}:`,
            (e as Error).message
        );
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
        if (code !== 'CH' && zoom > 10 && zoom <= 14) {
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
                    const inStrict = isTileInCountry(tx, ty, zoom, code, 5);
                    const hasCountryOverlap = hasTileCountryOverlap(
                        tx,
                        ty,
                        zoom,
                        code,
                        3
                    );
                    if (inStrict && !hasCountryOverlap)
                        return src.colorTopo(zoom, tx, ty);
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
let _offlineCache: Cache | null = null;

// Index mémoire pour éviter O(n) caches.match() — v5.61.4
// Ne remplace pas le cache : en cas de miss on retombe sur caches.match().
const _cacheIndex = new Map<string, boolean>();
const _offlineCacheIndex = new Map<string, boolean>();

/**
 * Peuple les index mémoire avec les URLs déjà présentes dans le cache.
 * Appelé au démarrage pour éviter que la première navigation soit lente.
 */
async function warmupCacheIndex(
    cache: Cache,
    index: Map<string, boolean>
): Promise<void> {
    try {
        const keys = await cache.keys();
        for (const req of keys) index.set(req.url, true);
        if (state.DEBUG_MODE && keys.length > 0)
            console.log(`[Cache] Index warmup: ${keys.length} entrées`);
    } catch {
        /* warmup best-effort */
    }
}

/**
 * Récupère un blob depuis le CacheStorage s'il existe (zones offline vérifiées en priorité).
 * Retourne null si l'entrée est absente/corrompue.
 * v5.61.4 : Cherche d'abord dans le cache offline (zones téléchargées), puis dans le cache normal.
 */
async function getCachedBlob(url: string): Promise<Blob | null> {
    // 1. Cache offline (zones explicitement téléchargées par l'utilisateur)
    // Workers also write CacheStorage. The startup index is not authoritative
    // for misses: a resource can have arrived since it was populated.
    if (_offlineCache) {
        try {
            const cached = await _offlineCache.match(url);
            if (cached) {
                const blob = await cached.blob();
                if (blob.size >= 100) return blob;
                _offlineCache.delete(url);
                _offlineCacheIndex.delete(url);
            } else {
                _offlineCacheIndex.delete(url);
            }
        } catch {
            _offlineCacheIndex.delete(url);
        }
    }

    // 2. Cache normal (navigation quotidienne)
    if (!_workerCache) return null;
    try {
        const cached = await _workerCache.match(url);
        if (!cached) {
            _cacheIndex.delete(url);
            return null;
        }
        const blob = await cached.blob();
        if (blob.size < 100) {
            _workerCache.delete(url);
            _cacheIndex.delete(url);
            return null;
        }
        return blob;
    } catch {
        _cacheIndex.delete(url);
        return null;
    }
}

export interface OfflineTileResourceInspection {
    covered: boolean;
    sizeBytes: number;
}

/**
 * Mesure les ressources immédiatement lisibles sans réseau pour une tuile.
 * La couleur est la ressource minimale pour conserver un fond de carte lisible.
 * L'élévation et l'overlay améliorent le rendu, mais leur absence n'empêche pas
 * le worker d'afficher la tuile hors ligne.
 */
export async function inspectOfflineTileResources(tile: {
    zoom: number;
    tx: number;
    ty: number;
}): Promise<OfflineTileResourceInspection> {
    if (!_workerCache || !_offlineCache) await initCacheLayer();

    const { zoom, tx, ty } = tile;
    const { url: elevationUrl } = getElevationUrl(tx, ty, zoom, false);
    const colorUrl = getColorUrl(tx, ty, zoom);
    const overlayUrl = getOverlayUrl(tx, ty, zoom);
    const required = {
        elevation: elevationUrl !== null,
        overlay: overlayUrl !== null,
    };
    const blobs: {
        color: Blob | null;
        elevation: Blob | null;
        overlay: Blob | null;
    } = { color: null, elevation: null, overlay: null };

    // Source PMTiles importée localement, puis overview embarqué.
    blobs.color = await getTileFromPMTiles(zoom, tx, ty, false);
    if (!blobs.color && embeddedPMTiles && zoom <= EMBEDDED_MAX_ZOOM) {
        blobs.color = await getTileFromEmbedded(zoom, tx, ty);
    }

    // Le PackManager porte lui-même le catalogue mondial, les LOD et les bornes
    // de chaque pack. Ne pas préfiltrer par pays ici : cela exclurait les packs
    // régionaux ou les zones que le jeu de polygones embarqué ne connaît pas.
    if (!blobs.color && state.MAP_SOURCE !== 'opentopomap') {
        blobs.color = await packManager.getOfflineTileFromPacks(
            zoom,
            tx,
            ty,
            'color'
        );
    }
    if (zoom >= 12) {
        if (required.elevation && zoom <= 14) {
            blobs.elevation = await packManager.getOfflineTileFromPacks(
                zoom,
                tx,
                ty,
                'elevation'
            );
        }
        if (required.overlay) {
            blobs.overlay = await packManager.getOfflineTileFromPacks(
                zoom,
                tx,
                ty,
                'overlay'
            );
        }
    }

    const [cachedColor, cachedElevation, cachedOverlay] = await Promise.all([
        !blobs.color ? getCachedBlob(colorUrl) : null,
        required.elevation && !blobs.elevation
            ? getCachedBlob(elevationUrl!)
            : null,
        required.overlay && !blobs.overlay ? getCachedBlob(overlayUrl!) : null,
    ]);
    blobs.color ??= cachedColor;
    blobs.elevation ??= cachedElevation;
    blobs.overlay ??= cachedOverlay;

    const covered = blobs.color !== null;
    return {
        covered,
        sizeBytes:
            (blobs.color?.size ?? 0) +
            (blobs.elevation?.size ?? 0) +
            (blobs.overlay?.size ?? 0),
    };
}

/**
 * Lance le chargement d'une tuile via les Workers.
 *
 * Chaîne de priorité des sources (par ordre décroissant) :
 *   1. CacheStorage zones offline puis cache courant, aux URL de la source choisie
 *   2. embeddedPMTiles (overview LOD 5-11, embarqué dans l'APK)
 *   3. PackManager packs (locaux puis distants)
 *   4. Réseau (OpenTopoMap > MapTiler > OSM)
 *
 * v5.57.2 : Vérifie CacheStorage sur le main thread pour les zones offline.
 * Les blobs trouvés sont passés directement au worker (bypass réseau même online lent).
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

    // A mounted pack may use the network. Resolve cached resources first so a
    // slow pack cannot hold up a map already available on the device.
    if (!_workerCache || !_offlineCache) await initCacheLayer();
    const [colorBlob, elevBlob, overlayBlob] = await Promise.all([
        colorUrl ? getCachedBlob(colorUrl) : null,
        elevUrl ? getCachedBlob(elevUrl) : null,
        overlayUrl ? getCachedBlob(overlayUrl) : null,
    ]);
    if (colorBlob) blobs.color = colorBlob;
    if (elevBlob) blobs.elev = elevBlob;
    if (overlayBlob) blobs.overlay = overlayBlob;
    const useLocalColor = state.MAP_SOURCE !== 'satellite' || state.IS_OFFLINE;

    if (useLocalColor) {
        if (!blobs.color && embeddedPMTiles && zoom <= EMBEDDED_MAX_ZOOM) {
            blobs.color = await getTileFromEmbedded(
                cz,
                Math.floor(tx / cr),
                Math.floor(ty / cr)
            );
        }

        if (
            packManager.hasMountedPacks() &&
            zoom >= packManager.getMinPackZoom()
        ) {
            const cx = Math.floor(tx / cr);
            const cy = Math.floor(ty / cr);
            // v6.0 : Data-driven — tout pack installé couvrant le pays de la tuile est éligible.
            // Anti-débordement Italie conservé pour CH/FR (polygones frontaliers imprécis).
            // v5.56.20 : Ne pas utiliser les packs si l'utilisateur a choisi opentopomap manuellement.
            const tileCountry = countryCode;
            const antiOverflowIT =
                inIT && (tileCountry === 'CH' || tileCountry === 'FR');
            const hasPack = packManager.hasInstalledPackForCountry(
                tileCountry ?? ''
            );
            // v5.73.1 : Ne jamais utiliser la couleur du pack en dessous de LOD 11.
            // getColorUrl() force OpenTopoMap global pour LOD ≤ 10 (ligne 398).
            // Le pack suit la même règle : LOD 11 pour tous les pays.
            // Si le pack n'a pas la tuile à ce zoom, getTileFromPacks retourne null → fallback normal.
            const srcMinZoom = 11;
            const inPackZone =
                tileCountry !== null &&
                hasPack &&
                zoom >= srcMinZoom &&
                !antiOverflowIT &&
                state.MAP_SOURCE !== 'opentopomap';
            if (!blobs.color && inPackZone) {
                blobs.color = await packManager.getTileFromPacks(
                    cz,
                    cx,
                    cy,
                    'color'
                );
                if (state.DEBUG_MODE) {
                    if (blobs.color) {
                        console.log(
                            `[PackColor] HIT: ${cz}/${cx}/${cy} country=${tileCountry} size=${blobs.color.size}`
                        );
                    } else {
                        console.warn(
                            `[PackColor] MISS: ${cz}/${cx}/${cy} country=${tileCountry} hasPack=${hasPack} offline=${state.IS_OFFLINE}`
                        );
                    }
                }
            } else if (state.DEBUG_MODE && tileCountry) {
                console.warn(
                    `[PackColor] SKIP: ${cz}/${cx}/${cy} country=${tileCountry} hasPack=${hasPack} inPackZone=${inPackZone} hasColor=${!!blobs.color} offline=${state.IS_OFFLINE}`
                );
            }
        }
    }

    // L'élévation et l'overlay du pack sont toujours utiles, même en satellite
    if (packManager.hasMountedPacks() && zoom >= 12) {
        if (!blobs.elev && elevUrl && zoom <= 14)
            blobs.elev = await packManager.getTileFromPacks(
                zoom,
                tx,
                ty,
                'elevation'
            );
        if (!blobs.overlay && overlayUrl)
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
    const counter = parseInt(
        localStorage.getItem(STORAGE_KEYS.OFFLINE_ZONES_COUNT) ?? '0',
        10
    );
    if (counter === 0) {
        try {
            const raw = localStorage.getItem('suntrail_cached_zones');
            if (raw) {
                const zones = JSON.parse(raw);
                if (Array.isArray(zones) && zones.length > 0) {
                    localStorage.setItem(
                        STORAGE_KEYS.OFFLINE_ZONES_COUNT,
                        String(zones.length)
                    );
                    return zones.length;
                }
            }
        } catch {
            /* ignore */
        }
    }
    return counter;
}

/** Incrémente le compteur de zones téléchargées. */
export function incrementOfflineZoneCount(): void {
    localStorage.setItem(
        STORAGE_KEYS.OFFLINE_ZONES_COUNT,
        String(getOfflineZoneCount() + 1)
    );
}

/** Décrémente le compteur de zones téléchargées (minimum 0). */
export function decrementOfflineZoneCount(): void {
    const current = getOfflineZoneCount();
    if (current > 0) {
        localStorage.setItem(
            STORAGE_KEYS.OFFLINE_ZONES_COUNT,
            String(current - 1)
        );
    }
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
            const blob = await fetchWithCache(url, true, z, x, y, true);
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
    ) => void,
    abortSignal?: AbortSignal
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
    const downloaded: string[] = [];

    for (const lod of sortedLods) {
        if (abortSignal?.aborted) break;
        const queue = lodQueues.get(lod)!;
        for (const { url, z, x, y } of queue) {
            if (abortSignal?.aborted) break;
            try {
                await fetchWithCache(url, true, z, x, y, true);
                downloaded.push(url);
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

    if (abortSignal?.aborted) {
        // Nettoyer les tuiles déjà téléchargées dans le cache offline
        try {
            const cache = await caches.open(OFFLINE_CACHE_NAME);
            for (const url of downloaded) {
                await cache.delete(url);
            }
        } catch {
            /* ignore */
        }
        return false;
    }

    return true;
}
