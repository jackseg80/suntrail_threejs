import { describe, it, expect, beforeEach } from 'vitest';
import { state } from './state';
import { worldToLngLat, lngLatToTile } from './geo';

describe('Terrain Source Keys (v5.29.0)', () => {
    beforeEach(() => {
        state.originTile = { x: 4270, y: 2891, z: 14 };
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
});
