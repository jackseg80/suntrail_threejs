import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

// Mock du module three complet pour surcharger WebGLRenderer en ESM
vi.mock('three', async () => {
    const actual = await vi.importActual<typeof import('three')>('three');
    return {
        ...actual,
        WebGLRenderer: class {
            setPixelRatio() {}
            setSize() {}
            render() {}
            dispose() {}
            domElement = document.createElement('canvas');
        }
    };
});

import { initCompass, disposeCompass, isCompassAnimating, resetToNorth } from './compass';
import { state } from './state';

describe('Compass Module', () => {
    beforeEach(() => {
        document.body.innerHTML = '<canvas id="compass-canvas"></canvas>';
        disposeCompass();
        state.camera = new THREE.PerspectiveCamera();
        state.controls = { target: new THREE.Vector3(), update: vi.fn() } as any;
    });

    it('should initialize compass if canvas is present', () => {
        initCompass();
        // Le renderer et la scene doivent être créés (vérification interne via l'absence de crash et l'état)
        expect(isCompassAnimating()).toBe(false);
    });

    it('should handle resetToNorth', () => {
        initCompass();
        resetToNorth();
        expect(isCompassAnimating()).toBe(true);
    });
});
