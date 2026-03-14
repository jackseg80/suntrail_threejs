import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchWeather, updateWeatherUIIndicator } from './weather';
import { state } from './state';

describe('Weather Module', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        state.currentWeather = 'clear';
        state.weatherData = null;
        document.body.innerHTML = '<div id="zoom-indicator"></div>';
    });

    it('should set currentWeather to rain for WMO code 61 and get location name', async () => {
        const mockWeather = {
            current: {
                temperature_2m: 10,
                apparent_temperature: 8,
                weather_code: 61,
                wind_speed_10m: 15,
                wind_direction_10m: 180,
                wind_gusts_10m: 25,
                relative_humidity_2m: 80,
                cloud_cover: 100,
                dew_point_2m: 7
            },
            hourly: {
                time: Array(24).fill("2026-03-14T12:00"),
                temperature_2m: Array(24).fill(10),
                weather_code: Array(24).fill(61),
                uv_index: Array(24).fill(1),
                freezing_level_height: Array(24).fill(2000),
                visibility: Array(24).fill(10000),
                precipitation_probability: Array(24).fill(80)
            }
        };

        const mockGeo = { address: { city: 'Delémont' } };

        global.fetch = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockWeather) })
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockGeo) });

        await fetchWeather(47.36, 7.34);
        expect(state.currentWeather).toBe('rain');
        expect(state.weatherData?.temp).toBe(10);
        expect(state.weatherData?.locationName).toBe('Delémont');
    });

    it('should set currentWeather to snow for WMO code 71', async () => {
        const mockWeather = {
            current: {
                temperature_2m: -2,
                apparent_temperature: -5,
                weather_code: 71,
                wind_speed_10m: 10,
                wind_direction_10m: 0,
                wind_gusts_10m: 15,
                relative_humidity_2m: 90,
                cloud_cover: 100,
                dew_point_2m: -3
            },
            hourly: {
                time: Array(24).fill("2026-03-14T12:00"),
                temperature_2m: Array(24).fill(-2),
                weather_code: Array(24).fill(71),
                uv_index: Array(24).fill(0),
                freezing_level_height: Array(24).fill(0),
                visibility: Array(24).fill(2000),
                precipitation_probability: Array(24).fill(100)
            }
        };

        const mockGeo = { address: { town: 'Moutier' } };

        global.fetch = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockWeather) })
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockGeo) });

        await fetchWeather(47.28, 7.37);
        expect(state.currentWeather).toBe('snow');
        expect(state.weatherData?.locationName).toBe('Moutier');
    });

    it('should set currentWeather to clear for WMO code 0', async () => {
        const mockWeather = {
            current: { temperature_2m: 20, weather_code: 0, wind_speed_10m: 5, wind_direction_10m: 90 },
            hourly: {
                time: Array(24).fill("2026-03-14T12:00"),
                temperature_2m: Array(24).fill(20),
                weather_code: Array(24).fill(0),
                uv_index: Array(24).fill(5),
                freezing_level_height: Array(24).fill(4000),
                visibility: Array(24).fill(20000),
                precipitation_probability: Array(24).fill(0)
            }
        };
        global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockWeather) });

        await fetchWeather(46.5, 6.6);
        expect(state.currentWeather).toBe('clear');
    });

    it('should default to clear on API error', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('Network fail'));
        await fetchWeather(0, 0);
        expect(state.currentWeather).toBe('clear');
    });

    it('should gracefully handle non-ok responses', async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: false });
        await fetchWeather(0, 0);
        expect(state.currentWeather).toBe('clear');
    });
});
