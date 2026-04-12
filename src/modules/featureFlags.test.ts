import { describe, it, expect, beforeEach } from 'vitest';
import { state } from './state';
import { isFeatureEnabled, getFeatureLimit } from './featureFlags';

describe('featureFlags.ts', () => {
    beforeEach(() => {
        state.isPro = false;
    });

    it('should block high zoom feature for free users', () => {
        state.isPro = false;
        expect(isFeatureEnabled('lod_high')).toBe(false);
    });

    it('should allow high zoom feature for pro users', () => {
        state.isPro = true;
        expect(isFeatureEnabled('lod_high')).toBe(true);
    });

    it('should block premium features for free users', () => {
        expect(isFeatureEnabled('satellite')).toBe(false);
        expect(isFeatureEnabled('solar_calendar')).toBe(false);
        expect(isFeatureEnabled('inclinometer')).toBe(false);
    });

    it('should allow premium features for pro users', () => {
        state.isPro = true;
        expect(isFeatureEnabled('satellite')).toBe(true);
        expect(isFeatureEnabled('solar_calendar')).toBe(true);
        expect(isFeatureEnabled('inclinometer')).toBe(true);
    });

    it('should return correct limit values', () => {
        state.isPro = false;
        expect(getFeatureLimit('lod_high', 18, 14)).toBe(14);
        
        state.isPro = true;
        expect(getFeatureLimit('lod_high', 18, 14)).toBe(18);
    });
});
