import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addGPXLayer } from '../terrain';
import { state } from '../state';
import * as THREE from 'three';

// Mocks minimaux conformes TS
vi.mock('../analysis', () => ({
    getAltitudeAt: vi.fn().mockReturnValue(100),
    findTerrainIntersection: vi.fn()
}));

vi.mock('../geo', () => ({
    lngLatToWorld: vi.fn(() => new THREE.Vector3(0, 0, 0)),
    worldToLngLat: vi.fn().mockReturnValue({ lat: 46, lon: 7 }),
    EARTH_CIRCUMFERENCE: 40075016.686,
    haversineDistance: () => 1.0
}));

describe('Audit Stress Test Multi-Tracés (v5.29.25)', () => {
    beforeEach(() => {
        state.scene = new THREE.Scene();
        state.camera = new THREE.PerspectiveCamera();
        state.gpxLayers = [];
        state.originTile = { x: 4270, y: 2891, z: 14 };
        vi.clearAllMocks();
    });

    it('SHOULD handle 10 GPX layers concurrently without crashing', () => {
        const TRACK_COUNT = 10;
        const POINTS_PER_TRACK = 500;

        for (let t = 0; t < TRACK_COUNT; t++) {
            const points = [];
            for (let i = 0; i < POINTS_PER_TRACK; i++) {
                points.push({ 
                    lat: 46 + t * 0.01 + i * 0.0001, 
                    lon: 7 + t * 0.01 + i * 0.0001, 
                    ele: 1000 
                });
            }

            const rawData = {
                tracks: [{ points }]
            };

            const layer = addGPXLayer(rawData as any, `StressTrack_${t}`);
            expect(layer).toBeDefined();
            expect(layer.mesh).toBeDefined();
        }

        expect(state.gpxLayers.length).toBe(TRACK_COUNT);
    });
});
