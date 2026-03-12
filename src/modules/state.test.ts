import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { state } from './state';

describe('state.ts', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should have a default TARGET_LAT and TARGET_LON (Spiez)', () => {
        expect(state.TARGET_LAT).toBe(46.6863);
        expect(state.TARGET_LON).toBe(7.6617);
    });

    it('should have initial three.js instances as null', () => {
        expect(state.scene).toBeNull();
        expect(state.camera).toBeNull();
        expect(state.renderer).toBeNull();
    });
});
