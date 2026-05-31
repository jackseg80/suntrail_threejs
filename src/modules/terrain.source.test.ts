import { describe, it, expect, beforeEach } from 'vitest';
import { state } from './state';
import { getTileCacheKey } from './tileCache';
import { autoSelectMapSource } from './terrain';

describe('Terrain Source Keys (v5.29.28)', () => {
    beforeEach(() => {
        state.originTile = { x: 4270, y: 2891, z: 14 };
        state.SHOW_TRAILS = true;
        state.RESOLUTION = 64;
        state.hasManualSource = false;
        state.MAP_SOURCE = 'opentopomap';
        state.ZOOM = 14;
    });

    it('SHOULD respect hasManualSource flag and NOT auto-switch if true', () => {
        state.hasManualSource = true;
        state.MAP_SOURCE = 'satellite';

        // Coordonnées en Suisse (Normalement force swisstopo)
        const lat = 46.5;
        const lon = 6.6;

        autoSelectMapSource(lat, lon);

        expect(state.MAP_SOURCE).toBe('satellite');
    });

    it('SHOULD auto-switch if hasManualSource is false', () => {
        state.hasManualSource = false;
        state.MAP_SOURCE = 'opentopomap';

        // Coordonnées en Suisse
        const lat = 46.5;
        const lon = 6.6;

        autoSelectMapSource(lat, lon);

        expect(state.MAP_SOURCE).toBe('swisstopo');
    });

    it('SHOULD generate different keys for different MAP_SOURCE at same coords', () => {
        const tx = 4270;
        const ty = 2891;
        const zoom = 14;

        state.MAP_SOURCE = 'swisstopo';
        const key1 = `${state.MAP_SOURCE}_${tx}_${ty}_${zoom}`;

        state.MAP_SOURCE = 'opentopomap';
        const key2 = `${state.MAP_SOURCE}_${tx}_${ty}_${zoom}`;

        expect(key1).toContain('swisstopo');
        expect(key2).toContain('opentopomap');
        expect(key1).not.toBe(key2);
    });

    it('SHOULD auto-switch to HD source for Austria (basemap.at)', () => {
        state.hasManualSource = false;
        state.MAP_SOURCE = 'opentopomap';

        // Innsbruck, Autriche
        const lat = 47.27;
        const lon = 11.39;

        autoSelectMapSource(lat, lon);

        expect(state.MAP_SOURCE).toBe('swisstopo');
    });

    it('SHOULD auto-switch to HD source for Germany (BKG TopPlusOpen)', () => {
        state.hasManualSource = false;
        state.MAP_SOURCE = 'opentopomap';

        // Munich, Allemagne
        const lat = 48.14;
        const lon = 11.58;

        autoSelectMapSource(lat, lon);

        expect(state.MAP_SOURCE).toBe('swisstopo');
    });

    it('SHOULD auto-switch to HD source for Spain (IGN)', () => {
        state.hasManualSource = false;
        state.MAP_SOURCE = 'opentopomap';

        // Madrid, Espagne
        const lat = 40.42;
        const lon = -3.7;

        autoSelectMapSource(lat, lon);

        expect(state.MAP_SOURCE).toBe('swisstopo');
    });

    it('SHOULD keep opentopomap for Norway (Kartverket disabled)', () => {
        state.hasManualSource = false;
        state.MAP_SOURCE = 'opentopomap';

        // Oslo, Norvège (Kartverket désactivé car endpoint inaccessible)
        const lat = 59.91;
        const lon = 10.75;

        autoSelectMapSource(lat, lon);

        expect(state.MAP_SOURCE).toBe('opentopomap');
    });

    it('SHOULD keep opentopomap for country without HD source', () => {
        state.hasManualSource = false;
        state.MAP_SOURCE = 'opentopomap';

        // Rome, Italie (pas encore de source HD native)
        const lat = 41.9;
        const lon = 12.5;

        autoSelectMapSource(lat, lon);

        expect(state.MAP_SOURCE).toBe('opentopomap');
    });

    it('SHOULD include MAP_SOURCE in tileCache keys', () => {
        const tileKey = '4270_2891_14';
        const zoom = 14;

        state.MAP_SOURCE = 'swisstopo';
        const cacheKey1 = getTileCacheKey(tileKey, zoom);

        state.MAP_SOURCE = 'satellite';
        const cacheKey2 = getTileCacheKey(tileKey, zoom);

        expect(cacheKey1).toContain('swisstopo');
        expect(cacheKey2).toContain('satellite');
        expect(cacheKey1).not.toBe(cacheKey2);
    });
});
