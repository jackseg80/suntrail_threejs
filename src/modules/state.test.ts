import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state, PRESETS } from './state';

describe('state.ts', () => {
    beforeEach(() => {
        vi.resetModules();
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

    it('should have new performance parameters defined (v5.4.1)', () => {
        expect(state.VEGETATION_DENSITY).toBeDefined();
        expect(state.BUILDING_LIMIT).toBeDefined();
        expect(state.MAX_BUILDS_PER_CYCLE).toBeDefined();
        expect(state.LOAD_DELAY_FACTOR).toBeDefined();
    });

    it('should have battery optimization parameters defined (v4.5.52)', () => {
        expect(state.ENERGY_SAVER).toBe(false);
    });

    describe('PRESETS', () => {
        it('should have an ultra preset with high range and resolution', () => {
            expect(PRESETS.ultra.RANGE).toBe(12);
            expect(PRESETS.ultra.RESOLUTION).toBe(256);
            expect(PRESETS.ultra.VEGETATION_DENSITY).toBe(12000);
        });

        it('should have an eco preset with disabled details', () => {
            expect(PRESETS.eco.SHOW_VEGETATION).toBe(false);
            expect(PRESETS.eco.SHOW_BUILDINGS).toBe(false);
            expect(PRESETS.eco.RANGE).toBe(3);
        });

        it('should have a balanced preset with 64 resolution', () => {
            expect(PRESETS.balanced.RESOLUTION).toBe(64);
        });

        it('should have a performance preset with 160 resolution', () => {
            expect(PRESETS.performance.RESOLUTION).toBe(160);
            expect(PRESETS.performance.RANGE).toBe(8);
        });
    });

    it('should have USE_WORKERS enabled by default (v5.0.1)', () => {
        expect(state.USE_WORKERS).toBe(true);
    });
});
