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

// Import fetchOverpassData for type safety in tests
import { fetchOverpassData } from './utils';

describe('Buildings Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.isPro = true;
        state.SHOW_BUILDINGS = true;
        state.BUILDING_ZOOM_THRESHOLD = 13;
        state.MK = 'test-key';
        state.isMapTilerDisabled = false;
        state.RELIEF_EXAGGERATION = 1.0;
        
        // Mock global fetch for MapTiler failures
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404
        });
    });

    it('should fallback to Overpass when MapTiler fails', async () => {
        const tile = new Tile(0, 0, 14, '14/0/0');
        tile.mesh = new THREE.Mesh();
        tile.status = 'loaded';

        // Mock Overpass Response
        (fetchOverpassData as any).mockResolvedValue([
            {
                type: 'way',
                id: 1,
                geometry: [
                    { lat: 46.5, lon: 7.5 },
                    { lat: 46.501, lon: 7.5 },
                    { lat: 46.501, lon: 7.501 },
                    { lat: 46.5, lon: 7.501 },
                    { lat: 46.5, lon: 7.5 }
                ],
                tags: { building: 'yes', 'building:levels': '2' }
            }
        ]);

        // Ajuster les bounds de la tuile pour qu'elles englobent le bâtiment
        vi.spyOn(tile, 'getBounds').mockReturnValue({
            north: 46.6, south: 46.4, east: 7.6, west: 7.4
        });
        
        // Mock tile.lngLatToLocal
        tile.lngLatToLocal = vi.fn().mockReturnValue({ x: 10, z: 10 });

        await loadBuildingsForTile(tile);

        // Attendre un peu pour les éventuelles promesses internes si nécessaire
        // Mais loadBuildingsForTile est async et attend renderBuildingsMerged
        
        expect(fetchOverpassData).toHaveBeenCalled();
        expect(tile.buildingMesh).toBeDefined();
    });
});
