/**
 * packCatalog.ts — Country Packs Catalog
 *
 * Gère le catalogue des packs pays disponibles :
 *   - Catalogue embarqué (fallback)
 *   - Fetch CDN (avec cache localStorage)
 *   - Recherche de pack par position géographique
 *   - Check de mises à jour
 */

import { STORAGE_KEYS } from '../constants/storage';
import type { PackMeta, PackCatalog } from './packTypes';

const CDN_BASE_URL = 'https://pub-80e58a345eb447ce9b918f2ad4348458.r2.dev';
const CATALOG_URL = import.meta.env.VITE_PACKS_CATALOG_URL as
    string | undefined;
const DIAGNOSTIC_PACK_URL = import.meta.env.VITE_DIAGNOSTIC_PACK_URL as
    string | undefined;
const DIAGNOSTIC_PACK_VERSION = Number(
    import.meta.env.VITE_DIAGNOSTIC_PACK_VERSION ?? 1
);
const DIAGNOSTIC_PACK_SIZE_MB = Number(
    import.meta.env.VITE_DIAGNOSTIC_PACK_SIZE_MB ?? 33
);
const DIAGNOSTIC_PACK_MIN_LOD = Number(
    import.meta.env.VITE_DIAGNOSTIC_PACK_MIN_LOD ?? 12
);
const DIAGNOSTIC_PACK_MAX_LOD = Number(
    import.meta.env.VITE_DIAGNOSTIC_PACK_MAX_LOD ?? 14
);
const DIAGNOSTIC_PACK_FULL_COVERAGE =
    import.meta.env.VITE_DIAGNOSTIC_PACK_FULL_COVERAGE === 'true';

export function catalogScopedStorageKey(
    baseKey: string,
    url: string | undefined
): string {
    // Keep the existing cache for the shared catalog. A versioned catalog must
    // not leave v6 data in a key an older app reads after a rollback.
    if (!url || url === `${CDN_BASE_URL}/catalog.json`) {
        return baseKey;
    }
    return `${baseKey}:${encodeURIComponent(url)}`;
}

export function catalogCacheKeyForUrl(url: string | undefined): string {
    return catalogScopedStorageKey(STORAGE_KEYS.PACK_CATALOG, url);
}

const CATALOG_CACHE_KEY = catalogCacheKeyForUrl(CATALOG_URL);

const EMBEDDED_CATALOG: PackCatalog = {
    // Keep this fallback aligned with the public catalog. It is used on a
    // fresh offline install and when the CDN cannot be reached.
    version: 5,
    packs: [
        {
            id: 'switzerland',
            productId: 'suntrail_pack_switzerland',
            name: {
                fr: 'Suisse HD',
                de: 'Schweiz HD',
                it: 'Svizzera HD',
                en: 'Switzerland HD',
            },
            bounds: { minLat: 45.8, maxLat: 47.8, minLon: 5.9, maxLon: 10.5 },
            lodRange: { min: 8, max: 14 },
            version: 6,
            sizeMB: 592,
            cdnUrl: `${CDN_BASE_URL}/packs/suntrail-pack-switzerland-v6.pmtiles`,
            regionCheck: 'CH',
        },
        {
            id: 'france_alps',
            productId: 'suntrail_pack_france_alps',
            name: {
                fr: 'France Alpes HD',
                de: 'Französische Alpen HD',
                it: 'Alpi Francesi HD',
                en: 'France Alps HD',
            },
            bounds: { minLat: 43.5, maxLat: 46.5, minLon: 4.5, maxLon: 7.8 },
            lodRange: { min: 8, max: 14 },
            version: 2,
            sizeMB: 515,
            cdnUrl: `${CDN_BASE_URL}/packs/suntrail-pack-france_alps-v2.pmtiles`,
            regionCheck: 'FR',
        },
        {
            id: 'austria',
            productId: 'suntrail_pack_austria',
            name: {
                fr: 'Autriche HD',
                de: 'Österreich HD',
                it: 'Austria HD',
                en: 'Austria HD',
            },
            bounds: { minLat: 46.3, maxLat: 49.1, minLon: 9.4, maxLon: 17.3 },
            lodRange: { min: 8, max: 14 },
            version: 1,
            sizeMB: 980,
            cdnUrl: `${CDN_BASE_URL}/packs/suntrail-pack-austria-v1.pmtiles`,
            regionCheck: 'AT',
        },
        ...(DIAGNOSTIC_PACK_URL
            ? [
                  {
                      id: 'switzerland_diagnostic',
                      productId: 'suntrail_pack_switzerland_diagnostic',
                      name: {
                          fr: DIAGNOSTIC_PACK_FULL_COVERAGE
                              ? 'Suisse — diagnostic complet'
                              : 'Suisse — échantillon diagnostic',
                          de: DIAGNOSTIC_PACK_FULL_COVERAGE
                              ? 'Schweiz — vollständiger Diagnosetest'
                              : 'Schweiz — Diagnosetest',
                          it: DIAGNOSTIC_PACK_FULL_COVERAGE
                              ? 'Svizzera — diagnostica completa'
                              : 'Svizzera — campione diagnostico',
                          en: DIAGNOSTIC_PACK_FULL_COVERAGE
                              ? 'Switzerland — full diagnostic'
                              : 'Switzerland — diagnostic sample',
                      },
                      bounds: DIAGNOSTIC_PACK_FULL_COVERAGE
                          ? {
                                minLat: 45.8,
                                maxLat: 47.8,
                                minLon: 5.9,
                                maxLon: 10.5,
                            }
                          : {
                                minLat: 45.9,
                                maxLat: 47.45,
                                minLon: 7.55,
                                maxLon: 8.65,
                            },
                      lodRange: {
                          min: DIAGNOSTIC_PACK_MIN_LOD,
                          max: DIAGNOSTIC_PACK_MAX_LOD,
                      },
                      version: DIAGNOSTIC_PACK_VERSION,
                      sizeMB: DIAGNOSTIC_PACK_SIZE_MB,
                      cdnUrl: DIAGNOSTIC_PACK_URL,
                      regionCheck: 'CH',
                  },
              ]
            : []),
    ],
};

let _catalog: PackCatalog | null = null;
let _catalogFetchPromise: Promise<PackCatalog> | null = null;

export function getEmbeddedCatalog(): PackCatalog {
    return EMBEDDED_CATALOG;
}

export function getCatalog(): PackCatalog | null {
    return _catalog;
}

export function getAvailablePacks(): PackMeta[] {
    return _catalog?.packs ?? [];
}

export function getPackMeta(packId: string): PackMeta | undefined {
    return _catalog?.packs?.find((p) => p.id === packId);
}

function getCachedCatalog(): PackCatalog | null {
    try {
        const raw = localStorage.getItem(CATALOG_CACHE_KEY);
        if (!raw) return null;
        const value: unknown = JSON.parse(raw);
        return isPackCatalog(value) ? value : null;
    } catch {
        return null;
    }
}

function isPackCatalog(value: unknown): value is PackCatalog {
    if (!value || typeof value !== 'object') return false;
    const catalog = value as Partial<PackCatalog>;
    return (
        Number.isSafeInteger(catalog.version) &&
        (catalog.version ?? 0) > 0 &&
        Array.isArray(catalog.packs) &&
        catalog.packs.length > 0 &&
        catalog.packs.every((value: unknown) => {
            if (!value || typeof value !== 'object') return false;
            const pack = value as Partial<PackMeta>;
            return (
                typeof pack.id === 'string' &&
                typeof pack.productId === 'string' &&
                typeof pack.cdnUrl === 'string' &&
                Number.isSafeInteger(pack.version) &&
                (pack.version ?? 0) > 0 &&
                typeof pack.sizeMB === 'number' &&
                Number.isFinite(pack.sizeMB) &&
                pack.sizeMB > 0 &&
                typeof pack.bounds === 'object' &&
                pack.bounds !== null &&
                Number.isFinite(pack.bounds.minLat) &&
                Number.isFinite(pack.bounds.maxLat) &&
                Number.isFinite(pack.bounds.minLon) &&
                Number.isFinite(pack.bounds.maxLon) &&
                typeof pack.lodRange === 'object' &&
                pack.lodRange !== null &&
                Number.isFinite(pack.lodRange.min) &&
                Number.isFinite(pack.lodRange.max)
            );
        })
    );
}

function isNotOlderThan(
    candidate: PackCatalog,
    reference: PackCatalog
): boolean {
    if (candidate.version < reference.version) return false;
    const candidateById = new Map(
        candidate.packs.map((pack) => [pack.id, pack])
    );
    return reference.packs.every((referencePack) => {
        const candidatePack = candidateById.get(referencePack.id);
        return !candidatePack || candidatePack.version >= referencePack.version;
    });
}

function getOfflineCatalog(): PackCatalog {
    const cached = getCachedCatalog();
    const catalog =
        cached && isNotOlderThan(cached, EMBEDDED_CATALOG)
            ? cached
            : EMBEDDED_CATALOG;

    // Replace a legacy v3 cache with the embedded v5/v6 catalog. This makes
    // the migration durable even if the next launch is offline.
    try {
        localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog));
    } catch {
        // The in-memory fallback remains usable if storage is unavailable.
    }
    return catalog;
}

async function _doFetchCatalog(): Promise<PackCatalog> {
    // An embedded diagnostic sample must not be hidden by an older production
    // catalog persisted by a previous app installation.
    if (DIAGNOSTIC_PACK_URL) {
        _catalog = EMBEDDED_CATALOG;
        return _catalog;
    }
    if (CATALOG_URL) {
        try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 3000);
            let resp: Response;
            try {
                resp = await fetch(CATALOG_URL, {
                    cache: 'no-cache',
                    signal: ctrl.signal,
                });
            } finally {
                clearTimeout(tid);
            }
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = (await resp.json()) as PackCatalog;
            if (isPackCatalog(data) && isNotOlderThan(data, EMBEDDED_CATALOG)) {
                _catalog = data;
                localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(data));
                return data;
            }
            throw new Error('Invalid or older catalog');
        } catch {
            console.warn(
                '[Packs] Catalog réseau indisponible, fallback cache/embarqué.'
            );
        }
    }
    _catalog = getOfflineCatalog();
    return _catalog;
}

export async function fetchCatalog(): Promise<PackCatalog> {
    if (_catalogFetchPromise) return _catalogFetchPromise;
    _catalogFetchPromise = _doFetchCatalog().finally(() => {
        _catalogFetchPromise = null;
    });
    return _catalogFetchPromise;
}

/**
 * Trouve le premier pack du catalogue couvrant la position (lat, lon).
 * Vérifie d'abord la bbox, puis raffine avec le polygone pays si regionCheck
 * est un code ISO valide (2 lettres).
 */
export function findPackContaining(
    lat: number,
    lon: number,
    isPointInCountryFn: (lat: number, lon: number, code: string) => boolean
): PackMeta | null {
    const packs = getAvailablePacks();
    for (const pack of packs) {
        if (
            lat < pack.bounds.minLat ||
            lat > pack.bounds.maxLat ||
            lon < pack.bounds.minLon ||
            lon > pack.bounds.maxLon
        )
            continue;
        if (
            pack.regionCheck &&
            pack.regionCheck.length === 2 &&
            isPointInCountryFn(lat, lon, pack.regionCheck)
        )
            return pack;
        if (!pack.regionCheck || pack.regionCheck.length !== 2) return pack;
    }
    return null;
}

/**
 * Vérifie les versions des packs installés et marque 'update_available'
 * si une version plus récente existe dans le catalogue.
 */
export function checkForUpdates(
    packStates: Map<string, { status: string; installedVersion: number }>
): string[] {
    const updated: string[] = [];
    if (!_catalog || !Array.isArray(_catalog.packs)) return updated;
    for (const meta of _catalog.packs) {
        const ps = packStates.get(meta.id);
        if (
            ps &&
            ps.status === 'installed' &&
            ps.installedVersion < meta.version
        ) {
            ps.status = 'update_available';
            updated.push(meta.id);
        }
    }
    return updated;
}

/** Réinitialise l'état interne du catalogue (utile pour les tests). */
export function resetCatalogState(): void {
    _catalog = null;
    _catalogFetchPromise = null;
}
