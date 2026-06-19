import { describe, it, expect } from 'vitest';
import { getElevation, isValidGeoPoint } from './gpxTypes';

describe('getElevation()', () => {
    it('returns ele when defined and valid', () => {
        expect(getElevation({ ele: 1234 })).toBe(1234);
    });

    it('returns alt when ele is undefined', () => {
        expect(getElevation({ alt: 567 })).toBe(567);
    });

    it('returns ele over alt when both are defined', () => {
        expect(getElevation({ ele: 1000, alt: 500 })).toBe(1000);
    });

    it('returns 0 when neither ele nor alt is defined', () => {
        expect(getElevation({})).toBe(0);
    });

    it('falls back to alt when ele is NaN', () => {
        expect(getElevation({ ele: NaN, alt: 800 })).toBe(800);
    });

    it('falls back to 0 when ele is NaN and alt is NaN', () => {
        expect(getElevation({ ele: NaN, alt: NaN })).toBe(0);
    });

    it('falls back to 0 when ele is NaN and alt is undefined', () => {
        expect(getElevation({ ele: NaN })).toBe(0);
    });

    it('returns 0 when both are undefined explicitly', () => {
        expect(getElevation({ ele: undefined, alt: undefined })).toBe(0);
    });
});

describe('isValidGeoPoint()', () => {
    it('returns true for a valid point', () => {
        expect(isValidGeoPoint({ lat: 46.5, lon: 7.2 })).toBe(true);
    });

    it('returns false for null', () => {
        expect(isValidGeoPoint(null)).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(isValidGeoPoint(undefined)).toBe(false);
    });

    it('returns false for non-objects', () => {
        expect(isValidGeoPoint('string')).toBe(false);
        expect(isValidGeoPoint(42)).toBe(false);
        expect(isValidGeoPoint(true)).toBe(false);
    });

    it('returns false when lat is NaN', () => {
        expect(isValidGeoPoint({ lat: NaN, lon: 7.2 })).toBe(false);
    });

    it('returns false when lon is NaN', () => {
        expect(isValidGeoPoint({ lat: 46.5, lon: NaN })).toBe(false);
    });

    it('returns false when lat is missing', () => {
        expect(isValidGeoPoint({ lon: 7.2 })).toBe(false);
    });

    it('returns false when lon is missing', () => {
        expect(isValidGeoPoint({ lat: 46.5 })).toBe(false);
    });

    it('returns true even with extra properties', () => {
        expect(
            isValidGeoPoint({
                lat: 46.5,
                lon: 7.2,
                ele: 1200,
                time: '2025-01-01',
            })
        ).toBe(true);
    });

    it('returns false for empty object', () => {
        expect(isValidGeoPoint({})).toBe(false);
    });

    it('returns false for array (typeof array === "object")', () => {
        expect(isValidGeoPoint([46.5, 7.2])).toBe(false);
    });
});
