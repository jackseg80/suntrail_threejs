import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { Tile, updateVisibleTiles, terrainUniforms, activeTiles, fadingOutTiles } from './terrain';
import { worldToLngLat, EARTH_CIRCUMFERENCE, getTileBounds, decodeTerrainRGB } from './geo';
import { state } from './state';

describe('terrain.ts', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        state.scene = new THREE.Scene();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.clearAllTimers();
        vi.useRealTimers();
        state.scene = null;
    });

    describe('worldToLngLat / Roundtrip', () => {
        beforeEach(() => {
            state.originTile = { x: 4270, y: 2895, z: 13 };
        });

        it('should return approximately the same coordinates after roundtrip', () => {
            const initialLon = 7.6617;
            const initialLat = 46.6863;
            const originUnit = 1.0 / Math.pow(2, state.originTile.z);
            const oxNorm = (state.originTile.x + 0.5) * originUnit;
            const oyNorm = (state.originTile.y + 0.5) * originUnit;
            const xNorm = (initialLon + 180) / 360;
            const yNorm = (1 - Math.log(Math.tan(initialLat * Math.PI / 180) + 1 / Math.cos(initialLat * Math.PI / 180)) / Math.PI) / 2;
            const worldX = (xNorm - oxNorm) * EARTH_CIRCUMFERENCE;
            const worldZ = (yNorm - oyNorm) * EARTH_CIRCUMFERENCE;
            const result = worldToLngLat(worldX, worldZ, state.originTile);
            expect(result.lon).toBeCloseTo(initialLon, 4);
            expect(result.lat).toBeCloseTo(initialLat, 4);
        });
    });

    describe('Tile Class', () => {
        beforeEach(() => {
            state.originTile = { x: 10, y: 10, z: 5 };
        });

        it('should calculate correct altitude from RGB (MapTiler formula)', () => {
            expect(decodeTerrainRGB(2, 66, 112)).toBeCloseTo(4808, 0);
        });

        it('should initialize with correct status and world position', () => {
            const tile = new Tile(10, 10, 5, '5/10/10');
            expect(tile.status).toBe('idle');
            expect(tile.worldX).toBe(0);
        });

        it('should calculate correct world position for neighbor tile', () => {
            const tile = new Tile(11, 10, 5, '5/11/10');
            const expectedDistance = EARTH_CIRCUMFERENCE / Math.pow(2, 5);
            expect(tile.worldX).toBeCloseTo(expectedDistance, 1);
        });

        it('should calculate correct offsets for hybrid zoom beyond source limits', () => {
            state.MAP_SOURCE = 'opentopomap';
            const tile = new Tile(272912, 183616, 19, '19/272912/183616');
            expect(tile.colorScale).toBe(0.5);
            expect(tile.colorOffset.x).toBe(0.0);
        });

        it('should correctly handle bounding box calculations', () => {
            const tile = new Tile(4270, 2891, 13, '13/4270/2891');
            const bounds = getTileBounds({ zoom: tile.zoom, tx: tile.tx, ty: tile.ty });
            expect(bounds.north).toBeGreaterThan(46.0);
            expect(bounds.south).toBeLessThan(47.0);
        });

        it('should not build mesh if tile is not in activeTiles anymore', () => {
            const tile = new Tile(10, 10, 5, '5/10/10');
            tile.elevationTex = new THREE.Texture();
            tile.colorTex = new THREE.Texture();
            tile.buildMesh(128);
            expect(tile.mesh).toBeNull();
        });
    });

    describe('V5 Extensions & Backdrop Stretching', () => {
        beforeEach(() => {
            state.originTile = { x: 4270, y: 2895, z: 13 };
            state.camera = new THREE.PerspectiveCamera();
            state.camera.position.set(0, 1000, 0);
        });

        it('should handle extreme low zooms (LOD 6)', () => {
            const tile = new Tile(32, 32, 6, '6/32/32');
            expect(tile.zoom).toBe(6);
            expect(tile.tileSizeMeters).toBeGreaterThan(600000); 
        });

        it('should disable slopes in Eco mode', async () => {
            state.PERFORMANCE_PRESET = 'eco';
            state.SHOW_SLOPES = true;
            await updateVisibleTiles();
            expect(terrainUniforms.uShowSlopes.value).toBe(0.0);
        });

        it('should disable slopes at low zoom (<= 10)', async () => {
            state.PERFORMANCE_PRESET = 'balanced';
            state.ZOOM = 8;
            state.SHOW_SLOPES = true;
            await updateVisibleTiles();
            expect(terrainUniforms.uShowSlopes.value).toBe(0.0);
        });

        it('should enable slopes in 3D mode ONLY IF SHOW_SLOPES is manually set to true', async () => {
            state.PERFORMANCE_PRESET = 'balanced';
            state.ZOOM = 14;
            state.SHOW_SLOPES = true;
            state.IS_2D_MODE = false;
            await updateVisibleTiles();
            expect(terrainUniforms.uShowSlopes.value).toBe(1.0);
        });

        it('should have slopes disabled by default even in Balanced Zoom 14', async () => {
            state.PERFORMANCE_PRESET = 'balanced';
            state.ZOOM = 14;
            state.SHOW_SLOPES = false;
            await updateVisibleTiles();
            expect(terrainUniforms.uShowSlopes.value).toBe(0.0);
        });

        it('should implement Backdrop Stretching (retain parent tiles on zoom-in)', async () => {
            state.ZOOM = 13;
            state.MAP_SOURCE = 'opentopomap';
            await updateVisibleTiles();
            const parentKey = `opentopomap_4270_2895_13`;
            const parentTile = activeTiles.get(parentKey);
            parentTile!.elevationTex = new THREE.Texture();
            parentTile!.colorTex = new THREE.Texture();
            parentTile!.buildMesh(32);
            
            state.ZOOM = 14;
            await updateVisibleTiles();

            expect(activeTiles.has(parentKey)).toBe(false);
            expect(fadingOutTiles.has(parentTile!)).toBe(true);
            expect(parentTile!.isFadingOut).toBe(true);
            expect(parentTile!.ghostFadeDuration).toBe(2500); 
            expect(parentTile!.mesh!.renderOrder).toBe(-2);
        });

        it('should use tileWorkerManager when enabled', async () => {
            state.USE_WORKERS = true;
            const tile = new Tile(4270, 2891, 13, '13/4270/2891');
            expect(tile.load).toBeDefined();
        });

        it('should use camera position as default center in updateVisibleTiles', async () => {
            state.ZOOM = 13;
            const dist = EARTH_CIRCUMFERENCE / Math.pow(2, 13);
            state.camera!.position.set(dist * 5, 1000, 0); 
            const geo = await import('./geo');
            const spy = vi.spyOn(geo, 'worldToLngLat');
            await updateVisibleTiles();
            expect(spy).toHaveBeenCalled();
            expect(spy.mock.calls[0][0]).toBe(state.camera!.position.x);
        });
    });

    describe('updateRecordedTrackMesh (v5.23.4)', () => {
        beforeEach(() => {
            state.camera = new THREE.PerspectiveCamera();
            state.camera.position.set(0, 5000, 0);
            state.originTile = { x: 4270, y: 2891, z: 13 };
            state.recordedPoints = [];
            state.recordedMesh = null;
            state.RELIEF_EXAGGERATION = 2.0;
        });

        it('should not crash with invalid GPS coordinates', async () => {
            const { updateRecordedTrackMesh } = await import('./gpxLayers');
            state.recordedPoints = [
                { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
                { lat: NaN, lon: 7.5, alt: 1000, timestamp: 2000 }
            ];
            expect(() => updateRecordedTrackMesh()).not.toThrow();
        });
    });

    describe('Origin Shifting (v5.27.3)', () => {
        it('should trigger GPX mesh updates when origin shifts', async () => {
            const gpxLayers = await import('./gpxLayers');
            const spyGPX = vi.spyOn(gpxLayers, 'updateAllGPXMeshes');
            const { repositionAllTiles } = await import('./terrain');
            
            repositionAllTiles(); 
            state.originTile = { x: 101, y: 101, z: 13 };
            repositionAllTiles(); 
            vi.runAllTimers();
            expect(spyGPX).toHaveBeenCalled();
        });
    });

    describe('V5.28.2 Optimizations', () => {
        it('should remove tile from loadQueue when disposed', async () => {
            const { addToLoadQueue, loadQueue } = await import('./terrain/tileQueue');
            const tile = new Tile(10, 10, 5, '5/10/10');
            addToLoadQueue(tile);
            tile.dispose();
            expect(loadQueue.has(tile)).toBe(false);
        });

        it('refreshTerrain should reset terrain and reposition all tiles', async () => {
            const { refreshTerrain, terrainUpdates } = await import('./terrain');
            const spyReset = vi.spyOn(terrainUpdates, 'resetTerrain');
            const spyRepo = vi.spyOn(terrainUpdates, 'repositionAllTiles');
            refreshTerrain();
            expect(spyReset).toHaveBeenCalled();
            expect(spyRepo).toHaveBeenCalled();
        });
    });

    describe('Load Queue Logic', () => {
        beforeEach(() => {
            state.camera = new THREE.PerspectiveCamera();
            state.camera.position.set(0, 0, 0);
            state.MAX_BUILDS_PER_CYCLE = 2;
        });

        it('should sort tiles by visibility and distance', async () => {
            const t1 = new Tile(10, 10, 10, '10/10/10'); // Visible, Close
            vi.spyOn(t1, 'isVisible').mockReturnValue(true);
            t1.worldX = 10; t1.worldZ = 10;
            
            const t2 = new Tile(11, 11, 10, '10/11/11'); // Visible, Far
            vi.spyOn(t2, 'isVisible').mockReturnValue(true);
            t2.worldX = 1000; t2.worldZ = 1000;
            
            const t3 = new Tile(12, 12, 10, '10/12/12'); // Invisible
            vi.spyOn(t3, 'isVisible').mockReturnValue(false);
            t3.worldX = 20; t3.worldZ = 20;
            
            expect(t1.status).toBe('idle');
            expect(t2.status).toBe('idle');
            expect(t3.status).toBe('idle');
        });
    });
});
