import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWeather } from './weather';
import { state } from './state';

vi.mock('./geocodingService', () => ({
    getPlaceName: vi.fn(),
}));

vi.mock('./geo', async () => {
    const actual = await vi.importActual<typeof import('./geo')>('./geo');
    return { ...actual, getCountryName: vi.fn(() => '') };
});

import { getPlaceName } from './geocodingService';
import { getCountryName } from './geo';

function mockWeatherApi(
    temperature: number,
    weatherCode: number,
    hourlyTemp = temperature,
    hourlyCode = weatherCode,
) {
    return vi.fn().mockImplementation((url: string) => {
        if (url.includes('open-meteo')) {
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve({
                        current: {
                            temperature_2m: temperature,
                            weather_code: weatherCode,
                            apparent_temperature: temperature - 2,
                            relative_humidity_2m: 70,
                            wind_speed_10m: 10,
                            wind_direction_10m: 180,
                            cloud_cover: 50,
                        },
                        hourly: {
                            time: Array(48).fill('2024-01-01T12:00'),
                            temperature_2m: Array(48).fill(hourlyTemp),
                            weather_code: Array(48).fill(hourlyCode),
                            uv_index: Array(48).fill(2),
                            freezing_level_height: Array(48).fill(2500),
                            visibility: Array(48).fill(10000),
                            precipitation_probability: Array(48).fill(50),
                        },
                    }),
            });
        }
        return Promise.reject(new Error('Unknown URL'));
    });
}

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
        globalThis.fetch = mockWeatherApi(12.5, 61);

        await fetchWeather(47.36, 7.34);
        expect(state.currentWeather).toBe('rain');
        expect(state.weatherData?.locationName).toBe('Delémont, Suisse');
    });

    it('should set weatherUnavailable flag to true on API error', async () => {
        globalThis.fetch = vi
            .fn()
            .mockResolvedValue({ ok: false, status: 502 });
        await fetchWeather(46.8, 8.2);
        expect(state.weatherUnavailable).toBe(true);
        expect(state.currentWeather).toBe('clear');
    });

    it('should reset weatherUnavailable flag to false on success', async () => {
        vi.mocked(getPlaceName).mockResolvedValue(null);
        globalThis.fetch = mockWeatherApi(20, 0);

        state.weatherUnavailable = true;
        await fetchWeather(46.8, 8.2);
        expect(state.weatherUnavailable).toBe(false);
        expect(state.weatherData?.temp).toBe(20);
    });

    it('should classify WMO 80 (rain shower) as rain, not snow', async () => {
        vi.mocked(getPlaceName).mockResolvedValue(null);
        globalThis.fetch = mockWeatherApi(19, 80);

        await fetchWeather(46.8, 8.2);
        expect(state.currentWeather).toBe('rain');
    });

    it('should classify WMO 95 (thunderstorm) as rain, not snow', async () => {
        vi.mocked(getPlaceName).mockResolvedValue(null);
        globalThis.fetch = mockWeatherApi(22, 95);

        await fetchWeather(46.8, 8.2);
        expect(state.currentWeather).toBe('rain');
    });

    it('should classify WMO 71 (snow) as snow at sub-zero temperature', async () => {
        vi.mocked(getPlaceName).mockResolvedValue(null);
        globalThis.fetch = mockWeatherApi(-3, 71);

        await fetchWeather(46.8, 8.2);
        expect(state.currentWeather).toBe('snow');
    });

    it('should force rain when WMO code suggests snow but temperature > 5°C', async () => {
        vi.mocked(getPlaceName).mockResolvedValue(null);
        globalThis.fetch = mockWeatherApi(8, 71);

        await fetchWeather(46.8, 8.2);
        expect(state.currentWeather).toBe('rain');
    });

    it('should keep snow when WMO code suggests snow and temperature <= 5°C', async () => {
        vi.mocked(getPlaceName).mockResolvedValue(null);
        globalThis.fetch = mockWeatherApi(2, 71);

        await fetchWeather(46.8, 8.2);
        expect(state.currentWeather).toBe('snow');
    });
});
