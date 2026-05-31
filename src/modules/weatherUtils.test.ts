import { describe, it, expect } from 'vitest';
import {
    getUVCategory,
    getComfortIndex,
    getFreezingAlert,
    fmtWindDir,
} from './weatherUtils';

describe('getUVCategory()', () => {
    it('retourne "low" pour UV ≤ 2', () => {
        expect(getUVCategory(0)).toBe('low');
        expect(getUVCategory(2)).toBe('low');
    });
    it('retourne "moderate" pour UV 3-5', () => {
        expect(getUVCategory(3)).toBe('moderate');
        expect(getUVCategory(5)).toBe('moderate');
    });
    it('retourne "high" pour UV 6-7', () => {
        expect(getUVCategory(6)).toBe('high');
        expect(getUVCategory(7)).toBe('high');
    });
    it('retourne "veryHigh" pour UV 8-10', () => {
        expect(getUVCategory(8)).toBe('veryHigh');
        expect(getUVCategory(10)).toBe('veryHigh');
    });
    it('retourne "extreme" pour UV > 10', () => {
        expect(getUVCategory(11)).toBe('extreme');
        expect(getUVCategory(20)).toBe('extreme');
    });
});

const PERFECT = { h: 50, pp: 0 }; // humidity 50%, precip 0%

describe('getComfortIndex()', () => {
    it('retourne une valeur entre 0 et 10', () => {
        const score = getComfortIndex(18, 0, 0, PERFECT.h, PERFECT.pp);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(10);
    });
    it('est maximal à 18°C, vent nul, UV 0, humidité 50%, pas de pluie', () => {
        expect(getComfortIndex(18, 0, 0, PERFECT.h, PERFECT.pp)).toBe(10);
    });
    it('pénalise la chaleur plus fortement que le froid (asymétrique)', () => {
        const hot = getComfortIndex(38, 0, 0, 30, 0);
        const cold = getComfortIndex(-2, 0, 0, PERFECT.h, PERFECT.pp);
        expect(hot).toBeLessThan(cold);
    });
    it('amplifie la pénalité chaleur avec une humidité élevée', () => {
        const dryHot = getComfortIndex(35, 0, 0, 30, 0);
        const humidHot = getComfortIndex(35, 0, 0, 90, 0);
        expect(humidHot).toBeLessThan(dryHot);
    });
    it('pénalise le vent fort', () => {
        const calm = getComfortIndex(18, 0, 0, PERFECT.h, PERFECT.pp);
        const windy = getComfortIndex(18, 60, 0, PERFECT.h, PERFECT.pp);
        expect(windy).toBeLessThan(calm);
    });
    it('pénalise les rafales en plus du vent moyen', () => {
        const steady = getComfortIndex(18, 20, 0, PERFECT.h, PERFECT.pp, 20);
        const gusty = getComfortIndex(18, 20, 0, PERFECT.h, PERFECT.pp, 60);
        expect(gusty).toBeLessThan(steady);
    });
    it('pénalise UV progressivement à partir de 3', () => {
        const uv3 = getComfortIndex(18, 0, 3, PERFECT.h, PERFECT.pp);
        const uv8 = getComfortIndex(18, 0, 8, PERFECT.h, PERFECT.pp);
        const uv12 = getComfortIndex(18, 0, 12, PERFECT.h, PERFECT.pp);
        expect(uv3).toBe(10); // seuil : 3 ne pénalise pas
        expect(uv8).toBeLessThan(uv3);
        expect(uv12).toBeLessThan(uv8);
    });
    it('pénalise la probabilité de pluie', () => {
        const dry = getComfortIndex(18, 0, 0, PERFECT.h, 0);
        const drizzle = getComfortIndex(18, 0, 0, PERFECT.h, 30);
        const rain = getComfortIndex(18, 0, 0, PERFECT.h, 80);
        expect(drizzle).toBeLessThan(dry);
        expect(rain).toBeLessThan(drizzle);
    });
    it('ne descend jamais sous 0', () => {
        expect(getComfortIndex(-50, 200, 20, 100, 100, 200)).toBe(0);
    });
});

describe('getComfortIndex() — extended parameters', () => {
    const BASE = {
        temp: 18,
        wind: 9,
        uv: 3,
        humidity: 81,
        precProb: 53,
        windGusts: 21,
    };

    it('orage (code 95) + visibilité 1km + couverture 100% → score faible', () => {
        const score = getComfortIndex(
            BASE.temp,
            BASE.wind,
            BASE.uv,
            BASE.humidity,
            BASE.precProb,
            BASE.windGusts,
            95,
            1,
            100
        );
        expect(score).toBeLessThan(3);
    });

    it('orage seul (code 95) pénalise significativement', () => {
        const withStorm = getComfortIndex(18, 0, 0, 50, 0, undefined, 95);
        const withoutStorm = getComfortIndex(18, 0, 0, 50, 0);
        expect(withStorm).toBeLessThan(withoutStorm);
        expect(withStorm).toBe(7); // 10 - 3
    });

    it('visibilité < 0.5 km → -2 points', () => {
        const lowVis = getComfortIndex(
            18,
            0,
            0,
            50,
            0,
            undefined,
            undefined,
            0.3
        );
        const clearVis = getComfortIndex(18, 0, 0, 50, 0);
        expect(lowVis).toBeLessThan(clearVis);
        expect(lowVis).toBe(8);
    });

    it('couverture nuageuse > 90% → -1 point', () => {
        const overcast = getComfortIndex(
            18,
            0,
            0,
            50,
            0,
            undefined,
            undefined,
            undefined,
            100
        );
        const clear = getComfortIndex(18, 0, 0, 50, 0);
        expect(overcast).toBeLessThan(clear);
        expect(overcast).toBe(9);
    });

    it('humidité 81% → pénalité directe', () => {
        const humid = getComfortIndex(18, 0, 0, 81, 0);
        const dry = getComfortIndex(18, 0, 0, 50, 0);
        expect(humid).toBeLessThan(dry);
        // (81-70)*0.03 = 0.33 → 10 - 0.33 ≈ 9.67
        expect(humid).toBeCloseTo(9.67, 1);
    });

    it('tous les nouveaux paramètres sont optionnels (rétrocompatibilité)', () => {
        expect(() => getComfortIndex(18, 0, 0, 50, 0)).not.toThrow();
        expect(() => getComfortIndex(18, 0, 0, 50, 0, 10)).not.toThrow();
    });
});

describe('getFreezingAlert()', () => {
    it('retourne "aboveFreezing" si altitude > niveau de gel', () => {
        expect(getFreezingAlert(2000, 1500)).toBe('aboveFreezing');
    });
    it('retourne "nearFreezing" si altitude + 300 > niveau de gel', () => {
        expect(getFreezingAlert(1300, 1500)).toBe('nearFreezing');
    });
    it('retourne "belowFreezing" si altitude + 300 ≤ niveau de gel', () => {
        expect(getFreezingAlert(1000, 1500)).toBe('belowFreezing');
    });
    it('cas limite : altitude exactement égale au niveau de gel → nearFreezing (> strict)', () => {
        expect(getFreezingAlert(1500, 1500)).toBe('nearFreezing');
    });
    it('cas limite : alt + 300 exactement égal au niveau de gel → belowFreezing (> strict)', () => {
        expect(getFreezingAlert(1200, 1500)).toBe('belowFreezing');
    });
});

describe('fmtWindDir()', () => {
    it('retourne "N" pour 0°', () => expect(fmtWindDir(0)).toBe('N'));
    it('retourne "NE" pour 45°', () => expect(fmtWindDir(45)).toBe('NE'));
    it('retourne "E" pour 90°', () => expect(fmtWindDir(90)).toBe('E'));
    it('retourne "SE" pour 135°', () => expect(fmtWindDir(135)).toBe('SE'));
    it('retourne "S" pour 180°', () => expect(fmtWindDir(180)).toBe('S'));
    it('retourne "SW" pour 225°', () => expect(fmtWindDir(225)).toBe('SW'));
    it('retourne "W" pour 270°', () => expect(fmtWindDir(270)).toBe('W'));
    it('retourne "NW" pour 315°', () => expect(fmtWindDir(315)).toBe('NW'));
    it('gère les angles > 360°', () => expect(fmtWindDir(360)).toBe('N'));
    it('gère les angles négatifs', () => expect(fmtWindDir(-45)).toBe('NW'));
});
