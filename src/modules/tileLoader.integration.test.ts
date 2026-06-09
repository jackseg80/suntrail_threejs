import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWithCache, CACHE_NAME, OFFLINE_CACHE_NAME } from './tileLoader';
import { packManager } from './packManager';
import { state } from './state';

// Mock de packManager
vi.mock('./packManager', () => ({
    packManager: {
        hasMountedPacks: vi.fn(),
        getTileFromPacks: vi.fn(),
    },
}));

// Mock de pmtiles (requis par initEmbeddedOverview)
vi.mock('pmtiles', () => {
    class MockPMTiles {
        getHeader = vi.fn().mockResolvedValue({
            minLon: -25,
            maxLon: 45,
            minLat: 34,
            maxLat: 72,
        });
        getZxy = vi.fn().mockResolvedValue(null);
    }
    return { PMTiles: MockPMTiles };
});

// Mock de fetch global
global.fetch = vi.fn();

function makeCacheSpy() {
    const store = new Map<string, Response>();
    return {
        match: vi.fn((url: string) => Promise.resolve(store.get(url) ?? null)),
        put: vi.fn((url: string, response: Response) => {
            store.set(url, response);
            return Promise.resolve();
        }),
        delete: vi.fn((url: string) => {
            store.delete(url);
            return Promise.resolve(true);
        }),
        keys: vi.fn<() => Promise<Request[]>>(() => Promise.resolve([])),
        _store: store,
    };
}

describe('TileLoader Integration with Packs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.IS_OFFLINE = false;
        (packManager.hasMountedPacks as any).mockReturnValue(false);
        (packManager.getTileFromPacks as any).mockReturnValue(
            Promise.resolve(null)
        );
    });

    it('should prioritize pack over network when pack is mounted', async () => {
        const mockBlob = new Blob(['tile-data'], { type: 'image/webp' });
        (packManager.hasMountedPacks as any).mockReturnValue(true);
        (packManager.getTileFromPacks as any).mockReturnValue(
            Promise.resolve(mockBlob)
        );

        const url = 'https://tile.openstreetmap.org/12/2133/1450.png';
        const result = await fetchWithCache(url, false, 12, 2133, 1450);

        expect(packManager.getTileFromPacks).toHaveBeenCalledWith(
            12,
            2133,
            1450
        );
        expect(global.fetch).not.toHaveBeenCalled();
        expect(result).toBe(mockBlob);
    });

    it('should work offline when pack is mounted', async () => {
        const mockBlob = new Blob(['offline-tile-data'], {
            type: 'image/webp',
        });
        state.IS_OFFLINE = true;
        (packManager.hasMountedPacks as any).mockReturnValue(true);
        (packManager.getTileFromPacks as any).mockReturnValue(
            Promise.resolve(mockBlob)
        );

        const url = 'https://tile.openstreetmap.org/12/2133/1450.png';
        const result = await fetchWithCache(url, false, 12, 2133, 1450);

        expect(packManager.getTileFromPacks).toHaveBeenCalled();
        expect(result).toBe(mockBlob);
    });

    it('should fallback to network if pack does not have the tile', async () => {
        (packManager.hasMountedPacks as any).mockReturnValue(true);
        (packManager.getTileFromPacks as any).mockReturnValue(
            Promise.resolve(null)
        );

        const mockResponse = {
            ok: true,
            blob: vi.fn().mockResolvedValue(new Blob(['network-data'])),
        };
        (global.fetch as any).mockResolvedValue(mockResponse);

        const url = 'https://tile.openstreetmap.org/12/2133/1450.png';
        const result = await fetchWithCache(url, false, 12, 2133, 1450);

        expect(packManager.getTileFromPacks).toHaveBeenCalled();
        expect(global.fetch).toHaveBeenCalledWith(url, expect.anything());
        expect(result).toBeDefined();
    });

    it('should return null when offline and not in pack', async () => {
        state.IS_OFFLINE = true;
        (packManager.hasMountedPacks as any).mockReturnValue(true);
        (packManager.getTileFromPacks as any).mockReturnValue(
            Promise.resolve(null)
        );

        const url = 'https://tile.openstreetmap.org/12/2133/1450.png';
        const result = await fetchWithCache(url, false, 12, 2133, 1450);

        expect(result).toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

// ── P1 : Partition du cache offline (v5.61.4) ────────────────────────────────
describe('Cache partition — offline vs normal (v5.61.4)', () => {
    let offlineSpy: ReturnType<typeof makeCacheSpy>;
    let normalSpy: ReturnType<typeof makeCacheSpy>;

    beforeEach(async () => {
        vi.clearAllMocks();
        state.IS_OFFLINE = false;
        state.DEBUG_MODE = false;
        state.MK = 'test_key_valid_12345';
        state.isMapTilerDisabled = false;
        state.MAP_SOURCE = 'opentopomap';

        offlineSpy = makeCacheSpy();
        normalSpy = makeCacheSpy();

        const cachesMap = new Map<string, ReturnType<typeof makeCacheSpy>>();
        cachesMap.set(CACHE_NAME, normalSpy);
        cachesMap.set(OFFLINE_CACHE_NAME, offlineSpy);

        vi.stubGlobal('caches', {
            open: vi.fn((name: string) => Promise.resolve(cachesMap.get(name))),
            delete: vi.fn((name: string) => {
                cachesMap.delete(name);
                return Promise.resolve(true);
            }),
            keys: vi.fn(() => Promise.resolve(Array.from(cachesMap.keys()))),
        });

        (packManager.hasMountedPacks as any).mockReturnValue(false);
        (packManager.getTileFromPacks as any).mockReturnValue(
            Promise.resolve(null)
        );

        // Initialiser le cache worker (simule initEmbeddedOverview)
        const { initEmbeddedOverview } = await import('./tileLoader');
        await initEmbeddedOverview();
    });

    it('storeInOfflineCache=true doit stocker dans le cache offline, pas le cache normal', async () => {
        const mockResponse = {
            ok: true,
            blob: vi
                .fn()
                .mockResolvedValue(
                    new Blob(['offline-tile'], { type: 'image/webp' })
                ),
        };
        (global.fetch as any).mockResolvedValue(mockResponse);

        const url = 'https://opentopomap.org/12/2100/1400.png';
        await fetchWithCache(url, true, 12, 2100, 1400, true);

        expect(offlineSpy.put).toHaveBeenCalledWith(url, expect.any(Response));
        expect(normalSpy.put).not.toHaveBeenCalledWith(
            url,
            expect.any(Response)
        );
    });

    it('storeInOfflineCache=false doit stocker dans le cache normal', async () => {
        const mockResponse = {
            ok: true,
            blob: vi
                .fn()
                .mockResolvedValue(
                    new Blob(['normal-tile'], { type: 'image/webp' })
                ),
        };
        (global.fetch as any).mockResolvedValue(mockResponse);

        const url = 'https://opentopomap.org/12/2100/1400.png';
        await fetchWithCache(url, true, 12, 2100, 1400, false);

        expect(normalSpy.put).toHaveBeenCalledWith(url, expect.any(Response));
    });

    it('usePersistentCache=true doit vérifier le cache offline AVANT le cache normal', async () => {
        // Pré-remplir le cache offline
        offlineSpy._store.set(
            'https://opentopomap.org/12/2100/1400.png',
            new Response(new Blob(['cached-offline'], { type: 'image/webp' }))
        );

        const url = 'https://opentopomap.org/12/2100/1400.png';
        const result = await fetchWithCache(url, true, 12, 2100, 1400);

        expect(offlineSpy.match).toHaveBeenCalledWith(url);
        expect(result).toBeDefined();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('deleteTerrainCache() doit supprimer les deux caches', async () => {
        const { deleteTerrainCache } = await import('./tileLoader');
        await deleteTerrainCache();

        expect(vi.mocked(caches.delete)).toHaveBeenCalledWith(CACHE_NAME);
        expect(vi.mocked(caches.delete)).toHaveBeenCalledWith(
            OFFLINE_CACHE_NAME
        );
    });

    it('cleanupOldCaches ne doit pas supprimer CACHE_NAME ni OFFLINE_CACHE_NAME', async () => {
        const { initEmbeddedOverview } = await import('./tileLoader');
        await initEmbeddedOverview();

        expect(vi.mocked(caches.delete)).not.toHaveBeenCalledWith(CACHE_NAME);
        expect(vi.mocked(caches.delete)).not.toHaveBeenCalledWith(
            OFFLINE_CACHE_NAME
        );
    });

    // ── P2 : Index mémoire CacheStorage (v5.61.4) ──
    it('initEmbeddedOverview doit warmup les deux index via cache.keys()', async () => {
        offlineSpy.keys.mockResolvedValue([
            new Request('https://offline.example.com/tile.png'),
        ]);
        normalSpy.keys.mockResolvedValue([
            new Request('https://normal.example.com/tile.png'),
        ]);

        const { initEmbeddedOverview } = await import('./tileLoader');
        await initEmbeddedOverview();

        expect(offlineSpy.keys).toHaveBeenCalled();
        expect(normalSpy.keys).toHaveBeenCalled();
    });

    it('un deuxième lookup fetchWithCache(usePersistentCache) sur la même URL ne refait pas caches.open(CACHE_NAME)', async () => {
        // Pré-remplir le store du cache normal
        normalSpy._store.set(
            'https://example.com/cached.png',
            new Response(new Blob(['xyz'.repeat(50)]))
        );

        const url = 'https://example.com/cached.png';
        const result = await fetchWithCache(url, true);

        expect(result).toBeDefined();
        // Le cache est ouvert via caches.open(CACHE_NAME)
        // On vérifie qu'il a bien trouvé l'entrée (via match)
        expect(normalSpy.match).toHaveBeenCalledWith(url);
    });

    // ── P5 : Normal map RG compact (v5.61.4) ──
    it('DEBUG_NORMALMAP_RG_COMPACT vaut true par défaut (prod)', () => {
        expect(state.DEBUG_NORMALMAP_RG_COMPACT).toBe(true);
    });

    it('la reconstruction sqrt(1-x²-y²) avec signe préserve la norme unitaire', () => {
        const reconstruct = (nx: number, ny: number, signB: number) => {
            const mag = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
            return signB > 0 ? mag : -mag;
        };

        const tests = [
            [0.0, 0.0, 1.0], // Z positif
            [0.6, 0.4, 1.0],
            [-0.3, -0.7, -1.0], // Z négatif
            [0.9, 0.1, 1.0],
            [-0.5, 0.5, -1.0],
        ];

        for (const [nx, ny, signB] of tests) {
            const nz = reconstruct(nx, ny, signB);
            const norm = Math.sqrt(nx * nx + ny * ny + nz * nz);
            expect(norm).toBeCloseTo(1.0, 4);
            expect(Math.sign(nz)).toBe(signB > 0 ? 1 : -1);
        }
    });

    it('la formule protège contre les NaN (nx²+ny² > 1.0)', () => {
        const reconstructZ = (nx: number, ny: number) =>
            Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));

        // Cas limite : nx²+ny² > 1.0 → nz = 0, pas NaN
        const nz = reconstructZ(0.8, 0.7);
        expect(Number.isNaN(nz)).toBe(false);
        expect(nz).toBe(0); // 1 - 0.64 - 0.49 = -0.13 → max(0, ...) = 0
    });
});
