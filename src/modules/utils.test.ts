import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isPositionInSwitzerland, fetchNearbyPeaks, showToast, throttle } from './utils';

describe('utils.ts', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.clearAllTimers();
        vi.useRealTimers();
    });
    
    describe('isPositionInSwitzerland', () => {
        it('should return true for a position inside Switzerland (Spiez)', () => {
            expect(isPositionInSwitzerland(46.6863, 7.6617)).toBe(true);
        });

        it('should return false for a position outside Switzerland (Paris)', () => {
            expect(isPositionInSwitzerland(48.8566, 2.3522)).toBe(false);
        });

        it('should return true for boundaries (roughly)', () => {
            expect(isPositionInSwitzerland(46.0, 6.0)).toBe(true);
            expect(isPositionInSwitzerland(47.5, 9.0)).toBe(true);
        });
    });

    describe('fetchNearbyPeaks', () => {
        it('should return Mont Blanc when near Chamonix', async () => {
            const peaks = await fetchNearbyPeaks(45.83, 6.86);
            expect(peaks.some(p => p.name === "Mont Blanc")).toBe(true);
        });

        it('should return empty array when in the middle of the ocean', async () => {
            const peaks = await fetchNearbyPeaks(0, 0);
            expect(peaks).toHaveLength(0);
        });
    });

    describe('showToast', () => {
        beforeEach(() => {
            document.body.innerHTML = '<div id="toast-container"></div>';
            vi.useFakeTimers();
        });

        it('should add a toast to the container', () => {
            showToast('Hello Test');
            const container = document.getElementById('toast-container');
            expect(container?.children.length).toBe(1);
            expect(container?.textContent).toBe('Hello Test');
        });

        it('should limit to 2 toasts', () => {
            showToast('Toast 1');
            showToast('Toast 2');
            showToast('Toast 3');
            const container = document.getElementById('toast-container');
            expect(container?.children.length).toBe(2);
            // Verify oldest toast was removed
            expect(container?.textContent).not.toContain('Toast 1');
            expect(container?.textContent).toContain('Toast 3');
        });

        it('should remove toast after 1500ms', () => {
            showToast('Temporary Toast');
            const container = document.getElementById('toast-container');
            expect(container?.children.length).toBe(1);
            
            vi.advanceTimersByTime(1500);
            expect(container?.children.length).toBe(0);
        });
    });

    describe('throttle', () => {
        it('should only call the function once within the limit', () => {
            const func = vi.fn();
            const throttledFunc = throttle(func, 100);

            throttledFunc();
            throttledFunc();
            throttledFunc();

            expect(func).toHaveBeenCalledTimes(1);
            
            vi.advanceTimersByTime(100);
            throttledFunc();
            expect(func).toHaveBeenCalledTimes(2);
        });
    });
});
