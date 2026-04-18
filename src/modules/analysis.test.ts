import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';

// Mocks des dépendances avec vi.hoisted
const { mockActiveTiles, mockQueryTiles } = vi.hoisted(() => ({
    mockActiveTiles: new Map<string, any>(),
    mockQueryTiles: vi.fn()
}));

vi.mock('./terrain', () => ({
    activeTiles: mockActiveTiles
}));

vi.mock('./tileSpatialIndex', () => ({
    queryTiles: mockQueryTiles,
    insertTile: vi.fn(),
    removeTile: vi.fn(),
    clearIndex: vi.fn()
}));

import { getAltitudeAt, drapeToTerrain } from './analysis';
import { state } from './state';

/** Helper pour créer des données Terrain-RGB */
function encodeTerrainRGB(alt: number): { r: number, g: number, b: number } {
    const v = Math.round((alt + 10000) * 10);
    const r = Math.floor(v / 65536);
    const g = Math.floor((v % 65536) / 256);
    const b = v % 256;
    return { r, g, b };
}

describe('Analysis Module (v5.30.3)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockActiveTiles.clear();
        mockQueryTiles.mockReturnValue([]);
        state.RELIEF_EXAGGERATION = 1.0;
        state.originTile = { x: 0, y: 0, z: 0 };
    });

    describe('getAltitudeAt', () => {
        it('should perform bilinear interpolation correctly', () => {
            const pixelData = new Uint8ClampedArray(2 * 2 * 4);
            const c100 = encodeTerrainRGB(100);
            const c200 = encodeTerrainRGB(200);
            const c300 = encodeTerrainRGB(300);
            const c400 = encodeTerrainRGB(400);

            pixelData.set([c100.r, c100.g, c100.b, 255], 0);
            pixelData.set([c200.r, c200.g, c200.b, 255], 4);
            pixelData.set([c300.r, c300.g, c300.b, 255], 8);
            pixelData.set([c400.r, c400.g, c400.b, 255], 12);

            const mockTile = {
                key: 'test', status: 'loaded', zoom: 14, 
                worldX: -500, worldZ: -500, tileSizeMeters: 1000,
                pixelData, elevScale: 1.0, elevOffset: { x: 0, y: 0 },
                bounds: new THREE.Box3(new THREE.Vector3(-500, -10, -500), new THREE.Vector3(500, 10, 500))
            };
            mockQueryTiles.mockReturnValue([mockTile]);

            expect(getAltitudeAt(0, 0)).toBeCloseTo(250, 0);
            expect(getAltitudeAt(-250, -250)).toBeCloseTo(100, 0);
        });

        it('should handle relief exaggeration', () => {
            const pixelData = new Uint8ClampedArray(8); 
            const c = encodeTerrainRGB(100);
            pixelData.set([c.r, c.g, c.b, 255, c.r, c.g, c.b, 255]);

            const mockTile = {
                key: 'exag', status: 'loaded', zoom: 14, worldX: -500, worldZ: -500, tileSizeMeters: 1000,
                pixelData, elevScale: 1.0, elevOffset: { x: 0, y: 0 },
                bounds: new THREE.Box3(new THREE.Vector3(-500, -10, -500), new THREE.Vector3(500, 10, 500))
            };
            mockQueryTiles.mockReturnValue([mockTile]);

            state.RELIEF_EXAGGERATION = 2.0;
            expect(getAltitudeAt(-250, -250)).toBeCloseTo(200, 0);
        });

        it('should fallback to parent tile if high-res is loading', () => {
            const cp = encodeTerrainRGB(50);
            const parentData = new Uint8ClampedArray(4);
            parentData.set([cp.r, cp.g, cp.b, 255]);

            const parentTile = {
                key: 'parent', status: 'loaded', zoom: 13, worldX: -1000, worldZ: -1000, tileSizeMeters: 2000,
                pixelData: parentData, elevScale: 1.0, elevOffset: { x: 0, y: 0 },
                bounds: new THREE.Box3(new THREE.Vector3(-1000,-10,-1000), new THREE.Vector3(1000,10,1000))
            };

            const childTile = {
                key: 'child', status: 'loading', zoom: 14, worldX: -500, worldZ: -500, tileSizeMeters: 1000,
                pixelData: null, 
                bounds: new THREE.Box3(new THREE.Vector3(-500,-10,-500), new THREE.Vector3(500,10,500))
            };

            // queryTiles simule qu'il trouve les deux
            mockQueryTiles.mockReturnValue([parentTile, childTile]);

            // Demander un point à -750 (couvert QUE par le parent)
            expect(getAltitudeAt(-750, -750)).toBeCloseTo(50, 0);
        });
    });

    describe('drapeToTerrain', () => {
        it('should convert points correctly', () => {
            const points = [{ lat: 45, lon: 6, alt: 1000 }, { lat: 45.1, lon: 6.1, alt: 1100 }];
            const result = drapeToTerrain(points, { x: 0, y: 0, z: 13 }, 0, 30);
            expect(result.length).toBe(2);
            expect(result[0].y).toBeGreaterThanOrEqual(1000 + 30);
        });
    });
});
