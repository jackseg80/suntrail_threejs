import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initUI, disposeUI } from './ui';

// Mock appInit call
vi.mock('./appInit', () => ({
    appInit: vi.fn().mockResolvedValue(undefined),
}));

describe('ui.ts — Entry Point Orchestration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        disposeUI();
    });

    it('delegates startup to appInit', async () => {
        const { appInit } = await import('./appInit');

        await initUI();

        expect(appInit).toHaveBeenCalled();
    });

    it('exposes a no-op disposeUI', () => {
        expect(() => disposeUI()).not.toThrow();
    });
});
