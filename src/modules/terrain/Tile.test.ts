import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockState, mockActiveTiles } = vi.hoisted(() => {
    const state: Record<string, any> = {
        RELIEF_EXAGGERATION: 1.0,
        SHOW_SLOPES: false,
        SHOW_HYDROLOGY: false,
        DEBUG_NORMALMAP_RG_COMPACT: false,
        originTile: { x: 0, y: 0, z: 0 },
        HYBRID_MODE: false,
        HYBRID_SHOW_MID_ZOOM_NAMES: false,
        IS_2D_MODE: false,
        RESOLUTION: 64,
        camera: null,
    };
    const activeTiles = new Set<string>();
    return { mockState: state, mockActiveTiles: activeTiles };
});

vi.mock('../state', () => ({ state: mockState }));
vi.mock('../terrain', () => ({ activeTiles: mockActiveTiles }));
vi.mock('../memory', () => ({ disposeObject: vi.fn() }));
vi.mock('../geo', () => ({
    EARTH_CIRCUMFERENCE: 40075016.686,
    getTileBounds: vi.fn((tile: any) => ({
        north: tile.ty === 0 ? 85.05 : 0,
        south: tile.ty === 0 ? 66.51 : -85.05,
        east: 180,
        west: -180,
    })),
    getPow2: vi.fn((z: number) => Math.pow(2, z)),
    lonToXNorm: vi.fn((lon: number) => (lon + 180) / 360),
    latToYNorm: vi.fn((lat: number) => (90 - lat) / 180),
}));
vi.mock('../tileCache', () => ({
    getFromCache: vi.fn(() => null),
    addToCache: vi.fn(),
    getTileCacheKey: vi.fn(
        (key: string, zoom: number, dataMode2D = false) =>
            `${zoom}/${dataMode2D ? '2d' : '3d'}/${key}`
    ),
    markCacheKeyActive: vi.fn(),
    markCacheKeyInactive: vi.fn(),
    hasInCache: vi.fn(() => false),
    retainCachedTileData: vi.fn(),
    releaseCachedTileData: vi.fn(),
    restoreCachedPixelData: vi.fn(() => null),
}));
vi.mock('../tileLoader', () => ({
    loadTileData: vi.fn().mockResolvedValue({}),
    cancelTileLoad: vi.fn(),
}));
vi.mock('../geometryCache', () => ({ getPlaneGeometry: vi.fn() }));
vi.mock('../materialPool', () => ({
    materialPool: { getMaterial: vi.fn(), getOverlayMaterial: vi.fn() },
}));
vi.mock('./tileQueue', () => ({
    removeFromLoadQueue: vi.fn(),
    queueBuildMesh: vi.fn(),
}));
vi.mock('../vegetation', () => ({ createForestForTile: vi.fn() }));
vi.mock('../poi', () => ({ loadPOIsForTile: vi.fn() }));
vi.mock('../buildings', () => ({ loadBuildingsForTile: vi.fn() }));
vi.mock('../hydrology', () => ({ loadHydrologyForTile: vi.fn() }));

import { Tile } from './Tile';
import { loadTileData } from '../tileLoader';
import { queueBuildMesh, removeFromLoadQueue } from './tileQueue';
import {
    addToCache,
    getFromCache,
    markCacheKeyActive,
    markCacheKeyInactive,
    restoreCachedPixelData,
} from '../tileCache';

describe('Tile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockActiveTiles.clear();
        mockState.IS_2D_MODE = false;
        mockState.RESOLUTION = 64;
        mockState.SHOW_VEGETATION = false;
        mockState.SHOW_BUILDINGS = false;
        window.history.replaceState({}, '', '/');
    });

    describe('constructor', () => {
        it('sets tile coordinates and key', () => {
            const tile = new Tile(123, 456, 14, '14/123/456');
            expect(tile.tx).toBe(123);
            expect(tile.ty).toBe(456);
            expect(tile.zoom).toBe(14);
            expect(tile.key).toBe('14/123/456');
        });

        it('starts with idle status', () => {
            const tile = new Tile(0, 0, 14, '14/0/0');
            expect(tile.status).toBe('idle');
        });

        it('initializes retryCount to 0', () => {
            const tile = new Tile(0, 0, 14, '14/0/0');
            expect(tile.retryCount).toBe(0);
        });

        it('has null mesh initially', () => {
            const tile = new Tile(0, 0, 14, '14/0/0');
            expect(tile.mesh).toBeNull();
        });

        it('has null textures initially', () => {
            const tile = new Tile(0, 0, 14, '14/0/0');
            expect(tile.elevationTex).toBeNull();
            expect(tile.colorTex).toBeNull();
            expect(tile.normalTex).toBeNull();
        });

        it('has null group references initially', () => {
            const tile = new Tile(0, 0, 14, '14/0/0');
            expect(tile.poiGroup).toBeNull();
            expect(tile.buildingGroup).toBeNull();
            expect(tile.forestMesh).toBeNull();
        });

        it('computes world position on construction', () => {
            const tile = new Tile(0, 0, 14, '14/0/0');
            expect(tile.worldX).toBeDefined();
            expect(tile.worldZ).toBeDefined();
        });

        it('captures a separate color-only cache key in 2D', () => {
            mockState.IS_2D_MODE = true;

            const tile = new Tile(123, 456, 14, '14/123/456');

            expect(tile.dataMode2D).toBe(true);
            expect(tile.cacheKey).toBe('14/2d/14/123/456');

            mockState.IS_2D_MODE = false;
            tile.dispose();
            expect(markCacheKeyInactive).toHaveBeenCalledWith(tile.cacheKey);
        });

        it('keeps high-zoom 3D on the full terrain data path', () => {
            mockState.IS_2D_MODE = false;

            const tile = new Tile(123, 456, 14, '14/123/456');

            expect(tile.dataMode2D).toBe(false);
            expect(tile.cacheKey).toBe('14/3d/14/123/456');
        });
    });

    describe('isVisible()', () => {
        it('returns true when camera is null (always visible)', () => {
            const tile = new Tile(0, 0, 14, '14/0/0');
            expect(tile.isVisible()).toBe(true);
        });
    });

    describe('cache-only prefetch', () => {
        it('requests only color data at high zoom in 2D', async () => {
            mockState.IS_2D_MODE = true;
            vi.mocked(loadTileData).mockResolvedValueOnce({
                taskId: 7,
                promise: Promise.resolve({
                    elevBitmap: null,
                    colorBitmap: null,
                    overlayBitmap: null,
                    normalBitmap: null,
                    pixelData: null,
                }),
            } as any);
            const tile = new Tile(0, 0, 14, 'source_0_0_14');

            await tile.load();

            expect(loadTileData).toHaveBeenCalledWith(
                0,
                0,
                14,
                true,
                tile.diagnosticTraceId,
                false
            );
        });

        it('reuses the color-only texture when promoting a tile to 3D', async () => {
            const sharedColor = {} as any;
            vi.mocked(getFromCache)
                .mockReturnValueOnce(null)
                .mockReturnValueOnce({
                    elev: {} as any,
                    color: sharedColor,
                    pixelData: null,
                    overlay: null,
                    normal: null,
                });
            vi.mocked(loadTileData).mockResolvedValueOnce({
                taskId: 8,
                promise: Promise.resolve({
                    elevBitmap: null,
                    colorBitmap: null,
                    overlayBitmap: null,
                    normalBitmap: null,
                    pixelData: null,
                }),
            } as any);
            const tile = new Tile(0, 0, 14, 'source_0_0_14');

            await tile.load();

            expect(loadTileData).toHaveBeenCalledWith(
                0,
                0,
                14,
                false,
                tile.diagnosticTraceId,
                true
            );
            expect(tile.colorTex).toBe(sharedColor);
            expect(tile.usesFallbackColor).toBe(false);
            expect(addToCache).toHaveBeenCalledWith(
                tile.cacheKey,
                tile.elevationTex,
                null,
                sharedColor,
                null,
                null
            );
        });

        it('restores cached 3D elevation pixels before rebuilding, without reloading textures', async () => {
            mockState.SHOW_VEGETATION = true;
            const pixels = new Uint8ClampedArray([1, 2, 3, 255]);
            const cached = {
                elev: {} as any,
                color: {} as any,
                pixelData: null,
                overlay: null,
                normal: null,
            };
            vi.mocked(getFromCache).mockReturnValueOnce(cached);
            vi.mocked(restoreCachedPixelData).mockReturnValueOnce(pixels);
            const tile = new Tile(0, 0, 15, 'source_0_0_15');
            const build = vi
                .spyOn(tile, 'buildMesh')
                .mockImplementation(() => {});
            await tile.load();
            expect(loadTileData).not.toHaveBeenCalled();
            expect(tile.pixelData).toBe(pixels);
            expect(tile.colorTex).toBe(cached.color);
            expect(tile.elevationTex).toBe(cached.elev);
            expect(build).toHaveBeenCalledOnce();
        });

        it('does not restore CPU elevation for a cache-only prefetch', async () => {
            mockState.SHOW_VEGETATION = true;
            vi.mocked(getFromCache).mockReturnValueOnce({
                elev: {} as any,
                color: {} as any,
                pixelData: null,
                overlay: null,
                normal: null,
            });
            const tile = new Tile(0, 0, 15, 'source_0_0_15', true);
            await tile.load();
            expect(restoreCachedPixelData).not.toHaveBeenCalled();
            expect(loadTileData).not.toHaveBeenCalled();
            expect(tile.status).toBe('loaded');
        });

        it('does not resurrect a tile disposed while waiting to restore cached pixels', async () => {
            mockState.SHOW_VEGETATION = true;
            vi.mocked(getFromCache).mockReturnValueOnce({
                elev: {} as any,
                color: {} as any,
                pixelData: null,
                overlay: null,
                normal: null,
            });
            const tile = new Tile(0, 0, 15, 'source_0_0_15');
            const pending = tile.load();
            tile.dispose();
            await pending;
            expect(tile.status).toBe('disposed');
            expect(restoreCachedPixelData).not.toHaveBeenCalled();
            expect(loadTileData).not.toHaveBeenCalled();
            expect(tile.elevationTex).toBeNull();
        });

        it.each([true, false])(
            'restores missing object pixels only in 3D (2D=%s)',
            async (mode2D) => {
                mockState.IS_2D_MODE = mode2D;
                mockState.SHOW_VEGETATION = true;
                mockState.SHOW_BUILDINGS = true;
                const cached = {
                    elev: {} as any,
                    color: {} as any,
                    pixelData: null,
                    overlay: null,
                    normal: null,
                };
                vi.mocked(getFromCache).mockReturnValueOnce(cached);
                const tile = new Tile(0, 0, 15, 'source_0_0_15');
                const build = vi
                    .spyOn(tile, 'buildMesh')
                    .mockImplementation(() => {});
                await tile.load();
                if (mode2D) {
                    expect(loadTileData).not.toHaveBeenCalled();
                    expect(tile.status).toBe('loaded');
                    expect(build).toHaveBeenCalledOnce();
                    expect(tile.colorTex).toBe(cached.color);
                    expect(tile.elevationTex).toBe(cached.elev);
                } else {
                    expect(loadTileData).toHaveBeenCalledOnce();
                }
            }
        );

        it('reuses cached textures without pinning or building a mesh', async () => {
            const cached = {
                elev: {} as any,
                pixelData: new Uint8ClampedArray([1]),
                color: {} as any,
                overlay: null,
                normal: null,
            };
            vi.mocked(getFromCache).mockReturnValueOnce(cached);
            const tile = new Tile(0, 0, 14, 'source_0_0_14', true);

            await tile.load();

            expect(tile.status).toBe('loaded');
            expect(markCacheKeyActive).not.toHaveBeenCalled();
            expect(queueBuildMesh).not.toHaveBeenCalled();
            expect(tile.mesh).toBeNull();
        });
    });

    describe('missing color fallback', () => {
        it('renders a temporary placeholder without caching it as a valid tile', async () => {
            vi.mocked(loadTileData).mockResolvedValueOnce({
                taskId: 7,
                promise: Promise.resolve({
                    elevBitmap: null,
                    colorBitmap: null,
                    overlayBitmap: null,
                    normalBitmap: null,
                    pixelData: null,
                }),
            } as any);
            const tile = new Tile(0, 0, 14, '14/0/0');

            await tile.load();

            expect(tile.status).toBe('loaded');
            expect(tile.usesFallbackColor).toBe(true);
            expect(addToCache).not.toHaveBeenCalled();
        });

        it('rejoue une passe locale bornée quand des sources locales existent', async () => {
            const localColor = {
                width: 1,
                height: 1,
            } as unknown as ImageBitmap;
            vi.mocked(loadTileData)
                .mockResolvedValueOnce({
                    taskId: 7,
                    usedLocalReads: false,
                    localSourcesAvailable: true,
                    promise: Promise.resolve({
                        elevBitmap: null,
                        colorBitmap: null,
                        overlayBitmap: null,
                        normalBitmap: null,
                        pixelData: null,
                    }),
                } as any)
                .mockResolvedValueOnce({
                    taskId: 8,
                    usedLocalReads: true,
                    localSourcesAvailable: true,
                    promise: Promise.resolve({
                        elevBitmap: null,
                        colorBitmap: localColor,
                        overlayBitmap: null,
                        normalBitmap: null,
                        pixelData: null,
                    }),
                } as any);
            const tile = new Tile(0, 0, 14, '14/0/0');

            await tile.load();

            expect(loadTileData).toHaveBeenCalledTimes(2);
            const secondArgs = vi.mocked(loadTileData).mock.calls[1];
            expect(secondArgs[6]).toMatchObject({
                preferLocal: true,
                skipNavigationCache: true,
            });
            expect(tile.usesFallbackColor).toBe(false);
            expect(tile.colorTex).not.toBeNull();
        });

        it('ne rejoue pas de passe locale quand la lecture locale a déjà été faite', async () => {
            vi.mocked(loadTileData).mockResolvedValueOnce({
                taskId: 7,
                usedLocalReads: true,
                localSourcesAvailable: true,
                promise: Promise.resolve({
                    elevBitmap: null,
                    colorBitmap: null,
                    overlayBitmap: null,
                    normalBitmap: null,
                    pixelData: null,
                }),
            } as any);
            const tile = new Tile(0, 0, 14, '14/0/0');

            await tile.load();

            expect(loadTileData).toHaveBeenCalledOnce();
            expect(tile.usesFallbackColor).toBe(true);
        });

        it('conserve la première réponse si le repli est annulé', async () => {
            vi.mocked(loadTileData)
                .mockResolvedValueOnce({
                    taskId: 7,
                    usedLocalReads: false,
                    localSourcesAvailable: true,
                    promise: Promise.resolve({
                        elevBitmap: null,
                        colorBitmap: null,
                        overlayBitmap: null,
                        normalBitmap: null,
                        pixelData: null,
                    }),
                } as any)
                .mockResolvedValueOnce({
                    taskId: -1,
                    usedLocalReads: false,
                    localSourcesAvailable: true,
                    promise: Promise.resolve(null),
                } as any);
            const tile = new Tile(0, 0, 14, '14/0/0');

            await tile.load();

            expect(loadTileData).toHaveBeenCalledTimes(2);
            expect(tile.usesFallbackColor).toBe(true);
            expect(tile.status).toBe('loaded');
        });
    });

    describe('getBounds()', () => {
        it('returns bounds from geo module', () => {
            const tile = new Tile(0, 0, 14, '14/0/0');
            const bounds = tile.getBounds();
            expect(bounds).toBeDefined();
            expect(bounds.north).toBe(85.05);
            expect(bounds.south).toBe(66.51);
        });
    });

    describe('dispose()', () => {
        it('removes tile from load queue', () => {
            const tile = new Tile(0, 0, 14, '14/0/0');
            tile.dispose();
            expect(removeFromLoadQueue).toHaveBeenCalledWith(tile);
        });

        it('marks cache key inactive', () => {
            const tile = new Tile(0, 0, 14, '14/0/0');
            tile.dispose();
            expect(markCacheKeyInactive).toHaveBeenCalled();
        });

        it('sets status to disposed', () => {
            const tile = new Tile(0, 0, 14, '14/0/0');
            tile.dispose();
            expect(tile.status).toBe('disposed');
        });
    });

    describe('startFadeOut()', () => {
        it('requires mesh to be set (returns early if null)', () => {
            const tile = new Tile(0, 0, 14, '14/0/0');
            expect(tile.isFadingOut).toBe(false);
            tile.startFadeOut();
            expect(tile.isFadingOut).toBe(false);
        });
    });
});
