import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWeather } from './weather';
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
                        display_name: 'Delémont'
                    })
                });
            }
            return Promise.reject(new Error('Unknown URL'));
        });

        await fetchWeather(47.36, 7.34);
        expect(state.currentWeather).toBe('rain');
        expect(state.weatherData?.locationName).toBe('Delémont');
    });

    it('should default to clear on API error', async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: false });
        await fetchWeather(0, 0);
        expect(state.currentWeather).toBe('clear');
    });
});
