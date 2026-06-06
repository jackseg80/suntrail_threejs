import { describe, it, expect, beforeEach } from 'vitest';
import { getCachedZones, addCachedZone, removeCachedZone } from './cachedZones';

const ZONE_KEY = 'suntrail-cached-zones';

describe('cachedZones', () => {
    beforeEach(() => {
        localStorage.removeItem(ZONE_KEY);
    });

    describe('getCachedZones', () => {
        it('should return empty array when no zones stored', () => {
            const zones = getCachedZones();
            expect(zones).toEqual([]);
        });

        it('should return empty array on corrupted JSON', () => {
            localStorage.setItem(ZONE_KEY, 'not-json');
            const zones = getCachedZones();
            expect(zones).toEqual([]);
        });
    });

    describe('addCachedZone', () => {
        it('should add a zone with id and timestamp', () => {
            addCachedZone({
                label: 'Test zone',
                bbox: { minLat: 46.8, maxLat: 47.0, minLon: 6.8, maxLon: 7.2 },
                minLod: 5,
                maxLod: 14,
                tileCount: 100,
                sizeMB: '~8.0 Mo',
            });

            const zones = getCachedZones();
            expect(zones).toHaveLength(1);
            expect(zones[0].label).toBe('Test zone');
            expect(zones[0].tileCount).toBe(100);
            expect(zones[0].id).toBeTruthy();
            expect(zones[0].timestamp).toBeGreaterThan(0);
        });

        it('should append multiple zones', () => {
            addCachedZone({
                label: 'Zone A',
                bbox: { minLat: 46.0, maxLat: 47.0, minLon: 6.0, maxLon: 7.0 },
                minLod: 5,
                maxLod: 10,
                tileCount: 50,
                sizeMB: '~4.0 Mo',
            });
            addCachedZone({
                label: 'Zone B',
                bbox: { minLat: 47.0, maxLat: 48.0, minLon: 7.0, maxLon: 8.0 },
                minLod: 10,
                maxLod: 14,
                tileCount: 200,
                sizeMB: '~16.0 Mo',
            });

            const zones = getCachedZones();
            expect(zones).toHaveLength(2);
            expect(zones[0].label).toBe('Zone A');
            expect(zones[1].label).toBe('Zone B');
        });
    });

    describe('removeCachedZone', () => {
        it('should remove a zone by id', () => {
            addCachedZone({
                label: 'To keep',
                bbox: { minLat: 46.0, maxLat: 47.0, minLon: 6.0, maxLon: 7.0 },
                minLod: 5,
                maxLod: 10,
                tileCount: 50,
                sizeMB: '~4.0 Mo',
            });
            addCachedZone({
                label: 'To remove',
                bbox: { minLat: 47.0, maxLat: 48.0, minLon: 7.0, maxLon: 8.0 },
                minLod: 10,
                maxLod: 14,
                tileCount: 200,
                sizeMB: '~16.0 Mo',
            });

            const zones = getCachedZones();
            expect(zones).toHaveLength(2);

            removeCachedZone(zones[1].id);

            const remaining = getCachedZones();
            expect(remaining).toHaveLength(1);
            expect(remaining[0].label).toBe('To keep');
        });

        it('should do nothing when removing non-existent id', () => {
            addCachedZone({
                label: 'Test',
                bbox: { minLat: 46.0, maxLat: 47.0, minLon: 6.0, maxLon: 7.0 },
                minLod: 5,
                maxLod: 10,
                tileCount: 50,
                sizeMB: '~4.0 Mo',
            });

            removeCachedZone('non-existent-id');
            expect(getCachedZones()).toHaveLength(1);
        });
    });
});
