import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { initControls, initCamera } from './cameraManager';
import { state } from './state';

// Mock de MapControls
vi.mock('three/examples/jsm/controls/MapControls.js', () => {
    return {
        MapControls: class {
            target = new THREE.Vector3();
            enableDamping = false;
            dampingFactor = 0;
            screenSpacePanning = false;
            minDistance = 0;
            maxDistance = 0;
            maxPolarAngle = 0;
            update = vi.fn();
            addEventListener = vi.fn();
        }
    };
});

describe('cameraManager.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.camera = null;
        state.controls = null;
    });

    it('should initialize PerspectiveCamera correctly', () => {
        const camera = initCamera();
        expect(camera).toBeInstanceOf(THREE.PerspectiveCamera);
        expect(camera.far).toBe(4000000);
        expect(state.camera).toBe(camera);
    });

    it('should initialize MapControls with correct limits and position', () => {
        const camera = new THREE.PerspectiveCamera();
        const domElement = document.createElement('div');
        
        const controls = initControls(camera, domElement);
        
        expect(controls).toBeDefined();
        expect(controls.maxDistance).toBe(4000000); // Pour LOD 6
        expect(controls.screenSpacePanning).toBe(false); // Mode carte
        
        // Vérifier la position initiale (LOD 6 ~ 2000km)
        expect(camera.position.y).toBe(2000000);
        expect(state.controls).toBe(controls);
    });
});
