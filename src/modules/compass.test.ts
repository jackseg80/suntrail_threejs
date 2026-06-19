import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

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
        },
    };
});

import {
    initCompass,
    disposeCompass,
    isCompassAnimating,
    resetToNorth,
    updateCompassAnimation,
    renderCompass,
} from './compass';
import { state } from './state';

describe('Compass Module', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '<canvas id="compass-canvas"></canvas>';
        disposeCompass();
        state.camera = new THREE.PerspectiveCamera();
        state.controls = {
            target: new THREE.Vector3(),
            update: vi.fn(),
        } as any;
    });

    afterEach(() => {
        disposeCompass();
        vi.useRealTimers();
    });

    it('should initialize compass if canvas is present', () => {
        initCompass();
        expect(isCompassAnimating()).toBe(false);
    });

    it('should do nothing when canvas is missing', () => {
        document.body.innerHTML = '';
        expect(() => initCompass()).not.toThrow();
    });

    it('should do nothing when resetToNorth has null camera', () => {
        state.camera = null;
        resetToNorth();
        expect(isCompassAnimating()).toBe(false);
    });

    it('should do nothing when resetToNorth has null controls', () => {
        initCompass();
        state.controls = null as any;
        resetToNorth();
        expect(isCompassAnimating()).toBe(false);
    });

    it('should handle resetToNorth', () => {
        initCompass();
        resetToNorth();
        expect(isCompassAnimating()).toBe(true);
    });

    it('should not double-start animation when already resetting', () => {
        initCompass();
        resetToNorth();
        expect(isCompassAnimating()).toBe(true);
        resetToNorth();
        expect(isCompassAnimating()).toBe(true);
    });

    it('should complete animation after RESET_DURATION', () => {
        initCompass();
        resetToNorth();
        expect(isCompassAnimating()).toBe(true);

        vi.advanceTimersByTime(400);
        updateCompassAnimation();
        expect(isCompassAnimating()).toBe(true);

        vi.advanceTimersByTime(500);
        updateCompassAnimation();
        expect(isCompassAnimating()).toBe(false);
    });

    it('should updateCompassAnimation safely when not animating', () => {
        initCompass();
        expect(() => updateCompassAnimation()).not.toThrow();
    });

    it('should updateCompassAnimation safely when camera is null after completing', () => {
        initCompass();
        resetToNorth();
        vi.advanceTimersByTime(900);
        updateCompassAnimation();
        state.camera = null;
        expect(() => updateCompassAnimation()).not.toThrow();
    });

    it('should render compass without crashing', () => {
        initCompass();
        expect(() => renderCompass()).not.toThrow();
    });

    it('should render compass when camera is null', () => {
        initCompass();
        state.camera = null;
        expect(() => renderCompass()).not.toThrow();
    });

    it('should render compass when controls are null', () => {
        initCompass();
        state.controls = null as any;
        expect(() => renderCompass()).not.toThrow();
    });

    it('should render compass when nothing initialized', () => {
        disposeCompass();
        expect(() => renderCompass()).not.toThrow();
    });

    it('should handle double dispose without crashing', () => {
        initCompass();
        disposeCompass();
        expect(() => disposeCompass()).not.toThrow();
    });
});
