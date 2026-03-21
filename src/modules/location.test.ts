import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { state } from './state';
import { centerOnUser, updateUserMarker } from './location';

// Mock du contexte 2D pour JSDOM
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
})) as any;

// Mock de geo.ts car on ne veut pas tester les calculs de projection ici
vi.mock('./geo', () => ({
    lngLatToWorld: vi.fn((lon, lat) => ({ x: lon * 100, z: lat * 100 })),
}));

describe('location.ts', () => {
    beforeEach(() => {
        // Reset du state
        state.userLocation = null;
        state.userHeading = null;
        state.originTile = { x: 0, y: 0, z: 12 };
        
        // Mocks Three.js de base
        state.scene = new THREE.Scene();
        state.camera = new THREE.PerspectiveCamera();
        state.camera.position.set(0, 1000, 0);
        
        // Mock des controls (OrbitControls/MapControls)
        state.controls = {
            target: new THREE.Vector3(0, 0, 0),
            update: vi.fn(),
            getAzimuthalAngle: vi.fn(() => 0),
            minPolarAngle: 0,
            maxPolarAngle: Math.PI
        } as any;

        state.userMarker = null;
        state.lastTrackingUpdate = 0;
    });

    describe('updateUserMarker', () => {
        it('should create a user marker if it doesn\'t exist', () => {
            state.userLocation = { lat: 45, lon: 6, alt: 1000 };
            updateUserMarker();
            
            expect(state.userMarker).not.toBeNull();
            expect(state.scene?.children).toContain(state.userMarker);
        });

        it('should update user marker position', () => {
            state.userLocation = { lat: 45, lon: 6, alt: 1000 };
            updateUserMarker();
            const firstPos = state.userMarker!.position.clone();

            state.userLocation = { lat: 46, lon: 7, alt: 1100 };
            updateUserMarker();
            
            expect(state.userMarker!.position.x).not.toBe(firstPos.x);
            expect(state.userMarker!.position.z).not.toBe(firstPos.z);
        });
    });

    describe('centerOnUser', () => {
        it('should do nothing if location or controls are missing', () => {
            centerOnUser(0.016);
            expect(state.controls?.update).not.toHaveBeenCalled();
        });

        it('should move camera and target towards user location', () => {
            state.userLocation = { lat: 45, lon: 6, alt: 1000 };
            state.lastTrackingUpdate = Date.now(); // Simuler un suivi actif
            
            const initialTarget = state.controls!.target.clone();
            const initialCamPos = state.camera!.position.clone();

            centerOnUser(0.1); // 100ms delta

            expect(state.controls!.target.x).not.toBe(initialTarget.x);
            expect(state.camera!.position.x).not.toBe(initialCamPos.x);
            expect(state.controls?.update).toHaveBeenCalled();
        });

        it('should rotate camera based on user heading', () => {
            state.userLocation = { lat: 45, lon: 6, alt: 1000 };
            state.userHeading = 90; // Est
            state.lastTrackingUpdate = Date.now() - 5000; // Pas initial
            
            // On place la caméra au sud de la cible
            state.camera!.position.set(0, 1500, 10); 
            state.controls!.target.set(0, 0, 0);

            centerOnUser(0.1);

            // On s'attend à ce que la position X ou Z de la caméra ait changé pour s'aligner sur le heading
            expect(state.camera!.position.x).not.toBe(0);
        });

        it('should handle "isInitial" state with faster lerp and zoom adjustment', () => {
            state.userLocation = { lat: 45, lon: 6, alt: 1000 };
            state.lastTrackingUpdate = Date.now(); // "Initial" car < 3s
            
            state.camera!.position.set(0, 10000, 0); // Très loin
            
            centerOnUser(0.5);

            // La distance devrait avoir significativement diminué
            const dist = state.camera!.position.distanceTo(state.controls!.target);
            expect(dist).toBeLessThan(10000);
        });
    });
});
