import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { addGPXLayer, removeGPXLayer, toggleGPXLayer } from './terrain';
import { state, GPX_COLORS } from './state';

const makeRawData = (pts: { lat: number; lon: number; ele: number }[]) => ({
    tracks: [{ points: pts }]
});

describe('Multi-GPX Layers (v5.10)', () => {
    beforeEach(() => {
        state.scene = new THREE.Scene();
        state.RELIEF_EXAGGERATION = 1.4;
        state.originTile = { x: 4270, y: 2891, z: 13 };
        state.camera = new THREE.PerspectiveCamera();
        state.camera.position.set(0, 10000, 0);
        state.gpxLayers = [];
        state.activeGPXLayerId = null;
    });

    describe('addGPXLayer', () => {
        it('should create a layer with correct structure', () => {
            const raw = makeRawData([
                { lat: 46.0, lon: 7.0, ele: 800 },
                { lat: 46.1, lon: 7.1, ele: 1200 }
            ]);
            const layer = addGPXLayer(raw, 'test-track');

            expect(layer.id).toBeDefined();
            expect(layer.name).toBe('test-track');
            expect(layer.visible).toBe(true);
            expect(layer.points).toHaveLength(2);
            expect(layer.mesh).toBeInstanceOf(THREE.Mesh);
            expect(layer.stats.pointCount).toBe(2);
            expect(layer.stats.dPlus).toBeGreaterThan(0);
        });

        it('should assign colors from palette by index rotation', () => {
            for (let i = 0; i < 10; i++) {
                const raw = makeRawData([
                    { lat: 46 + i * 0.01, lon: 7, ele: 100 },
                    { lat: 46 + i * 0.01 + 0.01, lon: 7.01, ele: 200 }
                ]);
                addGPXLayer(raw, `track-${i}`);
            }

            expect(state.gpxLayers).toHaveLength(10);
            // First 8 should match palette, then cycle
            for (let i = 0; i < 8; i++) {
                expect(state.gpxLayers[i].color).toBe(GPX_COLORS[i]);
            }
            expect(state.gpxLayers[8].color).toBe(GPX_COLORS[0]); // wraps
            expect(state.gpxLayers[9].color).toBe(GPX_COLORS[1]);
        });

        it('should set activeGPXLayerId to first layer', () => {
            const raw = makeRawData([
                { lat: 46, lon: 7, ele: 100 },
                { lat: 46.1, lon: 7.1, ele: 200 }
            ]);
            const layer = addGPXLayer(raw, 'first');
            expect(state.activeGPXLayerId).toBe(layer.id);
        });

        it('should calculate stats (distance, D+, D-)', () => {
            const raw = makeRawData([
                { lat: 46.0, lon: 7.0, ele: 1000 },
                { lat: 46.1, lon: 7.1, ele: 1500 },
                { lat: 46.2, lon: 7.2, ele: 1200 }
            ]);
            const layer = addGPXLayer(raw, 'stats-test');
            
            expect(layer.stats.distance).toBeGreaterThan(0);
            expect(layer.stats.dPlus).toBe(500);
            expect(layer.stats.dMinus).toBe(300);
            expect(layer.stats.pointCount).toBe(3);
        });
    });

    describe('removeGPXLayer', () => {
        it('should remove a layer from state', () => {
            const raw = makeRawData([
                { lat: 46, lon: 7, ele: 100 },
                { lat: 46.1, lon: 7.1, ele: 200 }
            ]);
            const layer = addGPXLayer(raw, 'to-remove');
            expect(state.gpxLayers).toHaveLength(1);

            removeGPXLayer(layer.id);
            expect(state.gpxLayers).toHaveLength(0);
        });

        it('should update activeGPXLayerId when active layer is removed', () => {
            const raw1 = makeRawData([{ lat: 46, lon: 7, ele: 100 }, { lat: 46.1, lon: 7.1, ele: 200 }]);
            const raw2 = makeRawData([{ lat: 47, lon: 8, ele: 100 }, { lat: 47.1, lon: 8.1, ele: 200 }]);
            
            const layer1 = addGPXLayer(raw1, 'first');
            const layer2 = addGPXLayer(raw2, 'second');
            
            state.activeGPXLayerId = layer1.id;
            removeGPXLayer(layer1.id);
            
            expect(state.activeGPXLayerId).toBe(layer2.id);
        });

        it('should set activeGPXLayerId to null when last layer removed', () => {
            const raw = makeRawData([{ lat: 46, lon: 7, ele: 100 }, { lat: 46.1, lon: 7.1, ele: 200 }]);
            const layer = addGPXLayer(raw, 'only');
            removeGPXLayer(layer.id);
            expect(state.activeGPXLayerId).toBeNull();
        });

        it('should do nothing for unknown id', () => {
            const raw = makeRawData([{ lat: 46, lon: 7, ele: 100 }, { lat: 46.1, lon: 7.1, ele: 200 }]);
            addGPXLayer(raw, 'keep');
            removeGPXLayer('nonexistent-id');
            expect(state.gpxLayers).toHaveLength(1);
        });
    });

    describe('toggleGPXLayer', () => {
        it('should toggle visibility of a layer', () => {
            const raw = makeRawData([{ lat: 46, lon: 7, ele: 100 }, { lat: 46.1, lon: 7.1, ele: 200 }]);
            const layer = addGPXLayer(raw, 'toggle-test');
            
            expect(state.gpxLayers[0].visible).toBe(true);
            toggleGPXLayer(layer.id);
            expect(state.gpxLayers[0].visible).toBe(false);
            toggleGPXLayer(layer.id);
            expect(state.gpxLayers[0].visible).toBe(true);
        });
    });
});
