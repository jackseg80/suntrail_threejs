import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { state, PRESETS } from './state';

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

    it('should have new performance parameters defined (v4.3.27)', () => {
        expect(state.VEGETATION_DENSITY).toBeDefined();
        expect(state.BUILDING_BATCH_SIZE).toBeDefined();
        expect(state.MAX_BUILDS_PER_CYCLE).toBeDefined();
        expect(state.LOAD_DELAY_FACTOR).toBeDefined();
    });

    describe('PRESETS', () => {
        it('should have an ultra preset with high range and resolution', () => {
            expect(PRESETS.ultra.RANGE).toBe(8);
            expect(PRESETS.ultra.RESOLUTION).toBe(256);
            expect(PRESETS.ultra.VEGETATION_DENSITY).toBe(12000);
        });

        it('should have an eco preset with disabled details', () => {
            expect(PRESETS.eco.SHOW_VEGETATION).toBe(false);
            expect(PRESETS.eco.SHOW_BUILDINGS).toBe(false);
            expect(PRESETS.eco.RANGE).toBe(2);
        });
    });
});
