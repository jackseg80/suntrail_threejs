import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { loadPOIsForTile } from './poi';
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
    fetchOverpassData: vi.fn()
}));

vi.mock('./boundedCache', () => ({
    boundedCacheSet: vi.fn()
}));

describe('POI Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.SHOW_SIGNPOSTS = true;
        state.POI_ZOOM_THRESHOLD = 13;
        state.isUserInteracting = false;
    });

    it('should load POIs from Overpass and add them to tile as sprites', async () => {
        const tile = new Tile(0, 0, 14, '14/0/0');
        tile.mesh = new THREE.Mesh();
        tile.status = 'loaded';

        // Mock Overpass Response (a signpost)
        (fetchOverpassData as any).mockResolvedValue({
            elements: [
                {
                    type: 'node',
                    id: 1000,
                    lat: 46.5,
                    lon: 7.5,
                    tags: { information: 'guidepost', name: 'Test POI' }
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

        await loadPOIsForTile(tile);

        expect(fetchOverpassData).toHaveBeenCalled();
        expect(tile.poiGroup).toBeDefined();
        if (tile.poiGroup) {
            expect(tile.poiGroup.children.length).toBe(1);
            expect(tile.poiGroup.children[0]).toBeInstanceOf(THREE.Sprite);
        }
    });
});
