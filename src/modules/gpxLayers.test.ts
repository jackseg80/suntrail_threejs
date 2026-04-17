import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { addGPXLayer } from './terrain';
import { state } from './state';

describe('Multi-GPX Layers (v5.10)', () => {
    beforeEach(() => {
        state.gpxLayers = [];
        state.scene = new THREE.Scene();
        state.scene.add = vi.fn();
        state.scene.remove = vi.fn();
        
        state.originTile = { x: 2130, y: 1445, z: 12 };
        state.camera = new THREE.PerspectiveCamera();
        state.camera.position.set(0, 1000, 0);
    });

    it('addGPXLayer: should create a layer with correct structure', () => {
        const raw = {
            tracks: [{
                points: [
                    { lat: 46.5000, lon: 7.5000, ele: 1000, time: '2024-01-01T10:00:00Z' },
                    { lat: 46.5000, lon: 7.5000, ele: 1000, time: '2024-01-01T10:01:00Z' },
                    { lat: 46.5100, lon: 7.5100, ele: 1010, time: '2024-01-01T10:20:00Z' },
                    { lat: 46.5100, lon: 7.5100, ele: 1010, time: '2024-01-01T10:21:00Z' }
                ]
            }]
        };

        const layer = addGPXLayer(raw, 'test-track');
        expect(layer.name).toBe('test-track');
        expect(layer.stats.pointCount).toBe(4);
        expect(layer.stats.dPlus).toBeGreaterThan(5);
        expect(state.scene!.add).toHaveBeenCalled();
    });

    it('addGPXLayer: should calculate stats (distance, D+, D-) with larger variations', () => {
        const raw = {
            tracks: [{
                points: [
                    { lat: 46.5000, lon: 7.5000, ele: 1000, time: '2024-01-01T10:00:00Z' },
                    { lat: 46.5000, lon: 7.5000, ele: 1000, time: '2024-01-01T10:01:00Z' },
                    { lat: 46.5000, lon: 7.5000, ele: 1000, time: '2024-01-01T10:02:00Z' },
                    { lat: 46.5001, lon: 7.5001, ele: 1500, time: '2024-01-01T10:10:00Z' },
                    { lat: 46.5001, lon: 7.5001, ele: 1500, time: '2024-01-01T10:11:00Z' },
                    { lat: 46.5001, lon: 7.5001, ele: 1500, time: '2024-01-01T10:12:00Z' },
                    { lat: 46.5002, lon: 7.5002, ele: 1200, time: '2024-01-01T10:20:00Z' },
                    { lat: 46.5002, lon: 7.5002, ele: 1200, time: '2024-01-01T10:21:00Z' },
                    { lat: 46.5002, lon: 7.5002, ele: 1200, time: '2024-01-01T10:22:00Z' }
                ]
            }]
        };

        const layer = addGPXLayer(raw, 'stats-test');
        expect(layer.stats.distance).toBeGreaterThan(0);
        // v5.29.28: Le lissage 5-pts réduit les pics sur les traces courtes.
        expect(layer.stats.dPlus).toBeGreaterThan(150);
        expect(layer.stats.dMinus).toBeGreaterThan(150);
    });
});
