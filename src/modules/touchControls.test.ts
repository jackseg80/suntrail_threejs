import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { initTouchControls, disposeTouchControls } from './touchControls';
import { state } from './state';

describe('touchControls.ts', () => {
    let canvas: HTMLCanvasElement;

    beforeEach(() => {
        canvas = document.createElement('canvas');
        document.body.appendChild(canvas);
        
        state.camera = new THREE.PerspectiveCamera();
        state.controls = {
            enabled: true,
            update: vi.fn(),
        } as any;
        state.isUserInteracting = false;
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
        
        // Use dispatchEvent on the element to trigger the listener
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
        
        // Down first
        canvas.dispatchEvent(new PointerEvent('pointerdown', { 
            pointerId: 1, 
            clientX: 100, 
            clientY: 100,
            pointerType: 'touch'
        }));
        expect(state.isUserInteracting).toBe(true);
        
        // Up
        window.dispatchEvent(new PointerEvent('pointerup', { 
            pointerId: 1,
            pointerType: 'touch'
        }));
        expect(state.isUserInteracting).toBe(false);
    });
});
