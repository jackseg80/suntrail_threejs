import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkPerformanceThrottle, _resetPerformanceCounters } from './performance';
import { state } from './state';
import * as THREE from 'three';

describe('Audit Performance Adaptative (v5.29.7)', () => {
    beforeEach(() => {
        _resetPerformanceCounters();
        state.isProcessingTiles = false;
        state.isFlyingTo = false;
        state.PIXEL_RATIO_LIMIT = 2.0;
        state.renderer = { setPixelRatio: vi.fn() } as any;
        vi.clearAllMocks();
    });

    it('SHOULD NOT throttle if isProcessingTiles is true', () => {
        state.isProcessingTiles = true;
        // Simuler 20 ticks à 5 FPS
        for (let i = 0; i < 20; i++) {
            checkPerformanceThrottle(5);
        }
        expect(state.PIXEL_RATIO_LIMIT).toBe(2.0);
        expect(state.renderer?.setPixelRatio).not.toHaveBeenCalled();
    });

    it('SHOULD throttle DPR to 1.0 after 10 ticks of low FPS', () => {
        state.isProcessingTiles = false;
        // Simuler 9 ticks à 5 FPS -> rien ne change
        for (let i = 0; i < 9; i++) {
            checkPerformanceThrottle(5);
        }
        expect(state.PIXEL_RATIO_LIMIT).toBe(2.0);

        // 10ème tick -> débrayage
        checkPerformanceThrottle(5);
        expect(state.PIXEL_RATIO_LIMIT).toBe(1.0);
        expect(state.renderer?.setPixelRatio).toHaveBeenCalledWith(1.0);
    });

    it('SHOULD restore original DPR after 5 ticks of high FPS', () => {
        // 1. On force le throttle
        state.PIXEL_RATIO_LIMIT = 2.0;
        for (let i = 0; i < 10; i++) checkPerformanceThrottle(5);
        expect(state.PIXEL_RATIO_LIMIT).toBe(1.0);

        // 2. Simuler remontée FPS (4 ticks -> pas encore restauré)
        for (let i = 0; i < 4; i++) checkPerformanceThrottle(60);
        expect(state.PIXEL_RATIO_LIMIT).toBe(1.0);

        // 3. 5ème tick -> restauration
        checkPerformanceThrottle(60);
        expect(state.PIXEL_RATIO_LIMIT).toBe(2.0);
        expect(state.renderer?.setPixelRatio).toHaveBeenCalledWith(2.0);
    });
});
