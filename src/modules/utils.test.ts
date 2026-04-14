import { describe, it, expect, beforeEach, vi } from 'vitest';
import { showToast } from './toast';
import { throttle } from './utils';

describe('utils.ts', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        document.body.innerHTML = '<div id="toast-container"></div>';
    });

    it('should show toast message', () => {
        showToast("Hello");
        const toast = document.querySelector('.toast');
        expect(toast).not.toBeNull();
        expect(toast?.textContent).toContain("Hello");
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
