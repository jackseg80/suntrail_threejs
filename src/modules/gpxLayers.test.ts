import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { addGPXLayer, updateAllGPXMeshes, updateRecordedTrackMesh } from './gpxLayers';
import { state } from './state';

const rawData = {
    tracks: [{
        points: [
            { lat: 46.5000, lon: 7.5000, ele: 1000, time: '2024-01-01T10:00:00Z' },
            { lat: 46.5000, lon: 7.5000, ele: 1000, time: '2024-01-01T10:01:00Z' },
            { lat: 46.5100, lon: 7.5100, ele: 1010, time: '2024-01-01T10:20:00Z' },
            { lat: 46.5100, lon: 7.5100, ele: 1010, time: '2024-01-01T10:21:00Z' }
        ]
    }]
};

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
        const layer = addGPXLayer(rawData, 'test-track');
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
        expect(layer.stats.dPlus).toBeGreaterThan(150);
        expect(layer.stats.dMinus).toBeGreaterThan(150);
    });

    it('should use zoom-based exponential thickness (Komoot-style) for imported tracks', () => {
        state.gpxLayers = [];
        state.ZOOM = 18;
        const layerZ18 = addGPXLayer(rawData, 'z18');
        const radiusZ18 = (layerZ18.mesh!.geometry as THREE.TubeGeometry).parameters.radius;
        expect(radiusZ18).toBeCloseTo(2.0, 1); // v5.53.3 : Increased from 1.5

        state.gpxLayers = [];
        state.ZOOM = 17;
        const layerZ17 = addGPXLayer(rawData, 'z17');
        const radiusZ17 = (layerZ17.mesh!.geometry as THREE.TubeGeometry).parameters.radius;
        expect(radiusZ17).toBeCloseTo(4.0, 1);

        state.gpxLayers = [];
        state.ZOOM = 14;
        const layerZ14 = addGPXLayer(rawData, 'z14');
        const radiusZ14 = (layerZ14.mesh!.geometry as THREE.TubeGeometry).parameters.radius;
        expect(radiusZ14).toBeCloseTo(32.0, 1);

        state.gpxLayers = [];
        state.ZOOM = 10;
        const layerZ10 = addGPXLayer(rawData, 'z10');
        const radiusZ10 = (layerZ10.mesh!.geometry as THREE.TubeGeometry).parameters.radius;
        expect(radiusZ10).toBeCloseTo(200, 1);
    });

    it('should use zoom-based exponential thickness for recorded tracks', async () => {
        vi.useFakeTimers();
        state.ZOOM = 18;
        state.recordedPoints = [
            { lat: 46.5000, lon: 7.5000, alt: 1000, timestamp: 1000 },
            { lat: 46.5100, lon: 7.5100, alt: 1010, timestamp: 2000 },
            { lat: 46.5200, lon: 7.5200, alt: 1020, timestamp: 3000 }
        ];
        state.recordedMesh = new THREE.Mesh(new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0), new THREE.Vector3(1,0,1)]), 4, 5, 2, false
        ));

        updateRecordedTrackMesh();
        vi.runAllTimers();
        const radiusZ18 = (state.recordedMesh!.geometry as THREE.TubeGeometry).parameters.radius;
        expect(radiusZ18).toBeCloseTo(2.5, 1); // v5.53.3 : Increased from 2.0

        state.recordedMesh = new THREE.Mesh(new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0), new THREE.Vector3(1,0,1)]), 4, 5, 2, false
        ));
        state.ZOOM = 14;
        updateRecordedTrackMesh();
        vi.runAllTimers();
        const radiusZ14 = (state.recordedMesh!.geometry as THREE.TubeGeometry).parameters.radius;
        expect(radiusZ14).toBeCloseTo(40.0, 1);

        state.recordedMesh = new THREE.Mesh(new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0), new THREE.Vector3(1,0,1)]), 4, 5, 2, false
        ));
        state.ZOOM = 10;
        updateRecordedTrackMesh();
        vi.runAllTimers();
        const radiusZ10 = (state.recordedMesh!.geometry as THREE.TubeGeometry).parameters.radius;
        expect(radiusZ10).toBeCloseTo(250, 1);

        vi.useRealTimers();
    });

    it('updateAllGPXMeshes: should adapt RDP epsilon based on performance preset', async () => {
        const utils = await import('./utils');
        const spyRDP = vi.spyOn(utils, 'simplifyRDP');

        state.gpxLayers = [];

        addGPXLayer(rawData, 'rdp-test');
        vi.useFakeTimers();

        // 1. Test en mode ECO (Epsilon large)
        state.PERFORMANCE_PRESET = 'eco';
        updateAllGPXMeshes();
        vi.runAllTimers();
        const epsEco = spyRDP.mock.calls[spyRDP.mock.calls.length - 1][1];

        // 2. Test en mode ULTRA (Epsilon fin)
        state.PERFORMANCE_PRESET = 'ultra';
        updateAllGPXMeshes();
        vi.runAllTimers();
        const epsUltra = spyRDP.mock.calls[spyRDP.mock.calls.length - 1][1];

        expect(epsEco).toBeGreaterThan(epsUltra);
        // v5.53.4 : RDP ratio check (2.0 vs 0.5 = 4x)
        expect(epsEco / epsUltra).toBeCloseTo(4, 1);
    });
});
