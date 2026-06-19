import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { loadPOIsForTile } from './poi';
import { state } from './state';
import { Tile } from './terrain';

(global as any).caches = {
    open: vi.fn().mockResolvedValue({
        match: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
    }),
};

vi.mock('@mapbox/vector-tile', () => {
    return {
        VectorTile: class {
            layers = {
                poi: {
                    length: 1,
                    extent: 4096,
                    feature: (_i: number) => ({
                        id: 1000,
                        properties: {
                            information: 'guidepost',
                            name: 'Test POI',
                        },
                        loadGeometry: () => [[{ x: 2048, y: 2048 }]],
                    }),
                },
            };
        },
    };
});

vi.mock('./analysis', () => ({
    getAltitudeAt: vi.fn(() => 1000),
}));

vi.mock('./boundedCache', () => ({
    BoundedCache: class {
        get = vi.fn();
        set = vi.fn();
        has = vi.fn();
        clear = vi.fn();
        delete = vi.fn();
    },
    boundedCacheSet: vi.fn(),
}));

function makeTile(zoom = 14): Tile {
    const tile = new Tile(0, 0, zoom, `${zoom}/0/0`);
    tile.mesh = new THREE.Mesh();
    tile.status = 'loaded';
    tile.lngLatToLocal = vi.fn().mockReturnValue({ x: 10, z: 10 });
    tile.worldX = 1000;
    tile.worldZ = 1000;
    vi.spyOn(tile, 'getBounds').mockReturnValue({
        north: 46.6,
        south: 46.4,
        east: 7.6,
        west: 7.4,
    });
    return tile;
}

describe('POI Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.SHOW_SIGNPOSTS = true;
        state.POI_ZOOM_THRESHOLD = 13;
        state.isUserInteracting = false;
        state.scene = new THREE.Scene();
        state.MK = 'test-key';
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(0),
        });
    });

    it('should load POIs from PBF and add them to tile as sprites', async () => {
        const tile = makeTile();
        await loadPOIsForTile(tile);

        expect(globalThis.fetch).toHaveBeenCalled();
        expect(tile.poiGroup).toBeDefined();
        if (tile.poiGroup) {
            expect(tile.poiGroup.children.length).toBe(1);
            expect(tile.poiGroup.children[0]).toBeInstanceOf(THREE.Sprite);
            expect(tile.poiGroup.children[0].userData.name).toBe('Test POI');
        }
    });

    it('should skip when SHOW_SIGNPOSTS is false', async () => {
        state.SHOW_SIGNPOSTS = false;
        const tile = makeTile();
        await loadPOIsForTile(tile);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('should skip when zoom below POI_ZOOM_THRESHOLD', async () => {
        state.POI_ZOOM_THRESHOLD = 15;
        const tile = makeTile(14);
        await loadPOIsForTile(tile);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('should skip when tile is disposed', async () => {
        const tile = makeTile();
        tile.status = 'disposed';
        await loadPOIsForTile(tile);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('should skip when poiGroup is already present', async () => {
        const tile = makeTile();
        tile.poiGroup = new THREE.Group();
        await loadPOIsForTile(tile);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('should handle fetch returning 404 gracefully', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
            arrayBuffer: async () => new ArrayBuffer(0),
        });
        const tile = makeTile();
        await loadPOIsForTile(tile);
        expect(tile.poiGroup).toBeNull();
    });
});
