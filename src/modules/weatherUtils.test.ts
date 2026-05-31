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

describe('getComfortIndex()', () => {
    it('retourne une valeur entre 0 et 10', () => {
        const score = getComfortIndex(18, 0, 0);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(10);
    });
    it('est maximal à 18°C, vent nul, UV 0', () => {
        expect(getComfortIndex(18, 0, 0)).toBe(10);
    });
    it('pénalise les températures extrêmes', () => {
        const hot = getComfortIndex(38, 0, 0);
        const cold = getComfortIndex(-2, 0, 0);
        expect(hot).toBeLessThan(10);
        expect(cold).toBeLessThan(10);
    });
    it('pénalise le vent fort', () => {
        const calm = getComfortIndex(18, 0, 0);
        const windy = getComfortIndex(18, 60, 0);
        expect(windy).toBeLessThan(calm);
    });
    it('pénalise UV > 6', () => {
        const lowUV = getComfortIndex(18, 0, 3);
        const highUV = getComfortIndex(18, 0, 8);
        expect(highUV).toBeLessThan(lowUV);
    });
    it('ne descend jamais sous 0', () => {
        expect(getComfortIndex(-50, 200, 20)).toBe(0);
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
