import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from './state';
import { getColorUrl, getOverlayUrl, getElevationUrl } from './tileLoader';

// Mock de utils
vi.mock('./utils', () => ({
    isPositionInSwitzerland: vi.fn((lat, lon) => {
        // Mock: Zone Suisse entre lon 6 et 10, lat 45 et 48
        return lon >= 6 && lon <= 10 && lat >= 45 && lat <= 48;
    }),
    isPositionInFrance: vi.fn((lat, lon) => {
        // Mock: Zone France (simplifiée) entre lon -5 et 6
        return lon >= -5 && lon < 6 && lat >= 42 && lat <= 51;
    }),
    showToast: vi.fn()
}));

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
        state.MK = 'test_key';
        state.MAP_SOURCE = 'opentopomap';
        state.SHOW_TRAILS = true;
    });

    it('should generate correct Elevation URL', () => {
        const url = getElevationUrl(10, 20, 14, false);
        expect(url).toContain('terrain-rgb-v2/14/10/20');
        expect(url).toContain('key=test_key');
    });

    it('should return null Elevation URL for 2D', () => {
        const url = getElevationUrl(10, 20, 14, true);
        expect(url).toBeNull();
    });

    it('should generate correct Color URL for OpenTopoMap (Global Fallback)', () => {
        state.MAP_SOURCE = 'opentopomap';
        // Tuile au milieu de l'atlantique (0,0)
        const url = getColorUrl(0, 0, 0); 
        expect(url).toContain('topo-v2/256/0/0/0');
    });

    it('should generate correct Color URL for SwissTopo (when inside CH)', () => {
        state.MAP_SOURCE = 'swisstopo';
        // Tuile proche de Berne (Z13: 4270, 2891)
        const url = getColorUrl(4270, 2891, 13);
        expect(url).toContain('ch.swisstopo.pixelkarte-farbe');
    });

    it('should fallback to MapTiler for SwissTopo (when outside CH)', () => {
        state.MAP_SOURCE = 'swisstopo';
        // Tuile à New York (Z13: 2413, 3080)
        const url = getColorUrl(2413, 3080, 13);
        expect(url).toContain('topo-v2/256/13/2413/3080');
    });

    it('should generate correct Overlay URL for Switzerland', () => {
        // Tuile en Suisse
        const url = getOverlayUrl(4270, 2891, 13);
        expect(url).toContain('ch.swisstopo.swisstlm3d-wanderwege');
    });

    it('should return null Overlay URL when trails are hidden', () => {
        state.SHOW_TRAILS = false;
        const url = getOverlayUrl(4270, 2891, 13);
        expect(url).toBeNull();
    });
});
