import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addGPXLayer } from './terrain';
import { state } from './state';
import * as THREE from 'three';

// Mock Three.js et dependencies
vi.mock('./analysis', () => ({
    getAltitudeAt: vi.fn().mockReturnValue(100),
    findTerrainIntersection: vi.fn()
}));

vi.mock('./geo', () => ({
    lngLatToWorld: vi.fn((lon, lat) => ({ x: lon * 1000, y: 0, z: lat * 1000 })),
    worldToLngLat: vi.fn().mockReturnValue({ lat: 46, lon: 7 }),
    EARTH_CIRCUMFERENCE: 40075016.686,
    haversineDistance: (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
}));

describe('Audit Robustesse GPX (v5.29.4)', () => {
    beforeEach(() => {
        state.scene = new THREE.Scene();
        state.camera = new THREE.PerspectiveCamera();
        state.gpxLayers = [];
        state.originTile = { x: 0, y: 0, z: 0 };
    });

    it('SHOULD handle very large GPX files (50k points) without crashing', () => {
        const largePoints = [];
        for (let i = 0; i < 50000; i++) {
            largePoints.push({ lat: 46 + i * 0.0001, lon: 7 + i * 0.0001, ele: 1000 + i });
        }
        
        const rawData = {
            tracks: [{ points: largePoints }]
        };

        // On vérifie juste que l'appel ne jette pas d'erreur
        const layer = addGPXLayer(rawData as any, "Mega Track");
        expect(layer).toBeDefined();
        expect(state.gpxLayers.length).toBe(1);
        // Le nombre de segments dans TubeGeometry doit être capé à 1500
        expect((layer.mesh?.geometry as THREE.TubeGeometry).parameters.tubularSegments).toBe(1500);
    });

    it('SHOULD handle missing elevations by defaulting to 0', () => {
        const noElePoints = [
            { lat: 46.0, lon: 7.0, time: "2026-04-16T10:00:00Z" },
            { lat: 46.1, lon: 7.1, time: "2026-04-16T10:10:00Z" }
        ];
        
        const rawData = {
            tracks: [{ points: noElePoints }]
        };

        const layer = addGPXLayer(rawData as any, "Flat Track");
        expect(layer.stats.dPlus).toBe(0);
        expect(layer.stats.distance).toBeGreaterThan(0);
    });

    it('SHOULD throw error if less than 2 valid points', () => {
        const badPoints = [
            { lat: "invalid", lon: 7.0 }
        ];
        
        const rawData = {
            tracks: [{ points: badPoints }]
        };

        expect(() => addGPXLayer(rawData as any, "Bad Track")).toThrow();
    });
});
