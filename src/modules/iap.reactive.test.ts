import { describe, it, expect, beforeEach } from 'vitest';
import { state } from './state';
import { isProActive } from './iap';

describe('PRO Logic (v5.53.6)', () => {
    beforeEach(() => {
        state.isPro = false;
    });

    it('SHOULD return false for basic users', () => {
        expect(isProActive()).toBe(false);
    });

    it('SHOULD return true if state.isPro is true', () => {
        state.isPro = true;
        expect(isProActive()).toBe(true);
    });

    it('SHOULD notify subscribers when isPro changes', async () => {
        let notified = false;
        state.subscribe('isPro', () => {
            notified = true;
        });

        state.isPro = true;
        
        // Attendre la fin de la microtask (ReactiveState utilise queueMicrotask)
        await new Promise(resolve => queueMicrotask(() => resolve(null)));
        
        expect(notified).toBe(true);
    });
});
