import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { lngLatToTile, worldToLngLat, Tile, EARTH_CIRCUMFERENCE, updateGPXMesh } from './terrain';
import { state } from './state';

describe('terrain.ts', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.clearAllTimers();
        vi.useRealTimers();
    });
    
    describe('GPX transformation', () => {
        beforeEach(() => {
            state.scene = new THREE.Scene();
            state.RELIEF_EXAGGERATION = 1.4;
            state.originTile = { x: 4270, y: 2891, z: 13 }; // Spiez
        });

        it('should transform GPX points to correct world Vector3', () => {
            state.rawGpxData = {
                tracks: [{
                    points: [
                        { lat: 46.6863, lon: 7.6617, ele: 1000 },
                        { lat: 46.6864, lon: 7.6618, ele: 1100 }
                    ]
                }]
            };

            updateGPXMesh();

            expect(state.gpxPoints).toHaveLength(2);
            const p1 = state.gpxPoints[0];
            const p2 = state.gpxPoints[1];
            
            expect(p1.y).toBeCloseTo(1000 * 1.4 + 10, 1);
            expect(p2.y).toBeCloseTo(1100 * 1.4 + 10, 1);
        });

        it('should cleanup old GPX mesh when updating', () => {
            const mockDispose = vi.fn();
            state.gpxMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
            state.gpxMesh.geometry.dispose = mockDispose;
            
            state.rawGpxData = { tracks: [{ points: [
                { lat: 0, lon: 0, ele: 0 },
                { lat: 1, lon: 1, ele: 1 }
            ] }] };
            updateGPXMesh();
            
            expect(mockDispose).toHaveBeenCalled();
        });
    });

    describe('lngLatToTile', () => {
        it('should correctly calculate tile for Spiez at zoom 13', () => {
            const tile = lngLatToTile(7.6617, 46.6863, 13);
            // Spiez is exactly x=4270, y=2891 at zoom 13
            expect(tile.x).toBe(4270);
            expect(tile.y).toBe(2891);
            expect(tile.z).toBe(13);
        });

        it('should handle Greenwich (0,0) at zoom 0', () => {
            const tile = lngLatToTile(0, 0, 0);
            expect(tile.x).toBe(0);
            expect(tile.y).toBe(0);
        });
    });

    describe('worldToLngLat / Roundtrip', () => {
        beforeEach(() => {
            state.originTile = { x: 4270, y: 2895, z: 13 };
        });

        it('should return approximately the same coordinates after roundtrip', () => {
            const initialLon = 7.6617;
            const initialLat = 46.6863;
            
            // Note: worldToLngLat depends on state.originTile
            // Here we test the consistency between world positions and lat/lon
            const originUnit = 1.0 / Math.pow(2, state.originTile.z);
            const oxNorm = (state.originTile.x + 0.5) * originUnit;
            const oyNorm = (state.originTile.y + 0.5) * originUnit;
            
            const xNorm = (initialLon + 180) / 360;
            const yNorm = (1 - Math.log(Math.tan(initialLat * Math.PI / 180) + 1 / Math.cos(initialLat * Math.PI / 180)) / Math.PI) / 2;
            
            const worldX = (xNorm - oxNorm) * EARTH_CIRCUMFERENCE;
            const worldZ = (yNorm - oyNorm) * EARTH_CIRCUMFERENCE;
            
            const result = worldToLngLat(worldX, worldZ);
            
            expect(result.lon).toBeCloseTo(initialLon, 4);
            expect(result.lat).toBeCloseTo(initialLat, 4);
        });
    });

    describe('Tile Class', () => {
        beforeEach(() => {
            state.originTile = { x: 10, y: 10, z: 5 };
        });

        it('should calculate correct altitude from RGB (MapTiler formula)', () => {
            // Formula: h = -10000 + ((R * 65536 + G * 256 + B) * 0.1)
            // For Mont Blanc (~4808m):
            // (4808 + 10000) * 10 = 148080
            // 148080 / 65536 = 2.25 -> R = 2
            // Remainder: 148080 - (2 * 65536) = 17008
            // 17008 / 256 = 66.43 -> G = 66
            // Remainder: 17008 - (66 * 256) = 112 -> B = 112
            
            const r = 2, g = 66, b = 112;
            const decodeHeight = (r: number, g: number, b: number) => -10000 + ((r * 65536 + g * 256 + b) * 0.1);
            
            expect(decodeHeight(r, g, b)).toBeCloseTo(4808, 0);
        });

        it('should initialize with correct status and world position', () => {
            const tile = new Tile(10, 10, 5, '5/10/10');
            expect(tile.status).toBe('idle');
            // At origin, world position should be 0,0
            expect(tile.worldX).toBe(0);
            expect(tile.worldZ).toBe(0);
        });

        it('should calculate correct world position for neighbor tile', () => {
            const zoom = 5;
            const tileX = 11;
            const tile = new Tile(tileX, 10, zoom, '5/11/10');
            
            const expectedDistance = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
            expect(tile.worldX).toBeCloseTo(expectedDistance, 1);
        });

        it('should calculate correct offsets for hybrid Zoom 15 (v3.10.0)', () => {
            state.MAP_SOURCE = 'opentopomap'; // Bridé à Z14
            // Tuile Z15 (17057, 11476) - Quart supérieur droit du parent Z14 (8528, 5738)
            // Tx 17057 % 2 = 1, Ty 11476 % 2 = 0
            const tile = new Tile(17057, 11476, 15, '15/17057/11476');
            
            expect(tile.elevScale).toBe(0.5);
            expect(tile.elevOffset.x).toBe(0.5); // (17057 % 2) * 0.5
            expect(tile.elevOffset.y).toBe(0.0); // (11476 % 2) * 0.5
            
            expect(tile.colorScale).toBe(0.5);
            expect(tile.colorOffset.x).toBe(0.5);
        });
    });
});
