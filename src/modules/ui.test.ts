import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { initUI, disposeUI } from './ui';

// Mock appInit call
vi.mock('./appInit', () => ({
    appInit: vi.fn().mockResolvedValue(undefined)
}));

// Mock tileLoader for interval tracking
vi.mock('./tileLoader', () => ({
    updateStorageUI: vi.fn()
}));

describe('ui.ts — Entry Point Orchestration', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        disposeUI();
        vi.useRealTimers();
    });

    it('should call appInit and start storage UI interval', async () => {
        const { appInit } = await import('./appInit');
        const { updateStorageUI } = await import('./tileLoader');

        await initUI();

        // 1. Verify appInit delegation
        expect(appInit).toHaveBeenCalled();

        // 2. Verify interval starting
        vi.advanceTimersByTime(2001);
        expect(updateStorageUI).toHaveBeenCalled();
    });

    it('should stop interval on dispose', async () => {
        const { updateStorageUI } = await import('./tileLoader');

        await initUI();
        disposeUI();

        vi.advanceTimersByTime(2001);
        // Should only have been called during the first interval if we didn't advance fast enough, 
        // but here we verify it stops repeating.
        vi.clearAllMocks();
        vi.advanceTimersByTime(2001);
        expect(updateStorageUI).not.toHaveBeenCalled();
    });
});
