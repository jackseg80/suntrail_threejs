import { describe, it, expect, beforeEach, vi } from 'vitest';
import { showToast } from './toast';
import { debounce } from './utils';

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

    it('should debounce function calls', async () => {
        vi.useFakeTimers();
        const func = vi.fn();
        const debounced = debounce(func, 100);

        debounced();
        debounced();
        debounced();

        expect(func).not.toHaveBeenCalled();
        
        vi.advanceTimersByTime(150);
        expect(func).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});
