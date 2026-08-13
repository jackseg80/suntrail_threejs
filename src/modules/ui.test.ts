import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { initUI, disposeUI } from './ui';

// Mock appInit call
vi.mock('./appInit', () => ({
    appInit: vi.fn().mockResolvedValue(undefined),
}));

// Mock tileLoader for interval tracking
vi.mock('./tileLoader', () => ({
    updateStorageUI: vi.fn(),
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

    it('should call appInit and paint storage UI once', async () => {
        const { appInit } = await import('./appInit');
        const { updateStorageUI } = await import('./tileLoader');

        await initUI();

        // 1. Verify appInit delegation
        expect(appInit).toHaveBeenCalled();

        expect(updateStorageUI).toHaveBeenCalledOnce();
    });

    it('does not keep a storage polling interval alive', async () => {
        const { updateStorageUI } = await import('./tileLoader');

        await initUI();
        disposeUI();

        vi.clearAllMocks();
        vi.advanceTimersByTime(2001);
        expect(updateStorageUI).not.toHaveBeenCalled();
    });
});
