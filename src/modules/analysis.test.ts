import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { getAltitudeAt, drapeToTerrain } from './analysis';
import { state } from './state';
import { insertTile, clearIndex } from './tileSpatialIndex';

/** Helper pour créer des données Terrain-RGB */
function encodeTerrainRGB(alt: number): { r: number, g: number, b: number } {
    const v = (alt + 10000) * 10;
    const r = Math.floor(v / 65536);
    const g = Math.floor((v % 65536) / 256);
    const b = Math.floor(v % 256);
    return { r, g, b };
}

describe('Analysis Module (v5.30.3)', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        clearIndex();
        state.RELIEF_EXAGGERATION = 1.0;
        state.originTile = { x: 0, y: 0, z: 0 };
    });

    describe('getAltitudeAt', () => {
        it('should return 0 altitude if no tile is loaded', () => {
            const alt = getAltitudeAt(100, 100);
            expect(alt).toBe(0);
        });

        it('should perform bilinear interpolation correctly', () => {
            const pixelData = new Uint8ClampedArray(2 * 2 * 4);
            
            const c00 = encodeTerrainRGB(100);
            pixelData[0] = c00.r; pixelData[1] = c00.g; pixelData[2] = c00.b; pixelData[3] = 255;
            
            const c10 = encodeTerrainRGB(200);
            pixelData[4] = c10.r; pixelData[5] = c10.g; pixelData[6] = c10.b; pixelData[7] = 255;
            
            const c01 = encodeTerrainRGB(300);
            pixelData[8] = c01.r; pixelData[9] = c01.g; pixelData[10] = c01.b; pixelData[11] = 255;
            
            const c11 = encodeTerrainRGB(400);
            pixelData[12] = c11.r; pixelData[13] = c11.g; pixelData[14] = c11.b; pixelData[15] = 255;

            const mockTile = {
                key: 'test_tile',
                status: 'loaded',
                zoom: 14,
                worldX: 0,
                worldZ: 0,
                tileSizeMeters: 1000,
                pixelData: pixelData,
                bounds: new THREE.Box3(
                    new THREE.Vector3(-500, -10, -500),
                    new THREE.Vector3(500, 10, 500)
                )
            };

            insertTile(mockTile as any);

            // Test au centre exact (0,0) -> Moyenne = 250m
            expect(getAltitudeAt(0, 0)).toBeCloseTo(250, 0);

            // Test aux 4 coins internes (là où les pixels sont centrés dans leur quadrant)
            // Avec res=2, les pixels sont à -250 et +250
            expect(getAltitudeAt(-250, -250)).toBeCloseTo(100, 0);
            expect(getAltitudeAt(250, -250)).toBeCloseTo(200, 0);
            expect(getAltitudeAt(-250, 250)).toBeCloseTo(300, 0);
            expect(getAltitudeAt(250, 250)).toBeCloseTo(400, 0);
        });

        it('should handle relief exaggeration', () => {
            const pixelData = new Uint8ClampedArray(1 * 1 * 4);
            const c = encodeTerrainRGB(100);
            pixelData[0] = c.r; pixelData[1] = c.g; pixelData[2] = c.b; pixelData[3] = 255;

            const mockTile = {
                key: 'test_tile_exag',
                status: 'loaded', zoom: 14, worldX: 0, worldZ: 0, tileSizeMeters: 1000,
                pixelData: pixelData,
                bounds: new THREE.Box3(new THREE.Vector3(-500, -10, -500), new THREE.Vector3(500, 10, 500))
            };
            insertTile(mockTile as any);

            state.RELIEF_EXAGGERATION = 2.0;
            expect(getAltitudeAt(0, 0)).toBeCloseTo(200, 0);
        });

        it('should fallback to parent tile if high-res is loading', () => {
            const cp = encodeTerrainRGB(50);
            const parentTile = {
                key: 'parent', status: 'loaded', zoom: 13, worldX: 0, worldZ: 0, tileSizeMeters: 2000,
                pixelData: new Uint8ClampedArray([cp.r, cp.g, cp.b, 255]),
                bounds: new THREE.Box3(new THREE.Vector3(-1000,-10,-1000), new THREE.Vector3(1000,10,1000))
            };

            const childTile = {
                key: 'child', status: 'loading', zoom: 14, worldX: 0, worldZ: 0, tileSizeMeters: 1000,
                pixelData: null, bounds: new THREE.Box3(new THREE.Vector3(-500,-10,-500), new THREE.Vector3(500,10,500))
            };

            insertTile(parentTile as any);
            insertTile(childTile as any);

            expect(getAltitudeAt(10, 10)).toBeCloseTo(50, 0);
        });
    });

    describe('drapeToTerrain', () => {
        it('should convert and offset points correctly', () => {
            const points = [{ lat: 45, lon: 6, alt: 1000 }, { lat: 45.1, lon: 6.1, alt: 1100 }];
            const result = drapeToTerrain(points, { x: 0, y: 0, z: 13 }, 4, 30);
            expect(result.length).toBe(5);
            expect(result[0].y).toBeGreaterThanOrEqual(1000 + 30);
        });
    });
});
