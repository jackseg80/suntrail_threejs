import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initBatteryManager } from './performance';
import { state } from './state';

describe('Performance Integration - Battery Management', () => {
    beforeEach(() => {
        // Reset state
        state.PERFORMANCE_PRESET = 'balanced';
        state.IS_BATTERY_LOW = false;
        state.SHOW_SLOPES = true;
        state.BUILDINGS_SHADOWS = true;
        vi.clearAllMocks();
    });

    it('should stay in balanced preset when battery is at 100%', async () => {
        const mockBattery = {
            level: 1.0,
            addEventListener: vi.fn(),
        };

        vi.stubGlobal('navigator', {
            getBattery: vi.fn().mockResolvedValue(mockBattery),
            userAgent: 'Mozilla/5.0',
        });

        initBatteryManager();

        // Wait for promise resolution
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(state.PERFORMANCE_PRESET).toBe('balanced');
    });

    it('should apply eco preset when battery level drops below 20%', async () => {
        let levelChangeListener: any = null;
        const mockBattery = {
            level: 0.25,
            addEventListener: vi.fn((event, listener) => {
                if (event === 'levelchange') levelChangeListener = listener;
            }),
        };

        vi.stubGlobal('navigator', {
            getBattery: vi.fn().mockResolvedValue(mockBattery),
            userAgent: 'Mozilla/5.0',
        });

        initBatteryManager();
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Initial check at 25% should not trigger eco
        expect(state.PERFORMANCE_PRESET).toBe('balanced');

        // Simulate level drop to 15%
        (mockBattery as any).level = 0.15;
        if (levelChangeListener) levelChangeListener();

        expect(state.PERFORMANCE_PRESET).toBe('eco');
        expect(state.SHOW_SLOPES).toBe(false);
        expect(state.BUILDINGS_SHADOWS).toBe(false);
    });

    it('should apply eco preset immediately if battery is already at 5% on init', async () => {
        const mockBattery = {
            level: 0.05,
            addEventListener: vi.fn(),
        };

        vi.stubGlobal('navigator', {
            getBattery: vi.fn().mockResolvedValue(mockBattery),
            userAgent: 'Mozilla/5.0',
        });

        initBatteryManager();
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(state.PERFORMANCE_PRESET).toBe('eco');
        expect(state.SHOW_SLOPES).toBe(false);
        expect(state.BUILDINGS_SHADOWS).toBe(false);
    });

    it('should flag IS_BATTERY_LOW when battery drops below 20%', async () => {
        let levelChangeListener: any = null;
        const mockBattery = {
            level: 0.25,
            addEventListener: vi.fn((event, listener) => {
                if (event === 'levelchange') levelChangeListener = listener;
            }),
        };

        vi.stubGlobal('navigator', {
            getBattery: vi.fn().mockResolvedValue(mockBattery),
            userAgent: 'Mozilla/5.0',
        });

        initBatteryManager();
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(state.IS_BATTERY_LOW).toBe(false);

        (mockBattery as any).level = 0.15;
        if (levelChangeListener) levelChangeListener();

        expect(state.IS_BATTERY_LOW).toBe(true);
        expect(state.PERFORMANCE_PRESET).toBe('eco');
    });

    it('should restore previous preset when battery recovers above 20%', async () => {
        let levelChangeListener: any = null;
        const mockBattery = {
            level: 0.25,
            addEventListener: vi.fn((event, listener) => {
                if (event === 'levelchange') levelChangeListener = listener;
            }),
        };

        vi.stubGlobal('navigator', {
            getBattery: vi.fn().mockResolvedValue(mockBattery),
            userAgent: 'Mozilla/5.0',
        });

        initBatteryManager();
        await new Promise((resolve) => setTimeout(resolve, 10));

        (mockBattery as any).level = 0.15;
        if (levelChangeListener) levelChangeListener();
        expect(state.IS_BATTERY_LOW).toBe(true);
        expect(state.PERFORMANCE_PRESET).toBe('eco');

        (mockBattery as any).level = 0.5;
        if (levelChangeListener) levelChangeListener();

        expect(state.IS_BATTERY_LOW).toBe(false);
        expect(state.PERFORMANCE_PRESET).toBe('balanced');
    });

    it('should not force eco if user was already on eco preset (manual)', async () => {
        let levelChangeListener: any = null;
        const mockBattery = {
            level: 0.25,
            addEventListener: vi.fn((event, listener) => {
                if (event === 'levelchange') levelChangeListener = listener;
            }),
        };

        vi.stubGlobal('navigator', {
            getBattery: vi.fn().mockResolvedValue(mockBattery),
            userAgent: 'Mozilla/5.0',
        });

        state.PERFORMANCE_PRESET = 'eco';
        initBatteryManager();
        await new Promise((resolve) => setTimeout(resolve, 10));

        (mockBattery as any).level = 0.1;
        if (levelChangeListener) levelChangeListener();

        expect(state.IS_BATTERY_LOW).toBe(true);
        expect(state.PERFORMANCE_PRESET).toBe('eco');
    });
});
