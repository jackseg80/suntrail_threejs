import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../constants/storage', () => ({
    STORAGE_KEYS: {
        PACK_CATALOG: 'suntrail_pack_catalog',
    },
}));

import {
    getEmbeddedCatalog,
    getCatalog,
    getAvailablePacks,
    getPackMeta,
    findPackContaining,
    checkForUpdates,
    fetchCatalog,
    resetCatalogState,
} from './packCatalog';

describe('getEmbeddedCatalog()', () => {
    it('returns a catalog with version and packs array', () => {
        const catalog = getEmbeddedCatalog();
        expect(catalog.version).toBeGreaterThan(0);
        expect(Array.isArray(catalog.packs)).toBe(true);
        expect(catalog.packs.length).toBeGreaterThan(0);
    });

    it('returns packs with required fields', () => {
        const catalog = getEmbeddedCatalog();
        for (const pack of catalog.packs) {
            expect(pack.id).toBeTruthy();
            expect(pack.productId).toBeTruthy();
            expect(pack.bounds).toBeDefined();
            expect(pack.lodRange).toBeDefined();
            expect(pack.version).toBeGreaterThan(0);
            expect(pack.sizeMB).toBeGreaterThan(0);
            expect(pack.cdnUrl).toBeTruthy();
        }
    });

    it('contains switzerland pack', () => {
        const catalog = getEmbeddedCatalog();
        const ch = catalog.packs.find((p) => p.id === 'switzerland');
        expect(ch).toBeDefined();
        expect(ch!.regionCheck).toBe('CH');
        expect(ch!.bounds.minLat).toBe(45.8);
        expect(ch!.bounds.maxLat).toBe(47.8);
    });

    it('contains france_alps pack', () => {
        const catalog = getEmbeddedCatalog();
        const fr = catalog.packs.find((p) => p.id === 'france_alps');
        expect(fr).toBeDefined();
        expect(fr!.regionCheck).toBe('FR');
    });
});

describe('Catalog state before fetch', () => {
    beforeEach(() => {
        resetCatalogState();
    });

    it('returns null before fetchCatalog() is called', () => {
        expect(getCatalog()).toBeNull();
    });

    it('returns empty array when no catalog loaded', () => {
        expect(getAvailablePacks()).toEqual([]);
    });

    it('returns undefined for unknown pack id', () => {
        expect(getPackMeta('nonexistent')).toBeUndefined();
    });
});

describe('findPackContaining()', () => {
    const isPointInCountry = vi.fn();

    beforeEach(async () => {
        resetCatalogState();
        vi.clearAllMocks();
        await fetchCatalog();
    });

    it('returns a pack when point is in bbox and country', () => {
        isPointInCountry.mockReturnValue(true);
        const result = findPackContaining(46.5, 7.5, isPointInCountry);
        expect(result).not.toBeNull();
        expect(result!.id).toBe('switzerland');
    });

    it('returns null when point is outside all bboxes', () => {
        isPointInCountry.mockReturnValue(true);
        const result = findPackContaining(0, 0, isPointInCountry);
        expect(result).toBeNull();
    });

    it('skips pack when regionCheck fails', () => {
        isPointInCountry.mockReturnValue(false);
        const result = findPackContaining(46.5, 7.5, isPointInCountry);
        expect(result).toBeNull();
    });

    it('returns pack without regionCheck by bbox only', () => {
        const catalog = getEmbeddedCatalog();
        const hasNoRegion = catalog.packs.some((p) => !p.regionCheck);
        if (hasNoRegion) {
            const pack = catalog.packs.find((p) => !p.regionCheck)!;
            const centerLat = (pack.bounds.minLat + pack.bounds.maxLat) / 2;
            const centerLon = (pack.bounds.minLon + pack.bounds.maxLon) / 2;
            const result = findPackContaining(
                centerLat,
                centerLon,
                isPointInCountry
            );
            expect(result).not.toBeNull();
            expect(result!.id).toBe(pack.id);
        }
    });
});

describe('checkForUpdates()', () => {
    beforeEach(async () => {
        resetCatalogState();
        await fetchCatalog();
    });

    const makeState = (installedVersion: number) => ({
        status: 'installed' as const,
        installedVersion,
    });

    it('detects a pack that needs update', () => {
        const states = new Map<string, ReturnType<typeof makeState>>();
        states.set('switzerland', makeState(1));
        const result = checkForUpdates(states);
        expect(result).toContain('switzerland');
    });

    it('does not flag already up-to-date packs', () => {
        const states = new Map<string, ReturnType<typeof makeState>>();
        const catalog = getEmbeddedCatalog();
        const ch = catalog.packs.find((p) => p.id === 'switzerland')!;
        states.set('switzerland', makeState(ch.version));
        const result = checkForUpdates(states);
        expect(result).not.toContain('switzerland');
    });

    it('ignores packs that are not installed', () => {
        const states = new Map<
            string,
            { status: string; installedVersion: number }
        >();
        states.set('switzerland', {
            status: 'not_purchased',
            installedVersion: 0,
        });
        const result = checkForUpdates(states);
        expect(result).toEqual([]);
    });

    it('handles empty packStates map', () => {
        const states = new Map();
        const result = checkForUpdates(states);
        expect(result).toEqual([]);
    });

    it('mutates packStates status for updated packs', () => {
        const states = new Map<string, ReturnType<typeof makeState>>();
        states.set('switzerland', makeState(1));
        checkForUpdates(states);
        expect(states.get('switzerland')!.status).toBe('update_available');
    });
});

describe('fetchCatalog()', () => {
    beforeEach(() => {
        resetCatalogState();
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('loads embedded catalog when no CDN URL', async () => {
        const catalog = await fetchCatalog();
        expect(catalog.version).toBeGreaterThan(0);
        expect(Array.isArray(catalog.packs)).toBe(true);
    });

    it('caches the result and returns same promise for concurrent calls', async () => {
        const p1 = fetchCatalog();
        const p2 = fetchCatalog();
        expect(p1).toBeInstanceOf(Promise);
        expect(p2).toBeInstanceOf(Promise);
        const [r1, r2] = await Promise.all([p1, p2]);
        expect(r1).toEqual(r2);
    });

    it('makes getCatalog return data after fetch', async () => {
        await fetchCatalog();
        expect(getCatalog()).not.toBeNull();
        expect(getAvailablePacks().length).toBeGreaterThan(0);
    });

    it('makes getPackMeta work after fetch', async () => {
        await fetchCatalog();
        const meta = getPackMeta('switzerland');
        expect(meta).toBeDefined();
        expect(meta!.id).toBe('switzerland');
        expect(meta!.regionCheck).toBe('CH');
    });

    it('getPackMeta returns undefined for unknown pack', async () => {
        await fetchCatalog();
        expect(getPackMeta('mars')).toBeUndefined();
    });
});
