import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchWeather } from './weather';
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
                temperature_2m: 10, apparent_temperature: 8, weather_code: 61,
                wind_speed_10m: 15, wind_direction_10m: 180, wind_gusts_10m: 25,
                relative_humidity_2m: 80, cloud_cover: 100, dew_point_2m: 7
            },
            hourly: {
                time: Array(48).fill("2026-03-14T12:00"),
                temperature_2m: Array(48).fill(10),
                weather_code: Array(48).fill(61),
                uv_index: Array(48).fill(1),
                freezing_level_height: Array(48).fill(2000),
                visibility: Array(48).fill(10000),
                precipitation_probability: Array(48).fill(80)
            }
        };
        const mockGeo = { address: { city: 'Delémont' } };
        global.fetch = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockWeather) })
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockGeo) });

        await fetchWeather(47.36, 7.34);
        expect(state.currentWeather).toBe('rain');
        expect(state.weatherData?.locationName).toBe('Delémont');
    });

    it('should default to clear on API error', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('Network fail'));
        await fetchWeather(0, 0);
        expect(state.currentWeather).toBe('clear');
    });
});
