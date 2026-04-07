import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initBatteryManager } from './performance';
import { state } from './state';

describe('Performance Integration - Battery Management', () => {
    beforeEach(() => {
        // Reset state
        state.PERFORMANCE_PRESET = 'balanced';
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
            userAgent: 'Mozilla/5.0'
        });

        initBatteryManager();
        
        // Wait for promise resolution
        await new Promise(resolve => setTimeout(resolve, 10));

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
            userAgent: 'Mozilla/5.0'
        });

        initBatteryManager();
        await new Promise(resolve => setTimeout(resolve, 10));

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
            userAgent: 'Mozilla/5.0'
        });

        initBatteryManager();
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(state.PERFORMANCE_PRESET).toBe('eco');
        expect(state.SHOW_SLOPES).toBe(false);
        expect(state.BUILDINGS_SHADOWS).toBe(false);
    });
});
