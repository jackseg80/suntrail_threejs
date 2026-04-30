import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { loadBuildingsForTile } from './buildings';
import { state } from './state';
import { Tile } from './terrain';

// Mock global caches API
(global as any).caches = {
    open: vi.fn().mockResolvedValue({
        match: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined)
    })
};

// Mocks
vi.mock('./analysis', () => ({
    getAltitudeAt: vi.fn(() => 1000)
}));

vi.mock('./utils', () => ({
    fetchOverpassData: vi.fn(),
    isOverpassInBackoff: vi.fn(() => false)
}));

// Mock de @mapbox/vector-tile
vi.mock('@mapbox/vector-tile', () => {
    return {
        VectorTile: class {
            layers = {
                building: {
                    length: 1,
                    extent: 4096,
                    feature: (_i: number) => ({
                        id: 1,
                        properties: { levels: 2 },
                        loadGeometry: () => [[{ x: 2048, y: 2048 }, { x: 2100, y: 2048 }, { x: 2100, y: 2100 }, { x: 2048, y: 2100 }, { x: 2048, y: 2048 }]],
                        type: 3
                    })
                }
            };
        }
    };
});

describe('Buildings Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.isPro = true;
        state.SHOW_BUILDINGS = true;
        state.MK = 'test-key';
        state.isMapTilerDisabled = false;
        state.RELIEF_EXAGGERATION = 1.0;
        state.scene = new THREE.Scene();
        
        // Mock global fetch for PBF
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(0)
        });
    });

    it('should load buildings from PBF and NOT use Overpass', async () => {
        const tile = new Tile(0, 0, 15, '15/0/0');
        tile.mesh = new THREE.Mesh();
        tile.status = 'loaded';

        // Mock tile.tileSizeMeters
        tile.tileSizeMeters = 1000;

        await loadBuildingsForTile(tile);

        expect(global.fetch).toHaveBeenCalled();
        expect(tile.buildingGroup).toBeDefined();
        if (tile.buildingGroup) {
            expect(tile.buildingGroup.children.length).toBe(1);
            expect(tile.buildingGroup.children[0]).toBeInstanceOf(THREE.Mesh);
        }
    });
});
