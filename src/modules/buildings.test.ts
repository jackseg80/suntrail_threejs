import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { loadBuildingsForTile } from './buildings';
import { state } from './state';
import { Tile } from './terrain';

// Mocks hoisted
vi.mock('./landcover', () => ({
    fetchLandcoverPBF: vi.fn()
}));

vi.mock('./analysis', () => ({
    getAltitudeAt: vi.fn(() => 1000)
}));

import { fetchLandcoverPBF } from './landcover';

describe('buildings.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.SHOW_BUILDINGS = true;
        state.BUILDING_ZOOM_THRESHOLD = 13;
        // Mock global fetch
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404
        });
    });

    it('should respect the SHOW_BUILDINGS state', async () => {
        state.SHOW_BUILDINGS = false;
        const tile = new Tile(0, 0, 16, '16/0/0');
        tile.status = 'loaded';
        await loadBuildingsForTile(tile);
        expect(tile.buildingGroup).toBeNull();
    });

    it('should not load buildings if zoom level is below threshold', async () => {
        state.SHOW_BUILDINGS = true;
        state.BUILDING_ZOOM_THRESHOLD = 15;
        const tile = new Tile(0, 0, 14, '14/0/0');
        tile.status = 'loaded';
        await loadBuildingsForTile(tile);
        expect(tile.buildingGroup).toBeNull();
    });

    it('should render buildings when PBF data is available', async () => {
        const tile = new Tile(0, 0, 15, '15/0/0');
        tile.mesh = new THREE.Mesh();
        tile.status = 'loaded';

        (fetchLandcoverPBF as any).mockResolvedValue({
            buildings: [
                {
                    geometry: [[{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 100, y: 200 }]],
                    properties: { levels: 2 },
                    extent: 4096
                }
            ]
        });

        await loadBuildingsForTile(tile);
        expect(tile.buildingGroup).toBeDefined();
        expect(tile.buildingGroup).not.toBeNull();
    });
});
