import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

const { mockState, mockActiveTiles, mockCancelTileLoad } = vi.hoisted(() => {
    const state: Record<string, any> = {
        isProcessingTiles: false,
        RESOLUTION: 256,
        camera: null,
        MAX_BUILDS_PER_CYCLE: 4,
    };
    const activeTiles = new Set<string>();
    return {
        mockState: state,
        mockActiveTiles: activeTiles,
        mockCancelTileLoad: vi.fn(),
    };
});

vi.mock('../state', () => ({
    state: mockState,
}));

vi.mock('../terrain', () => ({
    activeTiles: mockActiveTiles,
}));

vi.mock('../tileLoader', () => ({
    cancelTileLoad: mockCancelTileLoad,
}));

vi.mock('three', async () => {
    const actual = await vi.importActual<typeof import('three')>('three');
    return {
        ...actual,
        Frustum: class {
            setFromProjectionMatrix = vi.fn();
            intersectsObject = vi.fn().mockReturnValue(true);
        },
        Matrix4: class {
            multiplyMatrices = vi.fn();
        },
    };
});

import {
    loadQueue,
    queueBuildMesh,
    addToLoadQueue,
    removeFromLoadQueue,
    clearLoadQueue,
    prioritizeNewZoom,
    processLoadQueue,
} from './tileQueue';
import type { Tile } from './Tile';

function makeFakeTile(key: string, zoom: number): Tile {
    const tile = {
        key,
        zoom,
        status: 'idle' as const,
        isVisible: vi.fn().mockReturnValue(true),
        load: vi.fn().mockResolvedValue(undefined),
        buildMesh: vi.fn(),
        worldX: 0,
        worldZ: 0,
    } as unknown as Tile;
    return tile;
}

describe('tileQueue', () => {
    beforeEach(() => {
        clearLoadQueue();
        vi.clearAllMocks();
        mockActiveTiles.clear();
        mockState.isProcessingTiles = false;
    });

    describe('queueBuildMesh()', () => {
        it('adds tile to build queue and starts processing', () => {
            const tile = makeFakeTile('14/0/0', 14);
            mockActiveTiles.add(tile.key);
            queueBuildMesh(tile);
            expect(mockState.isProcessingTiles).toBe(true);
        });

        it('skips disposed tiles', () => {
            const tile = makeFakeTile('14/0/0', 14);
            tile.status = 'disposed';
            mockActiveTiles.add(tile.key);
            queueBuildMesh(tile);
            expect(mockState.isProcessingTiles).toBe(false);
        });

        it('skips duplicate tiles already in build queue', () => {
            const tile = makeFakeTile('14/0/0', 14);
            mockActiveTiles.add(tile.key);
            queueBuildMesh(tile);
            const firstState = mockState.isProcessingTiles;
            queueBuildMesh(tile);
            expect(mockState.isProcessingTiles).toBe(firstState);
        });

        it('signals when the first terrain tile is built', () => {
            const raf = vi
                .spyOn(window, 'requestAnimationFrame')
                .mockImplementation((callback) => {
                    callback(0);
                    return 1;
                });
            const readyListener = vi.fn();
            window.addEventListener('suntrail:firstTileReady', readyListener, {
                once: true,
            });
            const tile = makeFakeTile('14/0/0', 14);
            mockActiveTiles.add(tile.key);

            queueBuildMesh(tile);

            expect(tile.buildMesh).toHaveBeenCalledWith(256);
            expect(readyListener).toHaveBeenCalledTimes(1);
            raf.mockRestore();
        });
    });

    describe('addToLoadQueue()', () => {
        it('adds tile to load queue', () => {
            const tile = makeFakeTile('14/0/0', 14);
            mockActiveTiles.add(tile.key);
            addToLoadQueue(tile);
            expect(loadQueue.has(tile)).toBe(true);
        });

        it('invalidates sorted cache', () => {
            const tile = makeFakeTile('14/0/0', 14);
            mockActiveTiles.add(tile.key);
            addToLoadQueue(tile);
            expect(loadQueue.has(tile)).toBe(true);
        });
    });

    describe('removeFromLoadQueue()', () => {
        it('removes tile from load queue', () => {
            const tile = makeFakeTile('14/0/0', 14);
            mockActiveTiles.add(tile.key);
            addToLoadQueue(tile);
            expect(loadQueue.has(tile)).toBe(true);
            removeFromLoadQueue(tile);
            expect(loadQueue.has(tile)).toBe(false);
        });

        it('handles removing non-existent tile', () => {
            const tile = makeFakeTile('14/0/0', 14);
            expect(() => removeFromLoadQueue(tile)).not.toThrow();
        });

        it('removes tile from build queue if present', () => {
            const tile = makeFakeTile('14/0/0', 14);
            mockActiveTiles.add(tile.key);
            queueBuildMesh(tile);
            addToLoadQueue(tile);
            removeFromLoadQueue(tile);
            expect(loadQueue.has(tile)).toBe(false);
        });
    });

    describe('clearLoadQueue()', () => {
        it('clears all tiles from both queues', () => {
            const tile1 = makeFakeTile('14/0/0', 14);
            const tile2 = makeFakeTile('14/0/1', 14);
            mockActiveTiles.add(tile1.key);
            mockActiveTiles.add(tile2.key);
            addToLoadQueue(tile1);
            addToLoadQueue(tile2);
            expect(loadQueue.size).toBe(2);
            clearLoadQueue();
            expect(loadQueue.size).toBe(0);
        });

        it('handles clearing empty queue', () => {
            expect(() => clearLoadQueue()).not.toThrow();
            expect(loadQueue.size).toBe(0);
        });
    });

    describe('prioritizeNewZoom()', () => {
        it('removes tiles of old zoom from load queue', () => {
            const tileOld = makeFakeTile('12/0/0', 12);
            const tileNew = makeFakeTile('14/0/0', 14);
            const tileParent = makeFakeTile('13/0/0', 13);
            mockActiveTiles.add(tileOld.key);
            mockActiveTiles.add(tileNew.key);
            mockActiveTiles.add(tileParent.key);
            addToLoadQueue(tileOld);
            addToLoadQueue(tileNew);
            addToLoadQueue(tileParent);

            prioritizeNewZoom(14);

            expect(loadQueue.has(tileOld)).toBe(false);
            expect(loadQueue.has(tileNew)).toBe(true);
            expect(loadQueue.has(tileParent)).toBe(true);
        });

        it('releases the dedupe key when a queued prefetch becomes obsolete', () => {
            const tile = makeFakeTile('source_0_0_12', 12);
            const settled = vi.fn();
            (tile as any).cacheOnly = true;
            (tile as any).onLoadSettled = settled;
            addToLoadQueue(tile);

            prioritizeNewZoom(14);

            expect(loadQueue.has(tile)).toBe(false);
            expect(settled).toHaveBeenCalledOnce();
        });

        it('preserves parent zoom tiles (newZoom - 1)', () => {
            const tileParent = makeFakeTile('13/0/0', 13);
            mockActiveTiles.add(tileParent.key);
            addToLoadQueue(tileParent);

            prioritizeNewZoom(14);

            expect(loadQueue.has(tileParent)).toBe(true);
        });

        it('handles empty queue', () => {
            expect(() => prioritizeNewZoom(14)).not.toThrow();
            expect(loadQueue.size).toBe(0);
        });

        it('handles zoom with no tiles in queue', () => {
            const tileOld = makeFakeTile('10/0/0', 10);
            mockActiveTiles.add(tileOld.key);
            addToLoadQueue(tileOld);

            prioritizeNewZoom(14);

            expect(loadQueue.has(tileOld)).toBe(false);
            expect(loadQueue.size).toBe(0);
        });
    });

    describe('timeout — cancelTileLoad', () => {
        it('should call cancelTileLoad when load times out', async () => {
            vi.useFakeTimers();

            const tile = makeFakeTile('14/0/0', 14);
            (tile as any).activeTaskId = 42;
            tile.load = vi.fn().mockReturnValue(new Promise(() => {}));
            mockActiveTiles.add(tile.key);
            mockState.camera = {
                projectionMatrix: new THREE.Matrix4(),
                matrixWorldInverse: new THREE.Matrix4(),
                position: { x: 0, y: 0, z: 0 },
            } as any;
            addToLoadQueue(tile);

            processLoadQueue();
            await vi.advanceTimersByTimeAsync(30000);

            expect(mockCancelTileLoad).toHaveBeenCalledWith(42);

            vi.useRealTimers();
        });
    });

    describe('cache-only prefetch', () => {
        it('clears the loading flag when a prefetch finishes after the idle timer', async () => {
            vi.useFakeTimers();
            let finish!: () => void;
            const tile = makeFakeTile('delayed-prefetch', 15);
            (tile as any).cacheOnly = true;
            vi.mocked(tile.load).mockImplementation(
                () =>
                    new Promise<void>((resolve) => {
                        finish = resolve;
                    })
            );
            addToLoadQueue(tile);
            await processLoadQueue();
            await vi.advanceTimersByTimeAsync(500);
            expect(mockState.isProcessingTiles).toBe(true);
            finish();
            await vi.advanceTimersByTimeAsync(0);
            try {
                expect(mockState.isProcessingTiles).toBe(false);
            } finally {
                vi.clearAllTimers();
                vi.useRealTimers();
            }
        });

        it('does not release another load slot when a timed-out promise settles late', async () => {
            vi.useFakeTimers();
            let finishOld!: () => void, finishNew!: () => void;
            const oldTile = makeFakeTile('old-prefetch', 15);
            const newTile = makeFakeTile('new-prefetch', 15);
            (oldTile as any).cacheOnly = (newTile as any).cacheOnly = true;
            vi.mocked(oldTile.load).mockImplementation(
                () =>
                    new Promise<void>((resolve) => {
                        finishOld = resolve;
                    })
            );
            vi.mocked(newTile.load).mockImplementation(
                () =>
                    new Promise<void>((resolve) => {
                        finishNew = resolve;
                    })
            );
            addToLoadQueue(oldTile);
            await processLoadQueue();
            await vi.advanceTimersByTimeAsync(30_000);
            addToLoadQueue(newTile);
            await processLoadQueue();
            finishOld();
            await vi.advanceTimersByTimeAsync(200);
            try {
                expect(mockState.isProcessingTiles).toBe(true);
            } finally {
                finishNew();
                await vi.advanceTimersByTimeAsync(0);
                vi.clearAllTimers();
                vi.useRealTimers();
            }
            expect(mockState.isProcessingTiles).toBe(false);
        });

        it('loads an inactive prefetch tile and releases its dedupe key', async () => {
            vi.useFakeTimers();
            const tile = makeFakeTile('source_0_0_15', 15);
            const settled = vi.fn();
            (tile as any).cacheOnly = true;
            (tile as any).onLoadSettled = settled;
            mockState.camera = null;
            addToLoadQueue(tile);

            await processLoadQueue();
            await Promise.resolve();

            expect(tile.load).toHaveBeenCalledOnce();
            expect(settled).toHaveBeenCalledOnce();
            vi.clearAllTimers();
            vi.useRealTimers();
        });
    });
});
