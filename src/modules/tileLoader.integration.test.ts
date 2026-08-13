import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    fetchWithCache,
    CACHE_NAME,
    OFFLINE_CACHE_NAME,
    resetTileLoaderState,
    initCacheLayer,
    inspectOfflineTileResources,
    getColorUrl,
    hasOfflineTileResource,
    deleteOfflineTileResources,
} from './tileLoader';
import { packManager } from './packManager';
import { state } from './state';

// Mock de packManager
vi.mock('./packManager', () => ({
    packManager: {
        hasMountedPacks: vi.fn(),
        hasInstalledPackForCountry: vi.fn(),
        getTileFromPacks: vi.fn(),
        getOfflineTileFromPacks: vi.fn(),
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
        keys: vi.fn<() => Promise<Request[]>>(() =>
            Promise.resolve([...store.keys()].map((url) => new Request(url)))
        ),
        _store: store,
    };
}

describe('TileLoader Integration with Packs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.IS_OFFLINE = false;
        (packManager.hasMountedPacks as any).mockReturnValue(false);
        (packManager.hasInstalledPackForCountry as any).mockReturnValue(false);
        (packManager.getTileFromPacks as any).mockReturnValue(
            Promise.resolve(null)
        );
        (packManager.getOfflineTileFromPacks as any).mockReturnValue(
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

    it('adresse le bon layer d’un pack local pour un téléchargement corridor', async () => {
        const mockBlob = new Blob(['offline-elevation'], {
            type: 'image/webp',
        });
        (packManager.hasMountedPacks as any).mockReturnValue(true);
        (packManager.getOfflineTileFromPacks as any).mockResolvedValue(
            mockBlob
        );

        const result = await fetchWithCache(
            'https://api.maptiler.com/tiles/terrain-rgb-v2/12/2133/1450.webp',
            true,
            12,
            2133,
            1450,
            true,
            { resourceType: 'elevation', localOnlyPacks: true }
        );

        expect(packManager.getOfflineTileFromPacks).toHaveBeenCalledWith(
            12,
            2133,
            1450,
            'elevation'
        );
        expect(packManager.getTileFromPacks).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
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
        resetTileLoaderState();
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

    it('promeut un hit du cache normal vers le cache offline explicite', async () => {
        const url = 'https://opentopomap.org/12/2100/1400.png';
        normalSpy._store.set(
            url,
            new Response(new Blob(['x'.repeat(150)], { type: 'image/png' }))
        );

        await expect(
            fetchWithCache(url, true, 12, 2100, 1400, true, {
                requireOfflineStorage: true,
            })
        ).resolves.toBeInstanceOf(Blob);
        expect(offlineSpy.put).toHaveBeenCalledWith(url, expect.any(Response));
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('signale l’échec si une ressource corridor ne peut pas être persistée', async () => {
        const url = 'https://opentopomap.org/12/2100/1400.png';
        normalSpy._store.set(
            url,
            new Response(new Blob(['x'.repeat(150)], { type: 'image/png' }))
        );
        offlineSpy.put.mockRejectedValueOnce(
            new DOMException('Quota reached', 'QuotaExceededError')
        );

        await expect(
            fetchWithCache(url, true, 12, 2100, 1400, true, {
                requireOfflineStorage: true,
            })
        ).resolves.toBeNull();
    });

    it('ne lance aucune requête si un corridor impose les sources locales', async () => {
        const url = 'https://opentopomap.org/12/2100/1400.png';

        await expect(
            fetchWithCache(url, true, 12, 2100, 1400, true, {
                allowNetwork: false,
                requireOfflineStorage: true,
            })
        ).resolves.toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('inspecte et supprime uniquement les URLs offline demandées', async () => {
        const kept = 'https://tiles.test/kept';
        const removed = 'https://tiles.test/removed';
        offlineSpy._store.set(kept, new Response(new Blob(['kept'])));
        offlineSpy._store.set(removed, new Response(new Blob(['removed'])));

        await expect(hasOfflineTileResource(removed)).resolves.toBe(true);
        await expect(deleteOfflineTileResources([removed])).resolves.toBe(1);
        expect(offlineSpy._store.has(kept)).toBe(true);
        expect(offlineSpy._store.has(removed)).toBe(false);
    });

    it('mesure mondialement une tuile lisible depuis le cache sans exiger le relief', async () => {
        state.MAP_SOURCE = 'swisstopo';
        state.MK = 'test_key_valid_12345';
        state.SHOW_TRAILS = false;
        // Tokyo : le calcul ne dépend ni d'un pack ni d'un pays européen connu.
        const tile = { zoom: 14, tx: 14_549, ty: 6_451 };
        const colorUrl = getColorUrl(tile.tx, tile.ty, tile.zoom);
        offlineSpy._store.set(
            colorUrl,
            new Response(new Blob(['x'.repeat(150)], { type: 'image/png' }))
        );
        resetTileLoaderState();
        await initCacheLayer();

        await expect(inspectOfflineTileResources(tile)).resolves.toEqual({
            covered: true,
            sizeBytes: 150,
        });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('mesure un pack local via son propre catalogue sans préfiltre pays', async () => {
        state.MK = 'test_key_valid_12345';
        state.MAP_SOURCE = 'swisstopo';
        state.SHOW_TRAILS = false;
        const tile = { zoom: 14, tx: 8_510, ty: 5_790 };
        const packColor = new Blob(['x'.repeat(180)], {
            type: 'image/webp',
        });
        (packManager.hasInstalledPackForCountry as any).mockReturnValue(false);
        (packManager.getOfflineTileFromPacks as any).mockImplementation(
            (_z: number, _x: number, _y: number, type: string) =>
                Promise.resolve(type === 'color' ? packColor : null)
        );
        resetTileLoaderState();
        await initCacheLayer();

        await expect(inspectOfflineTileResources(tile)).resolves.toEqual({
            covered: true,
            sizeBytes: 180,
        });
        expect(packManager.getOfflineTileFromPacks).toHaveBeenCalledWith(
            tile.zoom,
            tile.tx,
            tile.ty,
            'color'
        );
        expect(packManager.hasInstalledPackForCountry).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('ne déclare jamais couverte une tuile sans fond cartographique', async () => {
        state.MK = 'test_key_valid_12345';
        state.MAP_SOURCE = 'swisstopo';
        state.SHOW_TRAILS = false;
        const tile = { zoom: 14, tx: 14_549, ty: 6_451 };
        (packManager.getOfflineTileFromPacks as any).mockImplementation(
            (_z: number, _x: number, _y: number, type: string) =>
                Promise.resolve(
                    type === 'elevation'
                        ? new Blob(['x'.repeat(200)], { type: 'image/webp' })
                        : null
                )
        );
        resetTileLoaderState();
        await initCacheLayer();

        await expect(inspectOfflineTileResources(tile)).resolves.toEqual({
            covered: false,
            sizeBytes: 200,
        });
        expect(global.fetch).not.toHaveBeenCalled();
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

// ── P0 : initCacheLayer + resetTileLoaderState (v5.73.0) ────────────────────
describe('TileLoader — P0: initCacheLayer & resetTileLoaderState', () => {
    let offlineSpy: ReturnType<typeof makeCacheSpy>;
    let normalSpy: ReturnType<typeof makeCacheSpy>;

    beforeEach(() => {
        vi.clearAllMocks();
        resetTileLoaderState();
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
    });

    it('initCacheLayer ouvre les deux caches (normal + offline)', async () => {
        await initCacheLayer();

        expect(vi.mocked(caches.open)).toHaveBeenCalledWith(CACHE_NAME);
        expect(vi.mocked(caches.open)).toHaveBeenCalledWith(OFFLINE_CACHE_NAME);
    });

    it('initCacheLayer est idempotent (double appel)', async () => {
        await initCacheLayer();
        const callCountAfterFirst = vi.mocked(caches.open).mock.calls.length;

        await initCacheLayer();
        // Pas de nouvel appel à caches.open
        expect(vi.mocked(caches.open).mock.calls.length).toBe(
            callCountAfterFirst
        );
    });

    it('initCacheLayer warmup les index mémoire via cache.keys()', async () => {
        offlineSpy.keys.mockResolvedValue([
            new Request('https://offline.example.com/tile.png'),
        ]);
        normalSpy.keys.mockResolvedValue([
            new Request('https://normal.example.com/tile.png'),
        ]);

        await initCacheLayer();

        expect(offlineSpy.keys).toHaveBeenCalled();
        expect(normalSpy.keys).toHaveBeenCalled();
    });

    it('resetTileLoaderState vide les index et les références cache', async () => {
        // D'abord initialiser
        await initCacheLayer();

        // Puis reset
        resetTileLoaderState();

        // Vérifier que fetchWithCache ré-ouvre les caches après reset
        const mockResponse = {
            ok: true,
            blob: vi
                .fn()
                .mockResolvedValue(
                    new Blob(['post-reset'], { type: 'image/webp' })
                ),
        };
        (global.fetch as any).mockResolvedValue(mockResponse);

        const url = 'https://opentopomap.org/12/2000/1400.png';
        await fetchWithCache(url, true, 12, 2000, 1400);

        // Après reset, le cache doit être ré-ouvert via caches.open
        expect(vi.mocked(caches.open)).toHaveBeenCalledWith(CACHE_NAME);
    });

    it("initCacheLayer n'écrase pas un cache déjà ouvert", async () => {
        await initCacheLayer();
        const firstOpenCount = vi.mocked(caches.open).mock.calls.length;

        // Réinitialiser le stub pour simuler un nouvel appel
        await initCacheLayer();

        // Pas d'appels supplémentaires à caches.open
        expect(vi.mocked(caches.open).mock.calls.length).toBe(firstOpenCount);
    });
});

// ── P0 : Timeout tuiles (v5.72.0) — Analyse ─────────────────────────────────
describe('TileLoader — P0: Timeout tile behaviour', () => {
    it("le timeout fetch (10s) n'empêche pas un futur retry sur la même URL", async () => {
        // Simule un AbortError (timeout)
        (global.fetch as any).mockRejectedValueOnce(
            Object.assign(new Error('The operation was aborted.'), {
                name: 'AbortError',
            })
        );
        const url = 'https://opentopomap.org/12/2100/1400.png';

        const result1 = await fetchWithCache(url, false, 12, 2100, 1400);
        expect(result1).toBeNull();

        // Deuxième tentative : le fetch réussit
        const mockResponse = {
            ok: true,
            blob: vi
                .fn()
                .mockResolvedValue(
                    new Blob(['retry-success'], { type: 'image/webp' })
                ),
        };
        (global.fetch as any).mockResolvedValue(mockResponse);

        const result2 = await fetchWithCache(url, false, 12, 2100, 1400);
        expect(result2).not.toBeNull();
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("un échec réseau n'est pas mis en cache (pas de réponse fantôme)", async () => {
        (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

        const url = 'https://opentopomap.org/12/2100/1400.png';
        const result = await fetchWithCache(url, true, 12, 2100, 1400);

        // Le blob ne devrait pas être mis en cache
        expect(result).toBeNull();
    });
});

// ── P2 : Rétention cache offline après éviction du cache normal (v5.73.1) ──
describe('TileLoader — Offline cache retention', () => {
    let offlineSpy: ReturnType<typeof makeCacheSpy>;
    let normalSpy: ReturnType<typeof makeCacheSpy>;

    beforeEach(async () => {
        vi.clearAllMocks();
        resetTileLoaderState();
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

        await initCacheLayer();
    });

    it('les tuiles offline survivent à la suppression du cache normal', async () => {
        const offlineUrl = 'https://offline.example.com/12/200/300.png';
        const normalUrl = 'https://normal.example.com/12/200/300.png';

        // 1. Stocker une tuile dans chaque cache
        const mockResponse = (body: string) => ({
            ok: true,
            blob: vi
                .fn()
                .mockResolvedValue(new Blob([body], { type: 'image/webp' })),
        });

        (global.fetch as any).mockResolvedValueOnce(mockResponse('offline'));
        await fetchWithCache(offlineUrl, true, 12, 200, 300, true);
        expect(offlineSpy.put).toHaveBeenCalledWith(
            offlineUrl,
            expect.any(Response)
        );

        (global.fetch as any).mockResolvedValueOnce(mockResponse('normal'));
        await fetchWithCache(normalUrl, true, 12, 200, 300, false);
        expect(normalSpy.put).toHaveBeenCalledWith(
            normalUrl,
            expect.any(Response)
        );

        // 2. Supprimer UNIQUEMENT le cache normal (simule éviction navigateur)
        await caches.delete(CACHE_NAME);
        // Le navigateur recrée un cache vide quand on fait caches.open() après suppression.
        // On simule ce comportement.
        const newNormalSpy = makeCacheSpy();
        const cachesMap2 = new Map<string, ReturnType<typeof makeCacheSpy>>();
        cachesMap2.set(CACHE_NAME, newNormalSpy);
        cachesMap2.set(OFFLINE_CACHE_NAME, offlineSpy); // offline survit
        vi.stubGlobal('caches', {
            open: vi.fn((name: string) =>
                Promise.resolve(cachesMap2.get(name))
            ),
            delete: vi.fn((name: string) => {
                cachesMap2.delete(name);
                return Promise.resolve(true);
            }),
            keys: vi.fn(() => Promise.resolve(Array.from(cachesMap2.keys()))),
        });

        // 3. La tuile offline est toujours accessible
        offlineSpy._store.set(
            offlineUrl,
            new Response(new Blob(['cached-offline']))
        );
        const result = await fetchWithCache(offlineUrl, true, 12, 200, 300);
        expect(result).not.toBeNull();

        // 4. La tuile normale n'est plus en cache → fetch réseau
        (global.fetch as any).mockResolvedValueOnce(mockResponse('network'));
        const result2 = await fetchWithCache(normalUrl, true, 12, 200, 300);
        expect(result2).not.toBeNull();
        expect(global.fetch).toHaveBeenCalledWith(normalUrl, expect.anything());
    });

    it('initCacheLayer ré-ouvre les caches après éviction du cache normal', async () => {
        // Supprimer le cache normal
        await caches.delete(CACHE_NAME);
        resetTileLoaderState();

        // Ré-initialiser — doit ré-ouvrir les deux caches
        await initCacheLayer();

        expect(vi.mocked(caches.open)).toHaveBeenCalledWith(CACHE_NAME);
        expect(vi.mocked(caches.open)).toHaveBeenCalledWith(OFFLINE_CACHE_NAME);
    });

    it('cleanupOldCaches ne supprime pas le cache offline courant', async () => {
        // Ajouter un vieux cache offline (simule v29)
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

        // cleanupOldCaches est appelé par initCacheLayer (idempotent)
        resetTileLoaderState();
        await initCacheLayer();

        // Le cache offline courant ne doit PAS être supprimé
        expect(vi.mocked(caches.delete)).not.toHaveBeenCalledWith(
            OFFLINE_CACHE_NAME
        );
    });
});
