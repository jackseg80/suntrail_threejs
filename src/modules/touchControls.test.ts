import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { initTouchControls, disposeTouchControls } from './touchControls';
import { state } from './state';
import * as cameraManager from './cameraManager';

// Mock zoomToPoint
vi.mock('./cameraManager', async () => {
    const actual = await vi.importActual('./cameraManager') as any;
    return {
        ...actual,
        zoomToPoint: vi.fn(),
    };
});

describe('touchControls.ts', () => {
    let canvas: HTMLCanvasElement;

    beforeEach(() => {
        canvas = document.createElement('canvas');
        document.body.appendChild(canvas);
        
        state.camera = new THREE.PerspectiveCamera();
        state.camera.position.set(0, 1000, 0);
        state.camera.lookAt(0, 0, 0);
        state.camera.updateMatrixWorld();
        state.camera.updateProjectionMatrix();

        state.controls = {
            enabled: true,
            target: new THREE.Vector3(0, 0, 0),
            update: vi.fn(),
        } as any;
        state.isUserInteracting = false;
        
        // Mock canvas dimensions
        vi.spyOn(canvas, 'clientWidth', 'get').mockReturnValue(500);
        vi.spyOn(canvas, 'clientHeight', 'get').mockReturnValue(500);
    });

    afterEach(() => {
        disposeTouchControls(canvas);
        document.body.removeChild(canvas);
        vi.restoreAllMocks();
    });

    it('should initialize and cleanup listeners', () => {
        const addEventListenerSpy = vi.spyOn(canvas, 'addEventListener');
        const removeEventListenerSpy = vi.spyOn(canvas, 'removeEventListener');

        initTouchControls(state.camera!, state.controls!, canvas);
        expect(addEventListenerSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function), { capture: true });

        disposeTouchControls(canvas);
        expect(removeEventListenerSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function), { capture: true });
    });

    it('should set isUserInteracting to true on pointerdown', () => {
        initTouchControls(
            state.camera!, 
            state.controls!, 
            canvas, 
            () => { state.isUserInteracting = true; },
            () => { state.isUserInteracting = false; }
        );
        
        const event = new PointerEvent('pointerdown', {
            pointerId: 1,
            clientX: 100,
            clientY: 100,
            pointerType: 'touch',
            bubbles: true,
            cancelable: true,
        });
        
        canvas.dispatchEvent(event);
        expect(state.isUserInteracting).toBe(true);
    });

    it('should set isUserInteracting to false on pointerup', () => {
        initTouchControls(
            state.camera!, 
            state.controls!, 
            canvas, 
            () => { state.isUserInteracting = true; },
            () => { state.isUserInteracting = false; }
        );
        
        canvas.dispatchEvent(new PointerEvent('pointerdown', { 
            pointerId: 1, 
            clientX: 100, 
            clientY: 100,
            pointerType: 'touch',
            bubbles: true
        }));
        expect(state.isUserInteracting).toBe(true);
        
        window.dispatchEvent(new PointerEvent('pointerup', { 
            pointerId: 1,
            pointerType: 'touch',
            bubbles: true
        }));
        expect(state.isUserInteracting).toBe(false);
    });

    it('should detect double-tap and call zoomToPoint', () => {
        vi.useFakeTimers();
        initTouchControls(state.camera!, state.controls!, canvas);
        
        const zoomToPointSpy = vi.spyOn(cameraManager, 'zoomToPoint');

        // First tap
        canvas.dispatchEvent(new PointerEvent('pointerdown', { 
            pointerId: 1, 
            clientX: 250, 
            clientY: 250,
            pointerType: 'touch',
            bubbles: true
        }));
        
        vi.advanceTimersByTime(50);

        window.dispatchEvent(new PointerEvent('pointerup', { 
            pointerId: 1,
            pointerType: 'touch',
            bubbles: true
        }));

        vi.advanceTimersByTime(50);

        // Second tap
        canvas.dispatchEvent(new PointerEvent('pointerdown', { 
            pointerId: 2, 
            clientX: 250, 
            clientY: 250,
            pointerType: 'touch',
            bubbles: true
        }));

        expect(zoomToPointSpy).toHaveBeenCalled();
        vi.useRealTimers();
    });
});
