import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
    fetchWeather,
    tickWeatherTime,
    updateWeatherSystem,
    initWeatherSystem,
    disposeWeatherSystem,
} from './weather';
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

describe('2D weather rendering with a 3D-capable preset', () => {
    it('hides particles and stops their clock in 2D, then restores them in 3D', () => {
        const scene = new THREE.Scene();
        state.RESOLUTION = 64;
        state.SHOW_WEATHER = true;
        state.WEATHER_DENSITY = 1000;
        state.currentWeather = 'rain';
        state.IS_2D_MODE = false;
        initWeatherSystem(scene);
        const particles = scene.children.find(
            (o) => o instanceof THREE.Points
        ) as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
        try {
            updateWeatherSystem(0.05, new THREE.Vector3(0, 1500, 0));
            expect(particles.visible).toBe(true);
            state.IS_2D_MODE = true;
            updateWeatherSystem(0.05, new THREE.Vector3(0, 1500, 0));
            const time = particles.material.uniforms.uTime.value;
            tickWeatherTime(1);
            expect(particles.visible).toBe(false);
            expect(particles.material.uniforms.uTime.value).toBe(time);
            state.IS_2D_MODE = false;
            updateWeatherSystem(0.05, new THREE.Vector3(0, 1500, 0));
            expect(particles.visible).toBe(true);
            expect(state.SHOW_WEATHER).toBe(true);
            expect(state.WEATHER_DENSITY).toBe(1000);
        } finally {
            disposeWeatherSystem();
            state.IS_2D_MODE = false;
        }
    });
});

function mockWeatherApi(
    temperature: number,
    weatherCode: number,
    hourlyTemp = temperature,
    hourlyCode = weatherCode
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

    it('should classify WMO 82 (violent rain shower) as rain', async () => {
        vi.mocked(getPlaceName).mockResolvedValue(null);
        globalThis.fetch = mockWeatherApi(20, 82);

        await fetchWeather(46.8, 8.2);
        expect(state.currentWeather).toBe('rain');
    });

    it('should set WEATHER_DENSITY to 10000 for heavy codes 57, 65, 67, 75, 82', async () => {
        vi.mocked(getPlaceName).mockResolvedValue(null);
        for (const code of [57, 65, 67, 75, 82]) {
            state.currentWeather = 'clear';
            globalThis.fetch = mockWeatherApi(10, code);
            await fetchWeather(46.8, 8.2);
            expect(state.WEATHER_DENSITY).toBe(10000);
        }
    });

    it('should survive missing data.hourly without crashing', async () => {
        vi.mocked(getPlaceName).mockResolvedValue(null);
        globalThis.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('open-meteo')) {
                return Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            current: {
                                temperature_2m: 15,
                                weather_code: 61,
                                apparent_temperature: 13,
                                relative_humidity_2m: 60,
                                wind_speed_10m: 5,
                                wind_direction_10m: 90,
                                cloud_cover: 80,
                            },
                            // hourly is missing entirely
                        }),
                });
            }
            return Promise.reject(new Error('Unknown URL'));
        });

        await expect(fetchWeather(46.8, 8.2)).resolves.not.toThrow();
        expect(state.currentWeather).toBe('rain');
    });

    it('should set WEATHER_RAIN_OPACITY from state when raining', async () => {
        vi.mocked(getPlaceName).mockResolvedValue(null);
        state.WEATHER_RAIN_OPACITY = 0.42;
        globalThis.fetch = mockWeatherApi(15, 61);

        await fetchWeather(46.8, 8.2);
        expect(state.currentWeather).toBe('rain');
        // WEATHER_RAIN_OPACITY is preserved (not overwritten by fetchWeather)
        expect(state.WEATHER_RAIN_OPACITY).toBe(0.42);
    });
});

describe('tickWeatherTime', () => {
    it('should not throw when weather system is not initialized', () => {
        expect(() => tickWeatherTime(0.016)).not.toThrow();
    });

    it('should not throw with zero delta', () => {
        expect(() => tickWeatherTime(0)).not.toThrow();
    });

    it('should not throw with negative delta', () => {
        expect(() => tickWeatherTime(-1)).not.toThrow();
    });
});

describe('updateWeatherSystem', () => {
    it('should not throw when weather system is not initialized', () => {
        expect(() =>
            updateWeatherSystem(0.016, new THREE.Vector3(0, 0, 0))
        ).not.toThrow();
    });

    it('should not throw with default state values', () => {
        state.currentWeather = 'clear';
        state.WEATHER_DENSITY = 0;
        expect(() =>
            updateWeatherSystem(0.016, new THREE.Vector3(0, 0, 0))
        ).not.toThrow();
    });
});
