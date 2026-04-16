import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadTileData } from './tileLoader';
import { tileWorkerManager } from './workerManager';
import { state } from './state';
import { packManager } from './packManager';

// Mock de caches global
const mockCache = {
    put: vi.fn(() => new Promise(resolve => setTimeout(resolve, 200))), // 200ms de délai simulé (bien au-dessus de 50ms)
    match: vi.fn()
};

global.caches = {
    open: vi.fn().mockResolvedValue(mockCache),
    delete: vi.fn(),
    has: vi.fn(),
    keys: vi.fn(),
    match: vi.fn()
} as any;

// Mock du worker manager
vi.mock('./workerManager', () => ({
    tileWorkerManager: {
        loadTile: vi.fn(() => ({
            promise: Promise.resolve({}),
            taskId: 123
        }))
    }
}));

// Mock de packManager
vi.mock('./packManager', () => ({
    packManager: {
        hasMountedPacks: vi.fn(),
        getTileFromPacks: vi.fn()
    }
}));

describe('TileLoader Blocking Analysis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.IS_2D_MODE = false;
        state.ZOOM = 14;
        
        // Activer les packs pour entrer dans le bloc bloquant (await Promise.all)
        (packManager.hasMountedPacks as any).mockReturnValue(true);
        (packManager.getTileFromPacks as any).mockReturnValue(Promise.resolve(new Blob(['test-data'])));
    });

    it('SHOULD NOT wait for cache seeding before starting worker load', async () => {
        const startTime = Date.now();
        
        // On lance le chargement d'une tuile
        // Comme packManager.hasMountedPacks() est true, il va appeler seedPackTile -> caches.put (200ms)
        await loadTileData(4270, 2891, 14, false);
        
        const duration = Date.now() - startTime;
        
        console.log(`[TEST] Tile load initiation duration: ${duration}ms (Expected < 50ms)`);
        
        // Si c'est bloquant (v5.28.37 actuel), duration sera ~200ms
        // Si c'est corrigé, duration sera < 50ms
        expect(duration).toBeLessThan(50);
        expect(tileWorkerManager.loadTile).toHaveBeenCalled();
    });
});
