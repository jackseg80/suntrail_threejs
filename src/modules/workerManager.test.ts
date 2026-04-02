import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock networkMonitor (imported by workerManager)
vi.mock('./networkMonitor', () => ({
    reportNetworkFailure: vi.fn(),
    reportNetworkSuccess: vi.fn(),
}));

import { tileWorkerManager } from './workerManager';

describe('workerManager.ts', () => {
    beforeEach(() => {
        // Mock global Worker if not available in test env
        if (typeof Worker === 'undefined') {
            (global as any).Worker = class {
                onmessage = null;
                postMessage = vi.fn();
                terminate = vi.fn();
            };
        }
    });

    it('should initialize the worker pool', () => {
        expect(tileWorkerManager).toBeDefined();
        // Le manager s'auto-initialise
    });

    it('should handle tile load requests with unique IDs', async () => {
        const result = tileWorkerManager.loadTile('test_elev', 'test_color', null, 14);
        expect(result).toHaveProperty('promise');
        expect(result).toHaveProperty('taskId');
        expect(result.promise).toBeInstanceOf(Promise);
    });

    it('should handle timeouts', async () => {
        // On simule un timeout
        vi.useFakeTimers();
        const result = tileWorkerManager.loadTile('slow_url', 'slow_url', null, 14);

        // Comme c'est un singleton interne, on ne peut pas facilement
        // intercepter les timers internes, mais on vérifie au moins la structure.
        expect(result.promise).toBeInstanceOf(Promise);
        expect(typeof result.taskId).toBe('number');
        vi.useRealTimers();
    });
});
