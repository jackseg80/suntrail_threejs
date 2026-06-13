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
    | string
    | undefined;
const CATALOG_CACHE_KEY = STORAGE_KEYS.PACK_CATALOG;

const EMBEDDED_CATALOG: PackCatalog = {
    version: 3,
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
            version: 3,
            sizeMB: 664,
            cdnUrl: `${CDN_BASE_URL}/packs/suntrail-pack-switzerland-v3.pmtiles`,
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
            bounds: { minLat: 43.5, maxLat: 46.4, minLon: 4.7, maxLon: 8.2 },
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
            version: 2,
            sizeMB: 985,
            cdnUrl: `${CDN_BASE_URL}/packs/suntrail-pack-austria-v1.pmtiles`,
            regionCheck: 'AT',
        },
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
        return raw ? (JSON.parse(raw) as PackCatalog) : null;
    } catch {
        return null;
    }
}

async function _doFetchCatalog(): Promise<PackCatalog> {
    if (CATALOG_URL) {
        try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 3000);
            const resp = await fetch(CATALOG_URL, {
                cache: 'no-cache',
                signal: ctrl.signal,
            });
            clearTimeout(tid);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = (await resp.json()) as PackCatalog;
            if (data && Array.isArray(data.packs)) {
                _catalog = data;
                localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(data));
                return data;
            }
            throw new Error('Invalid catalog format');
        } catch {
            console.warn(
                '[Packs] Catalog réseau indisponible, fallback cache/embarqué.'
            );
        }
    }
    _catalog = getCachedCatalog() ?? EMBEDDED_CATALOG;
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
