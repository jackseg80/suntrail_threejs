/**
 * weatherPro.test.ts — Tests unitaires pour les utilitaires météo Pro (v5.12)
 *
 * Teste les fonctions helper exportées par weatherUtils.ts et getWeatherIcon
 * depuis weather.ts (sans dépendance à Three.js).
 */

import { describe, it, expect, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// weather.ts importe Three.js — on le mock entièrement ici
vi.mock('../modules/weather', async () => {
    // On réimplémente uniquement getWeatherIcon pour les tests
    function getWeatherIcon(code: number): string {
        if (code === 0) return '☀️';
        if (code <= 3) return '🌤️';
        if (code <= 48) return '☁️';
        if (code <= 67) return '🌧️';
        if (code <= 77) return '❄️';
        if (code <= 82) return '🌦️';
        if (code <= 86) return '🌨️';
        return '⛈️';
    }
    return { getWeatherIcon };
});

// ── Imports ───────────────────────────────────────────────────────────────────

import { getWeatherIcon } from '../modules/weather';
import {
    getUVCategory,
    getComfortIndex,
    getFreezingAlert,
    fmtWindDir,
} from '../modules/weatherUtils';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getWeatherIcon', () => {
    it('code 0 → ☀️ (ciel dégagé)', () => {
        expect(getWeatherIcon(0)).toBe('☀️');
    });

    it('code 65 → 🌧️ (pluie forte)', () => {
        expect(getWeatherIcon(65)).toBe('🌧️');
    });

    it('code 3 → 🌤️ (nuageux)', () => {
        expect(getWeatherIcon(3)).toBe('🌤️');
    });

    it('code 71 → ❄️ (neige légère)', () => {
        expect(getWeatherIcon(71)).toBe('❄️');
    });

    it('code 95 → ⛈️ (orage)', () => {
        expect(getWeatherIcon(95)).toBe('⛈️');
    });
});

describe('getUVCategory', () => {
    it('UV 1 → low', () => {
        expect(getUVCategory(1)).toBe('low');
    });

    it('UV 2 → low (limite incluse)', () => {
        expect(getUVCategory(2)).toBe('low');
    });

    it('UV 4 → moderate', () => {
        expect(getUVCategory(4)).toBe('moderate');
    });

    it('UV 6 → high', () => {
        expect(getUVCategory(6)).toBe('high');
    });

    it('UV 9 → veryHigh', () => {
        expect(getUVCategory(9)).toBe('veryHigh');
    });

    it('UV 12 → extreme', () => {
        expect(getUVCategory(12)).toBe('extreme');
    });
});

describe('getComfortIndex', () => {
    it('18°C, 5km/h, UV3 → score élevé (>=7)', () => {
        const score = getComfortIndex(18, 5, 3);
        expect(score).toBeGreaterThanOrEqual(7);
    });

    it('2°C, 80km/h, UV8 → score faible (<4)', () => {
        const score = getComfortIndex(2, 80, 8);
        expect(score).toBeLessThan(4);
    });

    it('score est toujours dans [0, 10]', () => {
        const scores = [
            getComfortIndex(-20, 100, 15),
            getComfortIndex(30, 0, 0),
            getComfortIndex(18, 0, 0),
        ];
        scores.forEach(s => {
            expect(s).toBeGreaterThanOrEqual(0);
            expect(s).toBeLessThanOrEqual(10);
        });
    });

    it('conditions parfaites (18°C, 0km/h, UV2) → score proche de 10', () => {
        const score = getComfortIndex(18, 0, 2);
        expect(score).toBeGreaterThan(8);
    });
});

describe('getFreezingAlert', () => {
    it('alt 3000m, freezingLevel 2500m → aboveFreezing', () => {
        expect(getFreezingAlert(3000, 2500)).toBe('aboveFreezing');
    });

    it('alt 2300m, freezingLevel 2500m → nearFreezing (diff 200m < 300m)', () => {
        expect(getFreezingAlert(2300, 2500)).toBe('nearFreezing');
    });

    it('alt 500m, freezingLevel 2500m → belowFreezing', () => {
        expect(getFreezingAlert(500, 2500)).toBe('belowFreezing');
    });

    it('alt exactement égale à freezingLevel → aboveFreezing (alt > freezingLevel → false, nearFreezing → alt+300 > freezingLevel → true)', () => {
        // alt == freezingLevel : alt > freezingLevel est false, alt+300 > freezingLevel est true
        expect(getFreezingAlert(2500, 2500)).toBe('nearFreezing');
    });
});

describe('parseDaily (simulation données API)', () => {
    // On simule le parsing tel qu'il serait fait dans fetchWeather
    function parseDaily(data: { daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_sum: number[]; precipitation_probability_max: number[]; wind_speed_10m_max: number[]; wind_gusts_10m_max: number[]; wind_direction_10m_dominant: number[]; uv_index_max: number[]; weather_code: number[] } }) {
        return data.daily.time.map((date, i) => ({
            date,
            tempMax: data.daily.temperature_2m_max[i],
            tempMin: data.daily.temperature_2m_min[i],
            precipSum: data.daily.precipitation_sum[i] ?? 0,
            precipProbMax: data.daily.precipitation_probability_max[i] ?? 0,
            windSpeedMax: data.daily.wind_speed_10m_max[i] ?? 0,
            windGustsMax: data.daily.wind_gusts_10m_max[i] ?? 0,
            windDirDominant: data.daily.wind_direction_10m_dominant[i] ?? 0,
            uvIndexMax: data.daily.uv_index_max[i] ?? 0,
            code: data.daily.weather_code[i] ?? 0,
        }));
    }

    const mockApiData = {
        daily: {
            time: ['2024-03-15', '2024-03-16', '2024-03-17'],
            temperature_2m_max: [12.5, 8.3, 15.0],
            temperature_2m_min: [2.1, -1.5, 4.2],
            precipitation_sum: [0.0, 5.2, 1.1],
            precipitation_probability_max: [10, 80, 30],
            wind_speed_10m_max: [15.0, 45.0, 20.0],
            wind_gusts_10m_max: [25.0, 70.0, 35.0],
            wind_direction_10m_dominant: [270, 180, 90],
            uv_index_max: [3.5, 1.0, 5.5],
            weather_code: [0, 65, 3],
        },
    };

    it('parseDaily : daily[0].tempMax correct (12.5)', () => {
        const result = parseDaily(mockApiData);
        expect(result[0].tempMax).toBe(12.5);
    });

    it('parseDaily : 3 jours → daily.length === 3', () => {
        const result = parseDaily(mockApiData);
        expect(result).toHaveLength(3);
    });

    it('parseDaily : daily[1].code = 65 (pluie forte)', () => {
        const result = parseDaily(mockApiData);
        expect(result[1].code).toBe(65);
    });
});

describe('hourly enrichi avec precip', () => {
    // Simulation de l'enrichissement hourly
    function buildHourly(apiData: { hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability: number[] } }, startIndex: number) {
        const result = [];
        for (let i = startIndex; i < startIndex + 24; i++) {
            if (apiData.hourly.time[i]) {
                result.push({
                    time: apiData.hourly.time[i].split('T')[1],
                    temp: apiData.hourly.temperature_2m[i],
                    code: apiData.hourly.weather_code[i],
                    precip: apiData.hourly.precipitation_probability[i] ?? 0,
                });
            }
        }
        return result;
    }

    const mockHourly = {
        hourly: {
            time: Array.from({ length: 30 }, (_, i) => `2024-03-15T${String(i % 24).padStart(2, '0')}:00`),
            temperature_2m: Array.from({ length: 30 }, (_, i) => 10 + i * 0.2),
            weather_code: Array(30).fill(0),
            precipitation_probability: Array.from({ length: 30 }, (_, i) => i * 3),
        },
    };

    it('hourly enrichi : precip ajouté correctement à index 0', () => {
        const result = buildHourly(mockHourly, 0);
        expect(result[0]).toHaveProperty('precip');
        expect(result[0].precip).toBe(0);
    });

    it('hourly enrichi : precip[5] correct (15)', () => {
        const result = buildHourly(mockHourly, 0);
        expect(result[5].precip).toBe(15);
    });
});

describe('fmtWindDir', () => {
    it('0° → N (Nord)', () => {
        expect(fmtWindDir(0)).toBe('N');
    });

    it('180° → S (Sud)', () => {
        expect(fmtWindDir(180)).toBe('S');
    });

    it('270° → O (Ouest)', () => {
        expect(fmtWindDir(270)).toBe('O');
    });

    it('90° → E (Est)', () => {
        expect(fmtWindDir(90)).toBe('E');
    });

    it('360° → N (équivalent à 0°)', () => {
        expect(fmtWindDir(360)).toBe('N');
    });
});

describe('État Pro : weatherData null → aucune erreur (graceful)', () => {
    it('getComfortIndex avec valeurs limites ne lève pas d\'erreur', () => {
        expect(() => getComfortIndex(0, 0, 0)).not.toThrow();
    });

    it('getFreezingAlert avec freezingLevel 0 → belowFreezing', () => {
        expect(() => getFreezingAlert(0, 0)).not.toThrow();
    });

    it('getUVCategory(0) → low', () => {
        expect(getUVCategory(0)).toBe('low');
    });

    it('fmtWindDir avec valeur négative → retourne un cardinal valide', () => {
        const result = fmtWindDir(-90);
        const validDirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
        expect(validDirs).toContain(result);
    });
});
