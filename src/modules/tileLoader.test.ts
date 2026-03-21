import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from './state';
import { getColorUrl, getOverlayUrl, getElevationUrl } from './tileLoader';

// Mock de utils
vi.mock('./utils', () => ({
    isPositionInSwitzerland: vi.fn((lat, lon) => lat === 46.5 && lon === 6.5),
    isPositionInFrance: vi.fn((lat, lon) => lat === 45.0 && lon === 5.0),
    showToast: vi.fn()
}));

describe('tileLoader.ts URLs', () => {
    beforeEach(() => {
        state.MK = 'test_key';
        state.TARGET_LAT = 0;
        state.TARGET_LON = 0;
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

    it('should generate correct Color URL for OpenTopoMap', () => {
        state.MAP_SOURCE = 'opentopomap';
        const url = getColorUrl(10, 20, 14);
        expect(url).toContain('topo-v2/256/14/10/20');
    });

    it('should generate correct Color URL for Satellite (Global)', () => {
        state.MAP_SOURCE = 'satellite';
        const url = getColorUrl(10, 20, 14);
        expect(url).toContain('maps/satellite/256/14/10/20');
    });

    it('should generate correct Color URL for SwissTopo (Satellite)', () => {
        state.MAP_SOURCE = 'satellite';
        state.TARGET_LAT = 46.5;
        state.TARGET_LON = 6.5;
        const url = getColorUrl(10, 20, 14);
        expect(url).toContain('ch.swisstopo.swissimage');
    });

    it('should generate correct Color URL for France (IGN Satellite)', () => {
        state.MAP_SOURCE = 'satellite';
        state.TARGET_LAT = 45.0;
        state.TARGET_LON = 5.0;
        const url = getColorUrl(10, 20, 14);
        expect(url).toContain('data.geopf.fr');
        expect(url).toContain('ORTHOIMAGERY.ORTHOPHOTOS');
    });

    it('should generate correct Overlay URL for Switzerland', () => {
        state.TARGET_LAT = 46.5;
        state.TARGET_LON = 6.5;
        const url = getOverlayUrl(10, 20, 14);
        expect(url).toContain('ch.swisstopo.swisstlm3d-wanderwege');
    });

    it('should return null Overlay URL when trails are hidden', () => {
        state.SHOW_TRAILS = false;
        const url = getOverlayUrl(10, 20, 14);
        expect(url).toBeNull();
    });
});
