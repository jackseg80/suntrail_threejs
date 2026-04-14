import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state, isProActive, activateDiscoveryTrial } from './state';

describe('Discovery Trial Logic', () => {
    beforeEach(() => {
        if (state) {
            state.isPro = false;
            state.trialEnd = null;
        }
        vi.useFakeTimers();
    });

    it('should be inactive by default', () => {
        expect(isProActive()).toBe(false);
    });

    it('should be active after activation', () => {
        activateDiscoveryTrial(3);
        expect(state.trialEnd).not.toBeNull();
        expect(isProActive()).toBe(true);
    });

    it('should expire after the specified days', () => {
        activateDiscoveryTrial(3);
        expect(isProActive()).toBe(true);

        // Advance 2 days -> still active
        vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);
        expect(isProActive()).toBe(true);

        // Advance 2 more days (total 4) -> expired
        vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);
        expect(isProActive()).toBe(false);
    });

    it('isProActive should return true if state.isPro is true, even if trial is expired', () => {
        state.isPro = true;
        state.trialEnd = Date.now() - 1000; // Expired trial
        expect(isProActive()).toBe(true);
    });
});
