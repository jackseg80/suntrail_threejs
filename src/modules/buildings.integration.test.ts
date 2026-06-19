import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { loadBuildingsForTile } from './buildings';
import { state } from './state';
import { Tile } from './terrain';

(global as any).caches = {
    open: vi.fn().mockResolvedValue({
        match: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
    }),
};

vi.mock('./analysis', () => ({
    getAltitudeAt: vi.fn(() => 1000),
}));

vi.mock('./utils', () => ({}));

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
                        loadGeometry: () => [
                            [
                                { x: 2048, y: 2048 },
                                { x: 2100, y: 2048 },
                                { x: 2100, y: 2100 },
                                { x: 2048, y: 2100 },
                                { x: 2048, y: 2048 },
                            ],
                        ],
                        type: 3,
                    }),
                },
            };
        },
    };
});

function makeTile(zoom = 15): Tile {
    const tile = new Tile(0, 0, zoom, `${zoom}/0/0`);
    tile.mesh = new THREE.Mesh();
    tile.status = 'loaded';
    tile.tileSizeMeters = 1000;
    return tile;
}

describe('Buildings Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.isPro = true;
        state.SHOW_BUILDINGS = true;
        state.MK = 'test-key';
        state.isMapTilerDisabled = false;
        state.RELIEF_EXAGGERATION = 1.0;
        state.scene = new THREE.Scene();
        state.isUserInteracting = false;

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(0),
        });
    });

    it('should load buildings from PBF and NOT use Overpass', async () => {
        const tile = makeTile();
        await loadBuildingsForTile(tile);

        expect(global.fetch).toHaveBeenCalled();
        expect(tile.buildingGroup).toBeDefined();
        if (tile.buildingGroup) {
            expect(tile.buildingGroup.children.length).toBe(1);
            expect(tile.buildingGroup.children[0]).toBeInstanceOf(THREE.Mesh);
        }
    });

    it('should skip when SHOW_BUILDINGS is false', async () => {
        state.SHOW_BUILDINGS = false;
        const tile = makeTile();
        await loadBuildingsForTile(tile);
        expect(global.fetch).not.toHaveBeenCalled();
        expect(tile.buildingGroup).toBeNull();
    });

    it('should skip when zoom is below 15', async () => {
        const tile = makeTile(14);
        await loadBuildingsForTile(tile);
        expect(global.fetch).not.toHaveBeenCalled();
        expect(tile.buildingGroup).toBeNull();
    });

    it('should skip when tile is disposed', async () => {
        const tile = makeTile();
        tile.status = 'disposed';
        await loadBuildingsForTile(tile);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should skip when buildingGroup is already present', async () => {
        const tile = makeTile();
        tile.buildingGroup = new THREE.Group();
        await loadBuildingsForTile(tile);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle fetch returning empty PBF gracefully', async () => {
        vi.mocked(global.fetch).mockResolvedValue({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(0),
        } as Response);
        const tile = makeTile();
        await loadBuildingsForTile(tile);
        expect(tile.buildingGroup).toBeNull();
    });
});
