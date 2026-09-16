import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
    bilinearSample,
    clearRouteTerrainCache,
    prefetchRouteTerrain,
    routeTerrainLodsForPoints,
} from './routeTerrain';
import { state } from './state';
import { loadTileData, cancelTileLoad } from './tileLoader';

vi.mock('./state', () => ({
    state: {
        originTile: { x: 2126, y: 1462, z: 12 },
        PERFORMANCE_PRESET: 'balanced',
        RESOLUTION: 64,
        RELIEF_EXAGGERATION: 1.0,
    },
}));

vi.mock('./tileLoader', () => ({
    loadTileData: vi.fn(),
    cancelTileLoad: vi.fn(),
}));

// Élévation 100 m : rgb(1, 138, 136) → -10000 + 101000 * 0.1
function makePixelData(r = 1, g = 138, b = 136): ArrayBuffer {
    const buf = new ArrayBuffer(256 * 256 * 4);
    const data = new Uint8Array(buf);
    for (let i = 0; i < 256 * 256; i++) {
        data[i * 4] = r;
        data[i * 4 + 1] = g;
        data[i * 4 + 2] = b;
        data[i * 4 + 3] = 255;
    }
    return buf;
}

const mockLoadTileData = vi.mocked(loadTileData);
const mockCancelTileLoad = vi.mocked(cancelTileLoad);

beforeEach(() => {
    clearRouteTerrainCache();
    mockLoadTileData.mockReset();
    mockCancelTileLoad.mockReset();
    mockLoadTileData.mockImplementation(async () => ({
        promise: Promise.resolve({
            pixelData: makePixelData(),
        } as any),
        taskId: 1,
    }));
});

describe('bilinearSample', () => {
    it('interpole une grille constante', () => {
        const grid = new Int16Array(4).fill(100);
        expect(bilinearSample(grid, 0, 0)).toBe(100);
        expect(bilinearSample(grid, 0.5, 0.5)).toBe(100);
        expect(bilinearSample(grid, 1, 1)).toBe(100);
    });

    it('interpole entre deux valeurs', () => {
        // grille 2×2 : 0 et 100 sur l'axe X
        const grid = Int16Array.from([0, 100, 0, 100]);
        expect(bilinearSample(grid, 0, 0)).toBe(0);
        expect(bilinearSample(grid, 1, 0)).toBe(100);
        expect(bilinearSample(grid, 0.5, 0)).toBe(50);
    });
});

describe('routeTerrainLodsForPoints', () => {
    const origin = { x: 2126, y: 1462, z: 12 };

    it('choisit le LOD le plus fin pour un petit tracé', () => {
        const points = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(500, 0, 500),
        ];
        const result = routeTerrainLodsForPoints(points, origin);
        expect(result.lod).toBe(14);
        expect(result.tiles.length).toBeGreaterThan(0);
    });

    it('descend de LOD pour rester sous le plafond de tuiles', () => {
        const originHigh = { x: 2126 * 4, y: 1462 * 4, z: 14 };
        const points: THREE.Vector3[] = [];
        for (let i = 0; i < 200; i++) {
            points.push(new THREE.Vector3(i * 2000, 0, i * 2000));
        }
        const result = routeTerrainLodsForPoints(points, originHigh, 64);
        expect(result.lod).toBeLessThan(14);
        expect(result.tiles.length).toBeLessThanOrEqual(64);
    });
});

describe('prefetchRouteTerrain', () => {
    it('est désactivé en preset eco', async () => {
        (state as any).PERFORMANCE_PRESET = 'eco';
        const points = [new THREE.Vector3(0, 0, 0)];
        const sampler = await prefetchRouteTerrain(points);
        expect(sampler).toBeNull();
        expect(mockLoadTileData).not.toHaveBeenCalled();
        (state as any).PERFORMANCE_PRESET = 'balanced';
    });

    it('précharge les tuiles et échantillonne l’altitude', async () => {
        const points = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(500, 0, 500),
        ];
        const sampler = await prefetchRouteTerrain(points);
        expect(sampler).not.toBeNull();
        expect(mockLoadTileData).toHaveBeenCalled();
        expect(sampler!.tileCount).toBeGreaterThan(0);
        // Altitude constante de 100 m dans la tuile préchargée
        expect(sampler!.altitudeAt(0, 0)).toBe(100);
    });

    it('renvoie null hors des tuiles préchargées', async () => {
        const points = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(500, 0, 500),
        ];
        const sampler = await prefetchRouteTerrain(points);
        expect(sampler).not.toBeNull();
        // Très loin du tracé → aucune tuile en cache
        expect(sampler!.altitudeAt(5_000_000, 5_000_000)).toBeNull();
    });
});
