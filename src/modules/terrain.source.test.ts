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
