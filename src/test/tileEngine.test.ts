import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks
vi.mock('../modules/terrain', () => ({
    activeTiles: new Map()
}));

const mockTile = (key: string, visible = true) => ({
    key,
    status: 'idle',
    worldX: 0, worldZ: 0,
    isVisible: vi.fn(() => visible),
    load: vi.fn().mockResolvedValue(undefined),
    buildMesh: vi.fn(),
});

import { state } from '../modules/state';
import { activeTiles } from '../modules/terrain';
import { loadQueue, buildQueue, addToLoadQueue, processLoadQueue, clearLoadQueue } from '../modules/terrain/tileQueue';

describe('Terrain Engine - TileQueue & Robustness (v5.29.36)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearLoadQueue();
        activeTiles.clear();
        state.isProcessingTiles = false;
        state.MAX_BUILDS_PER_CYCLE = 2;
        state.camera = { position: { x: 0, y: 100, z: 0 } } as any;
    });

    it('doit traiter les tuiles visibles en priorité', async () => {
        const t1 = mockTile('1/0/0', false) as any;
        t1.worldX = 1000;
        const t2 = mockTile('1/1/1', true) as any;
        t2.worldX = 10;
        
        activeTiles.set(t1.key, t1);
        activeTiles.set(t2.key, t2);
        addToLoadQueue(t1);
        addToLoadQueue(t2);

        await processLoadQueue();

        expect(t1.load).toHaveBeenCalled();
        expect(t2.load).toHaveBeenCalled();
        expect(loadQueue.size).toBe(0);
    });

    it('doit ignorer les tuiles qui ne sont plus actives', async () => {
        const t1 = mockTile('1/0/0') as any;
        addToLoadQueue(t1);
        
        await processLoadQueue();

        expect(t1.load).not.toHaveBeenCalled();
        expect(loadQueue.size).toBe(0);
    });

    it('doit mettre à jour state.isProcessingTiles correctement', async () => {
        const t1 = mockTile('1/0/0') as any;
        activeTiles.set(t1.key, t1);
        addToLoadQueue(t1);

        const promise = processLoadQueue();
        expect(state.isProcessingTiles).toBe(true);
        
        await promise;
        await new Promise(r => setTimeout(r, 100));
        expect(state.isProcessingTiles).toBe(false);
    });
});
