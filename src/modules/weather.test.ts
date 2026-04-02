import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWeather, extractLocationName } from './weather';
import { state } from './state';

describe('Weather Module', () => {
    beforeEach(() => {
        state.weatherData = null;
        state.currentWeather = 'clear';
        vi.restoreAllMocks();
    });

    it('should set currentWeather to rain for WMO code 61 and get location name', async () => {
        // Mock global fetch for Weather API and MapTiler Geocoding
        global.fetch = vi.fn().mockImplementation((url) => {
            if (url.includes('open-meteo')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        current: {
                            temperature_2m: 12.5,
                            weather_code: 61,
                            apparent_temperature: 10.2,
                            relative_humidity_2m: 80,
                            wind_speed_10m: 15,
                            wind_direction_10m: 220,
                            cloud_cover: 90
                        },
                        hourly: {
                            time: Array(48).fill('2024-01-01T12:00'),
                            temperature_2m: Array(48).fill(12),
                            weather_code: Array(48).fill(61),
                            uv_index: Array(48).fill(1),
                            freezing_level_height: Array(48).fill(2000),
                            visibility: Array(48).fill(10000),
                            precipitation_probability: Array(48).fill(80)
                        }
                    })
                });
            }
            if (url.includes('api.maptiler.com/geocoding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        features: [{ place_name_fr: 'Delémont' }]
                    })
                });
            }
            if (url.includes('nominatim.openstreetmap.org')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        display_name: 'Rue de la Gare, Delémont, Jura, Suisse',
                        address: { city: 'Delémont', country: 'Suisse' }
                    })
                });
            }
            return Promise.reject(new Error('Unknown URL'));
        });

        await fetchWeather(47.36, 7.34);
        expect(state.currentWeather).toBe('rain');
        expect(state.weatherData?.locationName).toBe('Delémont, Suisse');
    });

    it('should default to clear on API error', async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: false });
        await fetchWeather(0, 0);
        expect(state.currentWeather).toBe('clear');
    });
});

describe('extractLocationName (v5.19.1)', () => {
    const fallback = '46.800, 8.200';

    it('MapTiler context structuré → Ville, Pays', () => {
        const feature = {
            context: [
                { id: 'place.123', text_fr: 'Interlaken', text: 'Interlaken' },
                { id: 'region.456', text_fr: 'Berne', text: 'Bern' },
                { id: 'country.789', text_fr: 'Suisse', text: 'Switzerland' },
            ],
        };
        expect(extractLocationName(feature, fallback)).toBe('Interlaken, Suisse');
    });

    it('MapTiler context avec municipality → prend municipality', () => {
        const feature = {
            context: [
                { id: 'municipality.1', text: 'Grindelwald' },
                { id: 'country.2', text: 'Switzerland' },
            ],
        };
        expect(extractLocationName(feature, fallback)).toBe('Grindelwald, Switzerland');
    });

    it('MapTiler place_name_fr "Rue, Ville, Région, Pays" → Ville, Pays', () => {
        const feature = {
            place_name_fr: 'Rue de la Gare, Delémont, Jura, Suisse',
        };
        expect(extractLocationName(feature, fallback)).toBe('Delémont, Suisse');
    });

    it('MapTiler place_name 2 segments → prend le 2e', () => {
        const feature = { place_name: 'Zermatt, Switzerland' };
        expect(extractLocationName(feature, fallback)).toBe('Switzerland');
    });

    it('MapTiler place_name 1 segment → retourne tel quel', () => {
        const feature = { place_name_fr: 'Zurich' };
        expect(extractLocationName(feature, fallback)).toBe('Zurich');
    });

    it('Nominatim address structuré → city, country', () => {
        const feature = {
            address: { city: 'Brig', country: 'Schweiz' },
        };
        expect(extractLocationName(feature, fallback)).toBe('Brig, Schweiz');
    });

    it('Nominatim address avec village → village, country', () => {
        const feature = {
            address: { village: 'Saas-Fee', country: 'Suisse' },
        };
        expect(extractLocationName(feature, fallback)).toBe('Saas-Fee, Suisse');
    });

    it('Nominatim display_name seul → 2e et 3e segments', () => {
        const feature = {
            display_name: 'Bahnhofstrasse, Spiez, Bern, Schweiz',
        };
        // slice(1, 3) → 'Spiez, Bern'
        expect(extractLocationName(feature, fallback)).toBe('Spiez, Bern');
    });

    it('feature vide → retourne fallback', () => {
        expect(extractLocationName({}, fallback)).toBe(fallback);
    });

    it('context sans place/municipality → tombe dans place_name', () => {
        const feature = {
            context: [{ id: 'region.1', text: 'Valais' }],
            place_name_fr: 'Sion, Valais, Suisse',
        };
        // pas de place ni municipality → skip context → parse place_name_fr
        expect(extractLocationName(feature, fallback)).toBe('Valais, Suisse');
    });
});
