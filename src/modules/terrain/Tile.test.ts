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
    getTileCacheKey: vi.fn((key: string, zoom: number) => `${zoom}/${key}`),
    markCacheKeyActive: vi.fn(),
    markCacheKeyInactive: vi.fn(),
    hasInCache: vi.fn(() => false),
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
import { queueBuildMesh, removeFromLoadQueue } from './tileQueue';
import {
    getFromCache,
    markCacheKeyActive,
    markCacheKeyInactive,
} from '../tileCache';

describe('Tile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockActiveTiles.clear();
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
    });

    describe('isVisible()', () => {
        it('returns true when camera is null (always visible)', () => {
            const tile = new Tile(0, 0, 14, '14/0/0');
            expect(tile.isVisible()).toBe(true);
        });
    });

    describe('cache-only prefetch', () => {
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
