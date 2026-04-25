import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { loadPOIsForTile } from './poi';
import { state } from './state';
import { Tile } from './terrain';

// Mock global caches API
(global as any).caches = {
    open: vi.fn().mockResolvedValue({
        match: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined)
    })
};

// Mock de @mapbox/vector-tile
vi.mock('@mapbox/vector-tile', () => {
    return {
        VectorTile: class {
            layers = {
                poi: {
                    length: 1,
                    extent: 4096,
                    feature: (_i: number) => ({
                        id: 1000,
                        properties: { information: 'guidepost', name: 'Test POI' },
                        loadGeometry: () => [[{ x: 2048, y: 2048 }]]
                    })
                }
            };
        }
    };
});

// Mocks
vi.mock('./analysis', () => ({
    getAltitudeAt: vi.fn(() => 1000)
}));

vi.mock('./boundedCache', () => ({
    BoundedCache: class {
        get = vi.fn();
        set = vi.fn();
        has = vi.fn();
        clear = vi.fn();
        delete = vi.fn();
    },
    boundedCacheSet: vi.fn()
}));

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
            arrayBuffer: async () => new ArrayBuffer(0)
        });
    });

    it('should load POIs from PBF and add them to tile as sprites', async () => {
        const tile = new Tile(0, 0, 14, '14/0/0');
        tile.mesh = new THREE.Mesh();
        tile.status = 'loaded';

        // Mock tile bounds and coordinate conversion
        vi.spyOn(tile, 'getBounds').mockReturnValue({
            north: 46.6, south: 46.4, east: 7.6, west: 7.4
        });
        
        tile.lngLatToLocal = vi.fn().mockReturnValue({ x: 10, z: 10 });
        tile.worldX = 1000;
        tile.worldZ = 1000;

        await loadPOIsForTile(tile);

        expect(globalThis.fetch).toHaveBeenCalled();
        expect(tile.poiGroup).toBeDefined();
        if (tile.poiGroup) {
            expect(tile.poiGroup.children.length).toBe(1);
            expect(tile.poiGroup.children[0]).toBeInstanceOf(THREE.Sprite);
            expect(tile.poiGroup.children[0].userData.name).toBe('Test POI');
        }
    });
});
