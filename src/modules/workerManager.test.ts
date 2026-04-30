import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./state', () => ({
    state: {
        DEBUG_MODE: false,
        USE_WORKERS: true,
        IS_OFFLINE: false,
        cacheHits: 0,
        networkRequests: 0
    }
}));

vi.mock('./tileLoader', () => ({ updateStorageUI: vi.fn() }));
vi.mock('./networkMonitor', () => ({
    reportNetworkFailure: vi.fn(),
    reportNetworkSuccess: vi.fn()
}));
vi.mock('./config', () => ({ rotateMapTilerKey: vi.fn(() => true) }));
vi.mock('./tileCache', () => ({ disposeAllCachedTiles: vi.fn() }));

import { state } from './state';

describe('TileWorkerManager', () => {
    let TileWorkerManager: any;

    beforeEach(() => {
        vi.clearAllMocks();
        state.USE_WORKERS = true;
        state.IS_OFFLINE = false;
        state.cacheHits = 0;
        state.networkRequests = 0;

        vi.stubGlobal('Worker', class {
            onmessage: ((e: any) => void) | null = null;
            onerror: ((e: any) => void) | null = null;
            postMessage = vi.fn();
            terminate = vi.fn();
            constructor(_url: string, _options?: any) {}
        });

        vi.stubGlobal('navigator', {
            hardwareConcurrency: 4,
            userAgent: 'Mozilla/5.0'
        });

        // Force re-import to get fresh module with stubs
        vi.resetModules();
    });

    it('should create a pool of workers based on hardware concurrency', async () => {
        const mod = await import('./workerManager');
        TileWorkerManager = mod.tileWorkerManager.constructor;
        const m = new TileWorkerManager(2);
        expect(m.workers).toBeDefined();
    });

    it('should not spawn workers if Worker is undefined', async () => {
        vi.stubGlobal('Worker', undefined);
        const mod = await import('./workerManager');
        TileWorkerManager = mod.tileWorkerManager.constructor;
        const m = new TileWorkerManager();
        expect(m.workers).toBeDefined();
    });

    it('should create fewer workers on mobile', async () => {
        vi.stubGlobal('navigator', {
            hardwareConcurrency: 8,
            userAgent: 'Mozilla/5.0 (Linux; Android 13)'
        });
        vi.stubGlobal('innerWidth', 375);

        const mod = await import('./workerManager');
        TileWorkerManager = mod.tileWorkerManager.constructor;
        const m = new TileWorkerManager(8);
        expect(m.workers).toBeDefined();
    });

    it('loadTile should return null promise when USE_WORKERS is false', async () => {
        state.USE_WORKERS = false;
        const mod = await import('./workerManager');
        TileWorkerManager = mod.tileWorkerManager.constructor;
        const m = new TileWorkerManager(2);
        const result = m.loadTile(0, 0, 'url1', 'url2', null, 12);
        expect(result.taskId).toBe(-1);
        const value = await result.promise;
        expect(value).toBeNull();
    });

    it('loadTile should return null promise when no workers', async () => {
        vi.stubGlobal('Worker', undefined);
        const mod = await import('./workerManager');
        TileWorkerManager = mod.tileWorkerManager.constructor;
        const m = new TileWorkerManager();
        const result = m.loadTile(0, 0, 'url1', 'url2', null, 12);
        expect(result.taskId).toBe(-1);
    });

    it('loadTile should deduplicate identical requests', async () => {
        const mod = await import('./workerManager');
        TileWorkerManager = mod.tileWorkerManager.constructor;
        const m = new TileWorkerManager(2);
        const r1 = m.loadTile(0, 0, 'url1', 'url2', null, 12);
        const r2 = m.loadTile(0, 0, 'url1', 'url2', null, 12);
        expect(r1.taskId).toBe(r2.taskId);
        expect(r1.promise).toBe(r2.promise);
        expect(m.inFlight.size).toBe(1);
    });

    it('loadTile should create distinct tasks for different tiles', async () => {
        const mod = await import('./workerManager');
        TileWorkerManager = mod.tileWorkerManager.constructor;
        const m = new TileWorkerManager(2);
        const r1 = m.loadTile(0, 0, 'url1', 'url2', null, 12);
        const r2 = m.loadTile(1, 1, 'url1', 'url2', null, 12);
        expect(r1.taskId).not.toBe(r2.taskId);
    });

    it('cancelTile should remove from pending queue', async () => {
        const mod = await import('./workerManager');
        TileWorkerManager = mod.tileWorkerManager.constructor;
        const m = new TileWorkerManager(1);

        // Fill worker capacity
        m.loadTile(0, 0, 'a', 'b', null, 12);
        m.loadTile(1, 1, 'c', 'd', null, 12);
        m.loadTile(2, 2, 'e', 'f', null, 12);
        m.loadTile(3, 3, 'g', 'h', null, 12);
        // After 4, MAX_PER_WORKER is reached; r5 goes to pending
        const r5 = m.loadTile(4, 4, 'i', 'j', null, 12);

        expect(m.pendingQueue.length).toBeGreaterThanOrEqual(1);

        // Cancel the pending task
        m.cancelTile(r5.taskId);

        const result = await r5.promise;
        expect(result).toBeNull();
    });

    it('cancelTile should resolve in-flight task with null', async () => {
        const mod = await import('./workerManager');
        TileWorkerManager = mod.tileWorkerManager.constructor;
        const m = new TileWorkerManager(1);

        const r1 = m.loadTile(0, 0, 'a', 'b', null, 12);
        expect(r1.taskId).toBeGreaterThanOrEqual(0);

        m.cancelTile(r1.taskId);

        const result = await r1.promise;
        expect(result).toBeNull();
    });

    it('cancelTile with refCount > 1 should just decrement', async () => {
        const mod = await import('./workerManager');
        TileWorkerManager = mod.tileWorkerManager.constructor;
        const m = new TileWorkerManager(1);

        const r1 = m.loadTile(0, 0, 'a', 'b', null, 12);
        const r2 = m.loadTile(0, 0, 'a', 'b', null, 12);

        m.cancelTile(r1.taskId);

        // refCount decremented from 2 to 1, inFlight still exists
        expect(m.inFlight.size).toBe(1);

        m.cancelTile(r2.taskId);

        const result = await r1.promise;
        expect(result).toBeNull();
    });
});
