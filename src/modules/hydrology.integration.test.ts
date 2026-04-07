import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { loadHydrologyForTile } from './hydrology';
import { state } from './state';
import { Tile } from './terrain';
import { fetchOverpassData } from './utils';

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

vi.mock('./boundedCache', () => ({
    boundedCacheSet: vi.fn()
}));

describe('Hydrology Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.SHOW_HYDROLOGY = true;
        state.isUserInteracting = false;
    });

    it('should load hydrology from Overpass and add it to tile', async () => {
        const tile = new Tile(0, 0, 14, '14/0/0');
        tile.mesh = new THREE.Mesh();
        tile.status = 'loaded';

        // Mock Overpass Response (a small lake)
        (fetchOverpassData as any).mockResolvedValue({
            elements: [
                {
                    type: 'way',
                    id: 100,
                    geometry: [
                        { lat: 46.5, lon: 7.5 },
                        { lat: 46.501, lon: 7.5 },
                        { lat: 46.501, lon: 7.501 },
                        { lat: 46.5, lon: 7.501 },
                        { lat: 46.5, lon: 7.5 }
                    ],
                    tags: { natural: 'water' }
                }
            ]
        });

        // Mock tile bounds and coordinate conversion
        vi.spyOn(tile, 'getBounds').mockReturnValue({
            north: 46.6, south: 46.4, east: 7.6, west: 7.4
        });
        
        tile.lngLatToLocal = vi.fn().mockReturnValue({ x: 10, z: 10 });
        tile.worldX = 1000;
        tile.worldZ = 1000;

        await loadHydrologyForTile(tile);

        expect(fetchOverpassData).toHaveBeenCalled();
        expect(tile.hydroGroup).toBeDefined();
        if (tile.mesh) {
            expect(tile.mesh.children.length).toBeGreaterThan(0);
        }
    });
});
