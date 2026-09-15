import { describe, it, expect } from 'vitest';
import {
    getSolarPhase,
    SOLAR_PHASE_THRESHOLDS,
    SOLAR_PHASE_LABEL_KEYS,
} from './solarPhases';

describe('getSolarPhase', () => {
    it('classifies full day above the day threshold', () => {
        expect(getSolarPhase(6.01)).toBe('day');
        expect(getSolarPhase(45)).toBe('day');
    });

    it('classifies golden hour between golden and day thresholds', () => {
        expect(getSolarPhase(6)).toBe('golden');
        expect(getSolarPhase(0)).toBe('golden');
        expect(getSolarPhase(-3.99)).toBe('golden');
    });

    it('classifies twilight between twilight and golden thresholds', () => {
        expect(getSolarPhase(-4)).toBe('twilight');
        expect(getSolarPhase(-11.99)).toBe('twilight');
    });

    it('classifies night at or below the twilight threshold', () => {
        expect(getSolarPhase(-12)).toBe('night');
        expect(getSolarPhase(-30)).toBe('night');
    });

    it('exposes the same thresholds everywhere', () => {
        expect(SOLAR_PHASE_THRESHOLDS).toEqual({
            day: 6,
            golden: -4,
            twilight: -12,
        });
    });

    it('maps each phase to an existing i18n label key', () => {
        expect(SOLAR_PHASE_LABEL_KEYS).toEqual({
            day: 'solar.phase.day',
            golden: 'solar.phase.golden',
            twilight: 'solar.phase.twilight',
            night: 'solar.phase.night',
        });
    });
});
