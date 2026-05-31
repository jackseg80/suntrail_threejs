import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWeather } from './weather';
import { state } from './state';

vi.mock('./geocodingService', () => ({
    getPlaceName: vi.fn()
}));

vi.mock('./geo', async () => {
    const actual = await vi.importActual<typeof import('./geo')>('./geo');
    return { ...actual, getCountryName: vi.fn(() => '') };
});

import { getPlaceName } from './geocodingService';
import { getCountryName } from './geo';

describe('Weather Module (fetchWeather)', () => {
    beforeEach(() => {
        state.weatherData = null;
        state.currentWeather = 'clear';
        state.weatherUnavailable = false;
        vi.clearAllMocks();
    });

    it('should set currentWeather to rain for WMO code 61 and get location name', async () => {
        vi.mocked(getPlaceName).mockResolvedValue('Delémont');
        vi.mocked(getCountryName).mockReturnValue('Suisse');

        globalThis.fetch = vi.fn().mockImplementation((url) => {
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
            return Promise.reject(new Error('Unknown URL'));
        });

        await fetchWeather(47.36, 7.34);
        expect(state.currentWeather).toBe('rain');
        expect(state.weatherData?.locationName).toBe('Delémont, Suisse');
    });

    it('should set weatherUnavailable flag to true on API error', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 502 });
        await fetchWeather(46.8, 8.2);
        expect(state.weatherUnavailable).toBe(true);
        expect(state.currentWeather).toBe('clear');
    });

    it('should reset weatherUnavailable flag to false on success', async () => {
        vi.mocked(getPlaceName).mockResolvedValue(null);

        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                current: { temperature_2m: 20, weather_code: 0 },
                hourly: { 
                    time: Array(24).fill('2024-01-01T12:00'),
                    temperature_2m: Array(24).fill(20),
                    weather_code: Array(24).fill(0),
                    uv_index: Array(24).fill(1),
                    freezing_level_height: Array(24).fill(2000),
                    visibility: Array(24).fill(10000),
                    precipitation_probability: Array(24).fill(0)
                }
            })
        });
        
        state.weatherUnavailable = true;
        await fetchWeather(46.8, 8.2);
        expect(state.weatherUnavailable).toBe(false);
        expect(state.weatherData?.temp).toBe(20);
    });
});
