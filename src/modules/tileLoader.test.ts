import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from './state';
import { getColorUrl, getOverlayUrl, getElevationUrl } from './tileLoader';

// Mock de utils
vi.mock('./utils', () => ({
    showToast: vi.fn()
}));

// Mock de geo
vi.mock('./geo', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./geo')>();
    return {
        ...actual,
        isPositionInSwitzerland: vi.fn((lat, lon) => {
            // Mock: Zone Suisse entre lon 7 et 10, lat 45 et 48
            return lon >= 7 && lon <= 10 && lat >= 45 && lat <= 48;
        }),
        isPositionInFrance: vi.fn((lat, lon) => {
            // Mock: Zone France (simplifiée) entre lon -5 et 8
            return lon >= -5 && lon < 8 && lat >= 42 && lat <= 51;
        })
    };
});

// Mock de tileWorkerManager
vi.mock('./workerManager', () => ({
    tileWorkerManager: {
        loadTile: vi.fn(() => Promise.resolve({
            elevBitmap: {},
            colorBitmap: {},
            overlayBitmap: {},
            normalBitmap: {},
            pixelData: new Uint8ClampedArray(100).buffer,
            cacheHits: 0,
            networkRequests: 1
        }))
    }
}));

describe('tileLoader.ts URLs', () => {
    beforeEach(() => {
        state.MK = 'test_key_valid_12345';
        state.isMapTilerDisabled = false;
        state.MAP_SOURCE = 'opentopomap';
        state.SHOW_TRAILS = true;
    });

    it('should generate correct Elevation URL', () => {
        const result = getElevationUrl(10, 20, 14, false);
        expect(result.url).toContain('terrain-rgb-v2/14/10/20');
        expect(result.url).toContain('key=test_key_valid_12345');
        expect(result.sourceZoom).toBe(14);
    });

    it('should return null Elevation URL for 2D', () => {
        const result = getElevationUrl(10, 20, 14, true);
        expect(result.url).toBeNull();
    });

    it('should generate correct Color URL for OpenTopoMap (Global Fallback)', () => {
        state.MAP_SOURCE = 'opentopomap';
        const url = getColorUrl(0, 0, 11); 
        expect(url).toContain('topo-v2/256/11/0/0');
    });

    it('should generate correct Color URL for SwissTopo (when inside CH)', () => {
        state.MAP_SOURCE = 'swisstopo';
        const url = getColorUrl(4270, 2891, 13);
        expect(url).toContain('ch.swisstopo.pixelkarte-farbe');
    });

    it('should generate correct Overlay URL for Switzerland (Raster)', () => {
        const url = getOverlayUrl(4270, 2891, 13);
        expect(url).toContain('ch.swisstopo.swisstlm3d-wanderwege');
        expect(url).toContain('.png');
    });

    it('should generate Waymarked Trails overlay outside Switzerland (Raster)', () => {
        const url = getOverlayUrl(4240, 2915, 13);
        expect(url).toContain('tile.waymarkedtrails.org');
        expect(url).toContain('.png');
    });

    it('should return SwissTopo overlay at LOD 16-18 for Swiss tiles', () => {
        expect(getOverlayUrl(34160, 23128, 16)).toContain('ch.swisstopo.swisstlm3d-wanderwege');
        expect(getOverlayUrl(68320, 46256, 17)).toContain('ch.swisstopo.swisstlm3d-wanderwege');
        expect(getOverlayUrl(136640, 92512, 18)).toContain('ch.swisstopo.swisstlm3d-wanderwege');
    });

    it('should return null for Swiss overlay at LOD 19', () => {
        expect(getOverlayUrl(273280, 185024, 19)).toBeNull();
    });

    it('should return Waymarked Trails overlay at LOD 16-17 outside Switzerland', () => {
        expect(getOverlayUrl(4240, 2915, 16)).toContain('tile.waymarkedtrails.org');
        expect(getOverlayUrl(4240, 2915, 17)).toContain('tile.waymarkedtrails.org');
    });

    it('should return null for Waymarked overlay at LOD 18 outside Switzerland', () => {
        expect(getOverlayUrl(4240, 2915, 18)).toBeNull();
    });

    it('should return null Overlay URL when trails are hidden', () => {
        state.SHOW_TRAILS = false;
        const url = getOverlayUrl(4270, 2891, 13);
        expect(url).toBeNull();
    });

    describe('loadTileData (v5.32.17+)', () => {
        it('should pass is2D=true to worker when zoom <= 10', async () => {
            const { loadTileData } = await import('./tileLoader');
            const { tileWorkerManager } = await import('./workerManager');
            await loadTileData(0, 0, 10, true);
            expect(tileWorkerManager.loadTile).toHaveBeenCalledWith(
                null, expect.any(String), null, 10, 10, expect.any(Object), true
            );
        });

        it('should pass is2D=false to worker when zoom > 10 and not in eco mode', async () => {
            const { loadTileData } = await import('./tileLoader');
            const { tileWorkerManager } = await import('./workerManager');
            state.PERFORMANCE_PRESET = 'balanced';
            state.IS_2D_MODE = false;
            await loadTileData(0, 0, 14, false);
            expect(tileWorkerManager.loadTile).toHaveBeenCalledWith(
                expect.any(String), expect.any(String), expect.any(String), 14, 14, expect.any(Object), false
            );
        });
    });
});
