import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyFeature, searchLocations, CLASSIFICATIONS, getPlaceName } from './geocodingService';
import * as utils from './utils';

vi.mock('./utils', () => ({
    fetchGeocoding: vi.fn()
}));

describe('geocodingService.ts', () => {
    describe('getPlaceName', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should return city name from MapTiler format', async () => {
            vi.mocked(utils.fetchGeocoding).mockResolvedValue({
                features: [
                    { place_type: ['place'], text: 'Zermatt' },
                    { place_type: ['region'], text: 'Valais' }
                ]
            });

            const name = await getPlaceName(46.02, 7.74);
            expect(name).toBe('Zermatt');
        });

        it('should return village name from Nominatim format', async () => {
            vi.mocked(utils.fetchGeocoding).mockResolvedValue({
                address: { village: 'Arolla', county: 'Hérens' }
            });

            const name = await getPlaceName(46.02, 7.48);
            expect(name).toBe('Arolla');
        });

        it('should return null on failure', async () => {
            vi.mocked(utils.fetchGeocoding).mockResolvedValue(null);
            const name = await getPlaceName(0, 0);
            expect(name).toBeNull();
        });
    });

    describe('classifyFeature', () => {
        it('should classify MapTiler country features', () => {
            const feature = { place_type: ['country'] };
            expect(classifyFeature(feature)).toEqual(CLASSIFICATIONS.country);
        });

        it('should classify MapTiler city features', () => {
            const feature = { place_type: ['place'] };
            expect(classifyFeature(feature)).toEqual(CLASSIFICATIONS.city);
        });

        it('should classify Nominatim peak features', () => {
            const feature = { type: 'peak' };
            expect(classifyFeature(feature)).toEqual(CLASSIFICATIONS.peak);
        });

        it('should force peak classification when specified', () => {
            const feature = { place_type: ['place'] };
            expect(classifyFeature(feature, true)).toEqual(CLASSIFICATIONS.peak);
        });
    });

    describe('searchLocations', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should handle MapTiler GeoJSON format', async () => {
            vi.mocked(utils.fetchGeocoding).mockResolvedValue({
                features: [{
                    geometry: { coordinates: [7.5, 46.5] },
                    place_name: 'Test Place',
                    place_type: ['place']
                }]
            });

            const results = await searchLocations('test');
            expect(results).toHaveLength(1);
            expect(results[0].label).toBe('Test Place');
            expect(results[0].lat).toBe(46.5);
            expect(results[0].lon).toBe(7.5);
            expect(results[0].classification.type).toBe('city');
        });

        it('should handle Nominatim OSM format', async () => {
            vi.mocked(utils.fetchGeocoding).mockResolvedValue([{
                lat: '46.5',
                lon: '7.5',
                display_name: 'OSM Place',
                type: 'city'
            }]);

            const results = await searchLocations('test');
            expect(results).toHaveLength(1);
            expect(results[0].label).toBe('OSM Place');
            expect(results[0].classification.type).toBe('city');
        });

        it('should return empty array on fetch failure', async () => {
            vi.mocked(utils.fetchGeocoding).mockResolvedValue(null);
            const results = await searchLocations('test');
            expect(results).toEqual([]);
        });
    });
});
