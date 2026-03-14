import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isPositionInSwitzerland, showToast, throttle } from './utils';

describe('utils.ts', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        document.body.innerHTML = '<div id="toast-container"></div>';
    });

    it('should correctly identify Swiss coordinates', () => {
        expect(isPositionInSwitzerland(46.8, 8.2)).toBe(true);
        expect(isPositionInSwitzerland(48.8, 2.3)).toBe(false);
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
