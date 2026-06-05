import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from './state';
import { getColorUrl, getOverlayUrl, getElevationUrl } from './tileLoader';

vi.mock('./utils', () => ({
    showToast: vi.fn(),
}));

vi.mock('./geo', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./geo')>();
    return {
        ...actual,
        isPositionInFrance: vi.fn((lat, lon) => {
            return lon >= -5 && lon < 8 && lat >= 42 && lat <= 51;
        }),
        isPositionInItaly: vi.fn((lat, lon) => {
            return lon >= 6.6 && lon <= 18.6 && lat >= 35 && lat <= 47.1;
        }),
    };
});

vi.mock('./workerManager', () => ({
    tileWorkerManager: {
        loadTile: vi.fn(() =>
            Promise.resolve({
                elevBitmap: {},
                colorBitmap: {},
                overlayBitmap: {},
                normalBitmap: {},
                pixelData: new Uint8ClampedArray(100).buffer,
                cacheHits: 0,
                networkRequests: 1,
            })
        ),
    },
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
        state.MK = 'test_key_valid_12345';
        const url = getColorUrl(0, 0, 11);
        expect(url).toContain('opentopomap.org');
        expect(url).not.toContain('maptiler.com');

        const url12 = getColorUrl(0, 0, 12);
        expect(url12).toContain('opentopomap.org');
        expect(url12).not.toContain('maptiler.com');

        // Sans clé API
        state.MK = '';
        const urlNoKey = getColorUrl(0, 0, 13);
        expect(urlNoKey).toContain('opentopomap.org');
    });

    it('should generate correct Color URL for SwissTopo (when inside CH) — polygon-based', () => {
        state.MAP_SOURCE = 'swisstopo';
        const url = getColorUrl(4270, 2891, 13);
        expect(url).toContain('ch.swisstopo.pixelkarte-farbe');
    });

    it('should not use SwissTopo at LOD > 14 for border tiles (LOD cap)', () => {
        state.MAP_SOURCE = 'swisstopo';
        // Issenheim tile (~47.90, ~7.25) — hors CH selon le polygone
        // Les coordonnées tx/ty pour Issenheim au LOD 15
        // LOD 15: n=32768, tx≈4258, ty≈14369
        const issenheimX = 4258,
            issenheimY = 14369;
        const url = getColorUrl(issenheimX, issenheimY, 15);
        // Ne doit PAS contenir swisstopo (car hors-CH + LOD>14)
        expect(url).not.toContain('ch.swisstopo');
        // Doit utiliser IGN (France) ou fallback
        expect(url).toMatch(
            /geopf\.fr|opentopomap\.org|maptiler\.com|openstreetmap\.org/
        );
    });

    it('should prioritize Switzerland over Italy and France', () => {
        state.MAP_SOURCE = 'swisstopo';
        // Spiez (Suisse)
        const url = getColorUrl(4270, 2891, 13);
        expect(url).toContain('ch.swisstopo.pixelkarte-farbe');
    });

    it('should prioritize Italy over France', () => {
        state.MAP_SOURCE = 'swisstopo';
        // Aoste (Italie à 7.34E) — détecté comme IT par les polygones Natural Earth
        // IT n'a pas de source HD native → fallback global (MapTiler)
        const url = getColorUrl(4263, 2922, 13);
        expect(url).toContain('maptiler.com');
    });

    it('SHOULD use basemap.at for Austrian tiles in Topo mode', () => {
        state.MAP_SOURCE = 'swisstopo';
        state.MK = '';
        // Vienna (16.37°E, 48.21°N) — LOD 13, profond en Autriche
        const url = getColorUrl(4469, 2841, 13);
        expect(url).toContain('mapsneu.wien.gv.at');
        expect(url).toContain('geolandbasemap');
    });

    it('SHOULD use basemap.at orthofoto for Austrian tiles in Satellite mode', () => {
        state.MAP_SOURCE = 'satellite';
        state.MK = '';
        const url = getColorUrl(4469, 2841, 13);
        expect(url).toContain('mapsneu.wien.gv.at');
        expect(url).toContain('bmaporthofoto30cm');
    });

    it('SHOULD fallback to OpenTopoMap at low zoom even in Austria', () => {
        state.MAP_SOURCE = 'swisstopo';
        state.MK = '';
        const url = getColorUrl(266, 182, 10);
        expect(url).toContain('opentopomap.org');
    });

    it('SHOULD use BKG TopPlusOpen for German tiles', () => {
        state.MAP_SOURCE = 'swisstopo';
        state.MK = '';
        // Munich (11.58°E, 48.14°N) — LOD 13
        const url = getColorUrl(4338, 2847, 13);
        expect(url).toContain('sgx.geodatenzentrum.de');
        expect(url).toContain('topplus_open');
        expect(url).toContain('WEBMERCATOR');
    });

    it('SHOULD use IGN Spain for Spanish tiles', () => {
        state.MAP_SOURCE = 'swisstopo';
        state.MK = '';
        // Madrid (40.42°N, -3.70°W) — LOD 13
        const url = getColorUrl(3967, 3075, 13);
        expect(url).toContain('ign.es');
        expect(url).toContain('IGNBaseTodo-nofondo');
        expect(url).toContain('GoogleMapsCompatible');
    });

    it('SHOULD use Kartverket for Norway topo tiles', () => {
        state.MAP_SOURCE = 'swisstopo';
        state.MK = 'test_key_valid_12345';
        // Oslo (10.75°E, 59.91°N) — LOD 13
        const url = getColorUrl(4341, 2384, 13);
        expect(url).toContain('cache.kartverket.no');
        expect(url).toContain('LAYER=topo');
        expect(url).toContain('tileMatrixSet=webmercator');
    });

    it('should generate correct Overlay URL for Switzerland (polygon-based)', () => {
        const url = getOverlayUrl(4270, 2891, 13);
        expect(url).toContain('ch.swisstopo.swisstlm3d-wanderwege');
        expect(url).toContain('.png');
    });

    it('should generate Waymarked Trails overlay outside Switzerland', () => {
        const url = getOverlayUrl(4240, 2915, 13);
        expect(url).toContain('tile.waymarkedtrails.org');
        expect(url).toContain('.png');
    });

    it('should return SwissTopo overlay at LOD 16-18 for Swiss tiles', () => {
        expect(getOverlayUrl(34160, 23128, 16)).toContain(
            'ch.swisstopo.swisstlm3d-wanderwege'
        );
        expect(getOverlayUrl(68320, 46256, 17)).toContain(
            'ch.swisstopo.swisstlm3d-wanderwege'
        );
        expect(getOverlayUrl(136640, 92512, 18)).toContain(
            'ch.swisstopo.swisstlm3d-wanderwege'
        );
    });

    it('should return null for Swiss overlay at LOD 19', () => {
        expect(getOverlayUrl(273280, 185024, 19)).toBeNull();
    });

    it('should return Waymarked Trails overlay at LOD 16-17 outside Switzerland', () => {
        expect(getOverlayUrl(4240, 2915, 16)).toContain(
            'tile.waymarkedtrails.org'
        );
        expect(getOverlayUrl(4240, 2915, 17)).toContain(
            'tile.waymarkedtrails.org'
        );
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
                0,
                0,
                null,
                expect.any(String),
                null,
                10,
                10,
                expect.any(Object),
                true
            );
        });

        it('should pass is2D=false to worker when zoom > 10 and not in eco mode', async () => {
            const { loadTileData } = await import('./tileLoader');
            const { tileWorkerManager } = await import('./workerManager');
            state.PERFORMANCE_PRESET = 'balanced';
            state.IS_2D_MODE = false;
            await loadTileData(0, 0, 14, false);
            expect(tileWorkerManager.loadTile).toHaveBeenCalledWith(
                0,
                0,
                expect.any(String),
                expect.any(String),
                expect.any(String),
                14,
                14,
                expect.any(Object),
                false
            );
        });
    });
});
