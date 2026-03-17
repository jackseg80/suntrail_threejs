import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isPositionInSwitzerland, isPositionInFrance, showToast, throttle } from './utils';

describe('utils.ts', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        document.body.innerHTML = '<div id="toast-container"></div>';
    });

    describe('Geographical Detection', () => {
        it('should correctly identify Swiss coordinates', () => {
            expect(isPositionInSwitzerland(46.8, 8.2)).toBe(true); // Suisse Centrale
            expect(isPositionInSwitzerland(45.9, 6.8)).toBe(false); // Chamonix (Désormais hors Suisse)
            expect(isPositionInSwitzerland(48.8, 2.3)).toBe(false); // Paris
        });

        it('should correctly identify French coordinates', () => {
            expect(isPositionInFrance(48.8, 2.3)).toBe(true); // Paris
            expect(isPositionInFrance(44.8, -0.5)).toBe(true); // Bordeaux
            expect(isPositionInFrance(52.5, 13.4)).toBe(false); // Berlin
        });
    });

    it('should show toast message', () => {
        showToast("Hello");
        const container = document.getElementById('toast-container');
        expect(container?.innerHTML).toContain("Hello");
    });

    it('should throttle function calls', async () => {
        vi.useFakeTimers();
        const func = vi.fn();
        const throttled = throttle(func, 100);

        throttled();
        throttled();
        throttled();

        expect(func).toHaveBeenCalledTimes(1);
        
        vi.advanceTimersByTime(150);
        throttled();
        expect(func).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });
});
