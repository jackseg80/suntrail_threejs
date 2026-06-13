import { describe, it, expect } from 'vitest';
import {
    swisstopoTopo,
    swisstopoSatellite,
    swisstopoTrails,
    ignTopo,
    ignSatellite,
    basemapAtTopo,
    basemapAtSatellite,
    bkgTopo,
    ignSpainTopo,
    kartverketTopo,
    opentopomapUrl,
    maptilerTopo,
    maptilerSatellite,
    waymarkedTrails,
    osmUrl,
    COUNTRY_SOURCES,
} from './tileSources';

describe('tileSources — URL builders', () => {
    it('swisstopoTopo URL contains wmts.geo.admin.ch', () => {
        const url = swisstopoTopo(10, 500, 300);
        expect(url).toContain('wmts.geo.admin.ch');
        expect(url).toContain('pixelkarte-farbe');
        expect(url).toContain('/3857/10/500/300');
    });

    it('swisstopoSatellite URL contains swissimage', () => {
        const url = swisstopoSatellite(12, 100, 200);
        expect(url).toContain('wmts.geo.admin.ch');
        expect(url).toContain('swissimage');
    });

    it('swisstopoTrails URL contains wanderwege', () => {
        const url = swisstopoTrails(11, 50, 50);
        expect(url).toContain('wmts.geo.admin.ch');
        expect(url).toContain('wanderwege');
    });

    it('ignTopo URL contains data.geopf.fr', () => {
        const url = ignTopo(10, 500, 300);
        expect(url).toContain('data.geopf.fr');
        expect(url).toContain('PLANIGNV2');
    });

    it('ignSatellite URL contains orthophotos', () => {
        const url = ignSatellite(10, 100, 200);
        expect(url).toContain('data.geopf.fr');
        expect(url).toContain('ORTHOIMAGERY');
    });

    it('basemapAtTopo URL contains basemap.at', () => {
        const url = basemapAtTopo(8, 100, 200);
        expect(url).toContain('mapsneu.wien.gv.at');
        expect(url).toContain('geolandbasemap');
    });

    it('basemapAtSatellite URL contains orthofoto', () => {
        const url = basemapAtSatellite(8, 50, 50);
        expect(url).toContain('mapsneu.wien.gv.at');
        expect(url).toContain('orthofoto');
    });

    it('bkgTopo zero-pads z to 2 digits', () => {
        const url = bkgTopo(5, 100, 200);
        expect(url).toContain('sgx.geodatenzentrum.de');
        expect(url).toContain('/05/');
        expect(url).toContain('/200/');
        expect(url).toContain('/100.png');
    });

    it('bkgTopo pads z for single-digit zoom', () => {
        const url = bkgTopo(9, 0, 0);
        expect(url).toContain('/09/');
    });

    it('bkgTopo does not double-pad two-digit z', () => {
        const url = bkgTopo(12, 100, 200);
        expect(url).toContain('/12/');
    });

    it('ignSpainTopo URL contains ign.es', () => {
        const url = ignSpainTopo(10, 100, 200);
        expect(url).toContain('www.ign.es');
        expect(url).toContain('IGNBaseTodo');
    });

    it('kartverketTopo URL contains cache.kartverket.no (new CDN)', () => {
        const url = kartverketTopo(10, 100, 200);
        expect(url).toContain('cache.kartverket.no');
        expect(url).toContain('LAYER=topo');
    });

    it('opentopomapUrl cycles subdomain a,b,c based on (x+y)%3', () => {
        expect(opentopomapUrl(10, 0, 0)).toContain('://a.');
        expect(opentopomapUrl(10, 1, 0)).toContain('://b.');
        expect(opentopomapUrl(10, 2, 0)).toContain('://c.');
        expect(opentopomapUrl(10, 3, 0)).toContain('://a.');
    });

    it('maptilerTopo includes api key as query param', () => {
        const url = maptilerTopo(10, 100, 200, 'test-key-123');
        expect(url).toContain('maptiler.com/maps/outdoor');
        expect(url).toContain('key=test-key-123');
    });

    it('maptilerSatellite includes api key as query param', () => {
        const url = maptilerSatellite(8, 50, 50, 'my-key');
        expect(url).toContain('api.maptiler.com');
        expect(url).toContain('satellite');
        expect(url).toContain('?key=my-key');
    });

    it('waymarkedTrails URL contains hiking path', () => {
        const url = waymarkedTrails(12, 100, 200);
        expect(url).toContain('tile.waymarkedtrails.org');
        expect(url).toContain('/hiking/');
    });

    it('osmUrl returns standard OSM tile URL', () => {
        const url = osmUrl(14, 8500, 5700);
        expect(url).toContain('tile.openstreetmap.org');
        expect(url).toContain('/14/8500/5700.png');
    });
});

describe('COUNTRY_SOURCES', () => {
    it('CH has colorTopo, satellite, overlay, and strictAtHighZoom', () => {
        const ch = COUNTRY_SOURCES['CH'];
        expect(ch).toBeDefined();
        expect(ch.colorTopo).toBeDefined();
        expect(ch.colorSatellite).toBeDefined();
        expect(ch.overlay).toBeDefined();
        expect(ch.minZoom).toBe(10);
        expect(ch.strictAtHighZoom).toEqual({
            thresholdZoom: 14,
            useStrictAbove: true,
        });
    });

    it('FR has colorTopo and satellite', () => {
        const fr = COUNTRY_SOURCES['FR'];
        expect(fr.colorTopo).toBeDefined();
        expect(fr.colorSatellite).toBeDefined();
        expect(fr.minZoom).toBe(10);
    });

    it('IT has minZoom but no colorTopo (fallback only)', () => {
        const it = COUNTRY_SOURCES['IT'];
        expect(it).toBeDefined();
        expect(it.colorTopo).toBeUndefined();
        expect(it.colorSatellite).toBeUndefined();
        expect(it.minZoom).toBe(10);
    });

    it('AT has colorTopo and satellite with minZoom 12 (aligned with pack LOD)', () => {
        const at = COUNTRY_SOURCES['AT'];
        expect(at.colorTopo).toBeDefined();
        expect(at.colorSatellite).toBeDefined();
        expect(at.minZoom).toBe(12);
    });

    it('DE has colorTopo but no satellite', () => {
        const de = COUNTRY_SOURCES['DE'];
        expect(de.colorTopo).toBeDefined();
        expect(de.colorSatellite).toBeUndefined();
        expect(de.minZoom).toBe(10);
    });

    it('ES has colorTopo but no satellite', () => {
        const es = COUNTRY_SOURCES['ES'];
        expect(es.colorTopo).toBeDefined();
        expect(es.colorSatellite).toBeUndefined();
        expect(es.minZoom).toBe(10);
    });

    it('NO is in COUNTRY_SOURCES with Kartverket topo (new CDN)', () => {
        const no = COUNTRY_SOURCES['NO'];
        expect(no.colorTopo).toBeDefined();
        expect(no.colorSatellite).toBeUndefined();
        expect(no.minZoom).toBe(10);
        const url = no.colorTopo!(10, 0, 0);
        expect(url).toContain('cache.kartverket.no');
        expect(url).toContain('LAYER=topo');
        expect(url).toContain('tileMatrixSet=webmercator');
    });

    it('JP is NOT in COUNTRY_SOURCES (not in Europe dataset)', () => {
        expect(COUNTRY_SOURCES['JP']).toBeUndefined();
    });
});
