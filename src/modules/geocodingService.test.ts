import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    classifyFeature,
    searchLocations,
    CLASSIFICATIONS,
    getPlaceName,
    rankSearchResults,
} from './geocodingService';
import * as utils from './utils';

vi.mock('./utils', () => ({
    fetchGeocoding: vi.fn(),
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
                    { place_type: ['region'], text: 'Valais' },
                ],
            });

            const name = await getPlaceName(46.02, 7.74);
            expect(name).toBe('Zermatt');
        });

        it('should return village name from Nominatim format', async () => {
            vi.mocked(utils.fetchGeocoding).mockResolvedValue({
                address: { village: 'Arolla', county: 'Hérens' },
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
            expect(classifyFeature(feature, true)).toEqual(
                CLASSIFICATIONS.peak
            );
        });
    });

    describe('searchLocations', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should handle MapTiler GeoJSON format', async () => {
            vi.mocked(utils.fetchGeocoding).mockResolvedValue({
                features: [
                    {
                        geometry: { coordinates: [7.5, 46.5] },
                        place_name: 'Test Place',
                        place_type: ['place'],
                        context: [
                            { id: 'region.1', text: 'Valais' },
                            {
                                id: 'country.1',
                                text: 'Switzerland',
                                short_code: 'ch',
                            },
                        ],
                    },
                ],
            });

            const results = await searchLocations('test');
            expect(results).toHaveLength(1);
            expect(results[0].label).toBe('Test Place');
            expect(results[0].lat).toBe(46.5);
            expect(results[0].lon).toBe(7.5);
            expect(results[0].classification.type).toBe('city');
            expect(results[0]).toMatchObject({
                region: 'Valais',
                country: 'Switzerland',
                countryCode: 'CH',
            });
        });

        it('should handle Nominatim OSM format', async () => {
            vi.mocked(utils.fetchGeocoding).mockResolvedValue([
                {
                    lat: '46.5',
                    lon: '7.5',
                    display_name: 'OSM Place',
                    type: 'city',
                },
            ]);

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

    describe('rankSearchResults', () => {
        it('prioritizes same-country and nearby homonyms', () => {
            const classification = CLASSIFICATIONS.city;
            const ranked = rankSearchResults(
                [
                    {
                        lat: 39.78,
                        lon: -89.64,
                        label: 'Springfield, Illinois',
                        countryCode: 'US',
                        classification,
                    },
                    {
                        lat: 46.81,
                        lon: 8.23,
                        label: 'Springfield, Obwalden',
                        countryCode: 'CH',
                        classification,
                    },
                ],
                'Springfield',
                { lat: 46.8, lon: 8.2, countryCode: 'CH' }
            );

            expect(ranked[0].countryCode).toBe('CH');
            expect(ranked[0].distanceKm).toBeLessThan(5);
            expect(ranked[1].distanceKm).toBeGreaterThan(1000);
        });

        it('preserves source order when scores are identical', () => {
            const classification = CLASSIFICATIONS.poi;
            const ranked = rankSearchResults(
                [
                    { lat: 1, lon: 1, label: 'Alpha', classification },
                    { lat: 2, lon: 2, label: 'Beta', classification },
                ],
                'x'
            );
            expect(ranked.map((result) => result.label)).toEqual([
                'Alpha',
                'Beta',
            ]);
        });
    });
});
