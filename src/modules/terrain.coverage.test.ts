import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { state } from './state';
import {
    activeTiles,
    animateTiles,
    fadingOutTiles,
    resetTerrain,
    updateVisibleTiles,
} from './terrain';
import type { Tile } from './terrain/Tile';

vi.mock('./terrain/tileQueue', async (original) => ({
    ...(await original<typeof import('./terrain/tileQueue')>()),
    processLoadQueue: vi.fn(),
}));

function show(tile: Tile) {
    tile.mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(),
        new THREE.MeshBasicMaterial()
    );
    tile.status = 'loaded';
    tile.opacity = 1;
    tile.isFadingIn = false;
    state.scene!.add(tile.mesh);
}

describe('zoom-out coverage while replacement tiles load', () => {
    beforeEach(() => {
        resetTerrain();
        Object.assign(state, {
            scene: new THREE.Scene(),
            camera: new THREE.PerspectiveCamera(),
            controls: null,
            originTile: { x: 4270, y: 2895, z: 13 },
            ZOOM: 13,
            RANGE: 2,
            MAP_SOURCE: 'opentopomap',
            IS_2D_MODE: false,
        });
        state.camera!.position.set(0, 1000, 0);
    });
    afterEach(() => {
        resetTerrain();
        vi.restoreAllMocks();
    });

    async function zoomOut() {
        await updateVisibleTiles();
        const old = activeTiles.get('opentopomap_4270_2895_13')!;
        show(old);
        state.ZOOM = 12;
        await updateVisibleTiles();
        return { old, parent: activeTiles.get('opentopomap_2135_1447_12')! };
    }

    it.each([false, true])(
        'keeps the old image through a slow load (2D=%s)',
        async (mode2D) => {
            state.IS_2D_MODE = mode2D;
            const { old, parent } = await zoomOut();
            expect(old.mesh?.parent).toBe(state.scene);
            expect(fadingOutTiles.has(old)).toBe(true);
            for (let i = 0; i < 200; i++) animateTiles(0.1);
            expect(old.mesh?.parent).toBe(state.scene);
            expect((old.mesh!.material as THREE.Material).opacity).toBe(1);
            show(parent);
            parent.isFadingIn = true;
            parent.opacity = 0;
            animateTiles(0.05);
            expect(old.mesh?.parent).toBe(state.scene);
            parent.isFadingIn = false;
            for (let i = 0; i < 5; i++) animateTiles(0.1);
            expect(old.mesh).toBeNull();
            expect(fadingOutTiles.has(old)).toBe(false);
            expect(parent.mesh?.parent).toBe(state.scene);
        }
    );

    it('does not keep rendering solely for a waiting fallback', async () => {
        await zoomOut();
        expect(animateTiles(0.1)).toBe(false);
    });

    it('releases an uncovered fallback after its parent leaves the requested area', async () => {
        const { old, parent } = await zoomOut();
        activeTiles.delete(parent.key);
        animateTiles(0.1);
        expect(old.mesh).toBeNull();
    });

    it('bounds retained zoom-out generations during repeated zoom changes', async () => {
        const { old, parent } = await zoomOut();
        show(parent);
        state.ZOOM = 11;
        await updateVisibleTiles();
        expect(old.mesh).toBeNull();
        expect(fadingOutTiles.has(parent)).toBe(true);
        expect([...fadingOutTiles].every((tile) => tile.zoom === 12)).toBe(
            true
        );
    });
});
