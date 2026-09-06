import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { state } from './state';
import { activeTiles, fadingOutTiles, prefetchAdjacentLODs } from './terrain';
import type { Tile } from './terrain/Tile';
import { loadQueue } from './terrain/tileQueue';
import {
    addToCache,
    disposeAllCachedTiles,
    getCacheSize,
    getTileCacheKey,
    hasInCache,
    markCacheKeyActive,
} from './tileCache';

vi.mock('./utils', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./utils')>()),
    isMobileDevice: () => true,
}));
vi.mock('./terrain/tileQueue', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./terrain/tileQueue')>()),
    processLoadQueue: vi.fn(),
}));

function cache(key: string) {
    addToCache(key, new THREE.Texture(), null, new THREE.Texture(), null, null);
}

describe('adjacent LOD prefetch with the real bounded texture cache', () => {
    beforeEach(() => {
        disposeAllCachedTiles();
        activeTiles.clear();
        fadingOutTiles.clear();
        loadQueue.clear();
        Object.assign(state, {
            camera: new THREE.PerspectiveCamera(),
            controls: { target: new THREE.Vector3() },
            originTile: { x: 68000, y: 45000, z: 17 },
            ZOOM: 17,
            RANGE: 5,
            RESOLUTION: 64,
            MAP_SOURCE: 'swisstopo',
            PERFORMANCE_PRESET: 'balanced',
            isPro: true,
            MAX_ALLOWED_ZOOM: 18,
        });
    });

    function pinVisible(count: number) {
        for (let i = 0; i < count; i++) {
            const key = `visible-${i}`;
            activeTiles.set(key, { key, zoom: 17 } as Tile);
            const cacheKey = getTileCacheKey(key, 17);
            markCacheKeyActive(cacheKey);
            cache(cacheKey);
        }
    }

    function runWaves(count: number) {
        const loaded: Tile[] = [];
        for (let wave = 0; wave < count; wave++) {
            prefetchAdjacentLODs();
            for (const tile of loadQueue) {
                loaded.push(tile);
                cache(getTileCacheKey(tile.key, tile.zoom));
                tile.onLoadSettled?.();
            }
            loadQueue.clear();
        }
        return loaded;
    }

    it('settles without repeatedly evicting its own neighbors on balanced mobile', () => {
        pinVisible(62);
        const loaded = runWaves(10);
        expect(loaded.length).toBeGreaterThan(0);
        expect(loaded.length).toBeLessThanOrEqual(58);
        expect(new Set(loaded.map((tile) => tile.key)).size).toBe(
            loaded.length
        );
        expect(new Set(loaded.map((tile) => tile.zoom))).toEqual(
            new Set([16, 18])
        );
        expect(getCacheSize()).toBeLessThanOrEqual(120);
        for (const tile of activeTiles.values()) {
            expect(hasInCache(getTileCacheKey(tile.key, tile.zoom))).toBe(true);
        }
        expect(runWaves(3)).toHaveLength(0);

        state.controls!.target.x += 10_000;
        expect(runWaves(4).length).toBeGreaterThan(0);
        expect(runWaves(3)).toHaveLength(0);
    });

    it('does not compete with visible tiles when they consume the entire budget', () => {
        pinVisible(120);
        expect(runWaves(3)).toHaveLength(0);
        expect(getCacheSize()).toBe(120);
    });

    it('reserves space for visible tiles that have not completed their load', () => {
        for (let i = 0; i < 120; i++) {
            const key = `pending-${i}`;
            activeTiles.set(key, { key, zoom: 17 } as Tile);
        }
        expect(runWaves(3)).toHaveLength(0);
    });

    it('keeps the Free zoom cap when selecting neighbors', () => {
        state.isPro = false;
        state.ZOOM = 14;
        const loaded = runWaves(4);
        expect(loaded.length).toBeGreaterThan(0);
        expect(loaded.every((tile) => tile.zoom <= 14)).toBe(true);
    });
});
