import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { loadHydrologyForTile } from './hydrology';
import { state } from './state';
import { Tile } from './terrain';
import { fetchLandcoverPBF } from './landcover';

// Mocks
vi.mock('./analysis', () => ({
    getAltitudeAt: vi.fn(() => 1000)
}));

vi.mock('./landcover', () => ({
    fetchLandcoverPBF: vi.fn()
}));

vi.mock('./geo', () => ({
    isPositionInSwitzerland: vi.fn(() => true),
    decodeTerrainRGB: vi.fn(() => 0),
    getTileBounds: vi.fn(() => ({ north: 90, south: -90, east: 180, west: -180 })),
    EARTH_CIRCUMFERENCE: 40075016.686
}));

describe('Hydrology Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.SHOW_HYDROLOGY = true;
        state.isUserInteracting = false;
        state.originTile = { x: 0, y: 0, z: 0 };
    });

    it('should load hydrology from PBF and add it to tile', async () => {
        const tile = new Tile(0, 0, 14, '14/0/0');
        tile.mesh = new THREE.Mesh();
        tile.status = 'loaded';

        // Mock PBF Data
        (fetchLandcoverPBF as any).mockResolvedValue({
            forests: [],
            water: [
                {
                    type: 3, // Polygon
                    geometry: [
                        [
                            { x: 1000, y: 1000 },
                            { x: 2000, y: 1000 },
                            { x: 2000, y: 2000 },
                            { x: 1000, y: 2000 },
                            { x: 1000, y: 1000 }
                        ]
                    ],
                    extent: 4096,
                    bbox: { minX: 1000, maxX: 2000, minY: 1000, maxY: 2000 },
                    properties: { class: 'lake' }
                }
            ]
        });

        tile.lngLatToLocal = vi.fn().mockReturnValue({ x: 10, z: 10 });
        tile.worldX = 1000;
        tile.worldZ = 1000;

        await loadHydrologyForTile(tile);

        expect(fetchLandcoverPBF).toHaveBeenCalled();
        expect(tile.waterMaskTex).toBeDefined();
        expect(tile.waterMaskTex).not.toBeNull();
    });
});
