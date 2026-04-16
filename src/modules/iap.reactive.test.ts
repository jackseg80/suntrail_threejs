import { describe, it, expect, beforeEach } from 'vitest';
import { state } from './state';
import { isProActive } from './iap';

describe('PRO Logic & Trials (v5.29.2)', () => {
    beforeEach(() => {
        state.isPro = false;
        state.trialEnd = null;
    });

    it('SHOULD return false for basic users', () => {
        expect(isProActive()).toBe(false);
    });

    it('SHOULD return true if state.isPro is true', () => {
        state.isPro = true;
        expect(isProActive()).toBe(true);
    });

    it('SHOULD return true if user is in trial period', () => {
        // Trial expire dans 1 heure
        state.trialEnd = Date.now() + 3600000;
        expect(isProActive()).toBe(true);
    });

    it('SHOULD return false if trial has expired', () => {
        // Trial a expiré il y a 1 heure
        state.trialEnd = Date.now() - 3600000;
        expect(isProActive()).toBe(false);
    });
});
