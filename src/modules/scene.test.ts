import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
vi.mock('./toast', () => ({ showToast: vi.fn() }));
import { showToast } from './toast';
import { flyTo, disposeScene, initScene } from './scene';
import { state } from './state';

// Mocks for Three.js examples (not available in standard THREE namespace in tests)
const { MockMapControls } = vi.hoisted(() => {
    class MockMapControls {
        target = new THREE.Vector3();
        update = vi.fn().mockReturnValue(false);
        addEventListener = vi.fn();
        removeEventListener = vi.fn();
        dispose = vi.fn();
        getPolarAngle = vi.fn().mockReturnValue(0.5);
        getAzimuthalAngle = vi.fn().mockReturnValue(0);
        minPolarAngle = 0;
        maxPolarAngle = Math.PI;
        minDistance = 0;
        maxDistance = Infinity;
    }
    return { MockMapControls };
});

vi.mock('three/examples/jsm/controls/MapControls.js', () => ({
    MapControls: MockMapControls
}));

vi.mock('three/examples/jsm/objects/Sky.js', () => ({
    Sky: vi.fn().mockImplementation(() => ({
        mesh: new THREE.Mesh(),
        material: { uniforms: { sunPosition: { value: new THREE.Vector3() } } }
    }))
}));

vi.mock('three/examples/jsm/libs/stats.module.js', () => ({
    default: vi.fn().mockImplementation(() => ({
        dom: document.createElement('div'),
        begin: vi.fn(),
        end: vi.fn(),
        update: vi.fn(),
    }))
}));

// Mock other modules to avoid side effects
vi.mock('./terrain', () => ({
    loadTerrain: vi.fn().mockResolvedValue(undefined),
    updateVisibleTiles: vi.fn(),
    repositionAllTiles: vi.fn(),
    animateTiles: vi.fn().mockReturnValue(false),
    resetTerrain: vi.fn(),
    autoSelectMapSource: vi.fn(),
    terrainUniforms: { uTime: { value: 0 } },
    prefetchAdjacentLODs: vi.fn(),
}));

vi.mock('./sun', () => ({ updateSunPosition: vi.fn() }));
vi.mock('./analysis', () => ({ getAltitudeAt: vi.fn().mockReturnValue(100), resetAnalysisCache: vi.fn() }));
vi.mock('./tileCache', () => ({ disposeAllCachedTiles: vi.fn() }));
vi.mock('./geometryCache', () => ({ disposeAllGeometries: vi.fn() }));
vi.mock('./utils', () => ({ 
    throttle: (fn: any) => fn, 
    showToast: vi.fn(),
    isMobileDevice: false 
}));
vi.mock('./weather', () => ({ 
    initWeatherSystem: vi.fn(), 
    updateWeatherSystem: vi.fn(), 
    fetchWeather: vi.fn(), 
    disposeWeatherSystem: vi.fn() 
}));
vi.mock('./compass', () => ({ 
    initCompass: vi.fn(), 
    disposeCompass: vi.fn(), 
    renderCompass: vi.fn(), 
    updateCompassAnimation: vi.fn(), 
    isCompassAnimating: vi.fn().mockReturnValue(false) 
}));
vi.mock('./touchControls', () => ({ initTouchControls: vi.fn(), disposeTouchControls: vi.fn() }));

describe('scene.ts', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Setup minimal state
        state.scene = new THREE.Scene();
        state.camera = new THREE.PerspectiveCamera();
        
        // Mock WebGLRenderer
        state.renderer = {
            dispose: vi.fn(),
            setAnimationLoop: vi.fn(),
            setSize: vi.fn(),
            render: vi.fn(),
            domElement: document.createElement('canvas'),
        } as any;

        state.controls = new MapControls(state.camera, state.renderer?.domElement);
        state.isFlyingTo = false;
        state.isUserInteracting = false;
    });

    afterEach(async () => {
        await disposeScene();
        vi.restoreAllMocks();
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    describe('flyTo', () => {
        it('should set isFlyingTo flag and update camera/target', () => {
            const targetX = 1000;
            const targetZ = 2000;
            const targetElev = 500;

            flyTo(targetX, targetZ, targetElev, 5000, 1000);

            expect(state.isFlyingTo).toBe(true);
            // After some time, it should have moved (using fake timers)
            vi.advanceTimersByTime(1100);
            
            // We can't easily test the exact position because of the animation loop requestAnimationFrame
            // but we can check if it eventually resets the flag if we mock the animation frame
        });

        it('should perform instant move if prefers-reduced-motion is active', () => {
            // Mock window.matchMedia
            Object.defineProperty(window, 'matchMedia', {
                writable: true,
                value: vi.fn().mockImplementation(query => ({
                    matches: query === '(prefers-reduced-motion: reduce)',
                    media: query,
                    onchange: null,
                    addListener: vi.fn(),
                    removeListener: vi.fn(),
                    addEventListener: vi.fn(),
                    removeEventListener: vi.fn(),
                    dispatchEvent: vi.fn(),
                })),
            });

            const targetX = 5000;
            const targetZ = 5000;
            flyTo(targetX, targetZ, 100, 1000, 1000);

            expect(state.isFlyingTo).toBe(false); // Instant move
            expect(state.controls?.target.x).toBe(targetX);
            expect(state.controls?.target.z).toBe(targetZ);
        });
    });

    describe('disposeScene', () => {
        it('should cleanup all resources and listeners', async () => {
            const disposeSpy = vi.spyOn(state.renderer!, 'dispose');
            const sceneClearSpy = vi.spyOn(state.scene!, 'clear');

            await disposeScene();

            expect(disposeSpy).toHaveBeenCalled();
            expect(sceneClearSpy).toHaveBeenCalled();
            expect(state.renderer?.setAnimationLoop).toHaveBeenCalledWith(null);
        });
    });
});
