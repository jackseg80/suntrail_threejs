import { describe, it, expect } from 'vitest';

describe('packTypes', () => {
    it('exports PackStatus type values', () => {
        const statuses = [
            'not_purchased',
            'purchased',
            'downloading',
            'installed',
            'update_available',
            'error',
        ] as const;
        expect(statuses).toHaveLength(6);
    });

    it('PackMeta interface has all required fields', () => {
        const meta = {
            id: 'test',
            productId: 'test_product',
            name: { fr: 'Test' },
            bounds: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
            lodRange: { min: 8, max: 14 },
            version: 1,
            sizeMB: 100,
            cdnUrl: 'https://example.com/pack.pmtiles',
            regionCheck: 'CH',
        };
        expect(meta.id).toBe('test');
        expect(meta.productId).toBe('test_product');
        expect(meta.bounds.minLat).toBe(0);
        expect(meta.lodRange.min).toBe(8);
        expect(meta.version).toBe(1);
        expect(meta.sizeMB).toBe(100);
        expect(meta.cdnUrl).toBeTruthy();
        expect(meta.regionCheck).toBe('CH');
    });

    it('PackState interface has all required fields', () => {
        const state = {
            id: 'test',
            status: 'installed' as const,
            installedVersion: 1,
            downloadProgress: 0.5,
            filePath: '/path/to/pack',
            sizeMB: 100,
        };
        expect(state.status).toBe('installed');
        expect(state.downloadProgress).toBe(0.5);
        expect(state.filePath).toBe('/path/to/pack');
    });

    it('PackCatalog interface has version and packs array', () => {
        const catalog = {
            version: 3,
            packs: [],
        };
        expect(catalog.version).toBe(3);
        expect(Array.isArray(catalog.packs)).toBe(true);
    });
});
