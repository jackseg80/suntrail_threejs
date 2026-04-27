import { describe, it, expect, vi, beforeEach } from 'vitest';
import { state } from './state';

// Mock de workerManager pour simuler des délais aléatoires
vi.mock('./workerManager', () => ({
    tileWorkerManager: {
        loadTile: vi.fn(() => {
            const delay = Math.random() * 50;
            return {
                promise: new Promise(resolve => setTimeout(() => resolve({
                    elevBitmap: {},
                    colorBitmap: {},
                    pixelData: new Uint8ClampedArray(10).buffer
                }), delay)),
                taskId: Math.floor(Math.random() * 1000)
            };
        }),
        cancelTile: vi.fn()
    }
}));

import { loadTileData } from './tileLoader';

describe('TileLoader Stress Test', () => {
    beforeEach(() => {
        state.USE_WORKERS = true;
        state.IS_OFFLINE = false;
    });

    it('should handle 100 concurrent tile requests without crashing', async () => {
        const requests = [];
        for (let i = 0; i < 100; i++) {
            // zoom >= 13 required for elevation usually, is2D = false
            requests.push(loadTileData(4270 + i, 2891, 13, false));
        }

        const resultsWrappers = await Promise.all(requests);
        expect(resultsWrappers.length).toBe(100);
        
        const results = await Promise.all(resultsWrappers.map(w => w.promise));
        results.forEach((res: any) => {
            expect(res).not.toBeNull();
            expect(res.elevBitmap).toBeDefined();
        });
    });

    it('should handle rapid concurrent requests', async () => {
        const requests = [];
        for (let i = 0; i < 50; i++) {
            requests.push(loadTileData(100, 100, 10, true));
        }
        const resultsWrappers = await Promise.all(requests);
        const results = await Promise.all(resultsWrappers.map(w => w.promise));
        expect(results.every((r: any) => r !== null)).toBe(true);
    });
});
