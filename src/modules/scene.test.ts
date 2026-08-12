import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MockWebGLRenderer } = vi.hoisted(() => {
    class MockWebGLRenderer {
        static instances: MockWebGLRenderer[] = [];
        domElement = document.createElement('canvas');
        shadowMap: Record<string, unknown> = {};
        dispose = vi.fn();
        setAnimationLoop = vi.fn();
        setSize = vi.fn();
        setPixelRatio = vi.fn();
        render = vi.fn();
        compile = vi.fn();

        constructor() {
            MockWebGLRenderer.instances.push(this);
        }
    }
    return { MockWebGLRenderer };
});

vi.mock('three', async (importOriginal) => ({
    ...(await importOriginal<typeof import('three')>()),
    WebGLRenderer: MockWebGLRenderer,
}));

import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import {
    flyTo,
    disposeScene,
    forceImmediateLODUpdate,
    initScene,
} from './scene';
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
    MapControls: MockMapControls,
}));

vi.mock('three/examples/jsm/objects/Sky.js', () => ({
    Sky: vi.fn().mockImplementation(() => ({
        mesh: new THREE.Mesh(),
        material: { uniforms: { sunPosition: { value: new THREE.Vector3() } } },
    })),
}));

vi.mock('three/examples/jsm/libs/stats.module.js', () => ({
    default: class {
        dom = document.createElement('div');
        begin = vi.fn();
        end = vi.fn();
        update = vi.fn();
    },
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
vi.mock('./analysis', () => ({
    getAltitudeAt: vi.fn().mockReturnValue(100),
    resetAnalysisCache: vi.fn(),
}));
vi.mock('./tileCache', () => ({ disposeAllCachedTiles: vi.fn() }));
vi.mock('./geometryCache', () => ({ disposeAllGeometries: vi.fn() }));
vi.mock('./utils', () => ({
    throttle: (fn: any) => fn,
    debounce: (fn: any) => fn,
    showToast: vi.fn(),
    isMobileDevice: false,
}));
vi.mock('./weather', () => ({
    initWeatherSystem: vi.fn(),
    updateWeatherSystem: vi.fn(),
    tickWeatherTime: vi.fn(),
    fetchWeather: vi.fn(),
    disposeWeatherSystem: vi.fn(),
}));
vi.mock('./environment', () => ({
    initEnvironment: vi.fn(),
    updateEnvironment: vi.fn(),
    createGroundPlane: vi.fn(() => new THREE.Mesh()),
    disposeEnvironment: vi.fn(),
}));
vi.mock('./compass', () => ({
    initCompass: vi.fn(),
    disposeCompass: vi.fn(),
    renderCompass: vi.fn(),
    updateCompassAnimation: vi.fn(),
    isCompassAnimating: vi.fn().mockReturnValue(false),
}));
vi.mock('./touchControls', () => ({
    initTouchControls: vi.fn(),
    disposeTouchControls: vi.fn(),
}));

describe('scene.ts', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        MockWebGLRenderer.instances = [];
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

        state.controls = new MapControls(
            state.camera,
            state.renderer?.domElement
        );
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
            flyTo(1000, 2000, 500, 5000, 1000);
            expect(state.isFlyingTo).toBe(true);
        });

        it('should reset isFlyingTo to false once animation completes via rAF', async () => {
            vi.useRealTimers();
            const promise = flyTo(1000, 2000, 500, 5000, 10); // très courte durée
            await promise;
            expect(state.isFlyingTo).toBe(false);
            vi.useFakeTimers();
        });

        it('should perform instant move if prefers-reduced-motion is active', () => {
            // Mock window.matchMedia
            Object.defineProperty(window, 'matchMedia', {
                writable: true,
                value: vi.fn().mockImplementation((query) => ({
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
        it('should cleanup all resources, remove canvas, and null renderer', async () => {
            const disposeSpy = vi.spyOn(state.renderer!, 'dispose');
            const sceneClearSpy = vi.spyOn(state.scene!, 'clear');
            const removeSpy = vi.spyOn(state.renderer!.domElement, 'remove');

            await disposeScene();

            expect(disposeSpy).toHaveBeenCalled();
            expect(sceneClearSpy).toHaveBeenCalled();
            expect(removeSpy).toHaveBeenCalled();
            expect(state.renderer).toBeNull();
        });
    });

    describe('forceImmediateLODUpdate', () => {
        it('updates the tile source immediately and respects the free LOD cap', async () => {
            const { updateVisibleTiles, autoSelectMapSource } =
                await import('./terrain');
            state.originTile = { x: 0, y: 0, z: 14 };
            state.ZOOM = 12;
            state.MAX_ALLOWED_ZOOM = 18;
            state.camera!.position.set(0, 200, 0);
            state.controls!.target.set(0, 0, 0);

            forceImmediateLODUpdate();

            expect(state.ZOOM).toBeLessThanOrEqual(14);
            expect(autoSelectMapSource).toHaveBeenCalled();
            expect(updateVisibleTiles).toHaveBeenCalledWith(
                expect.any(Number),
                expect.any(Number),
                expect.any(Number),
                0,
                0,
                true
            );
        });
    });

    describe('initScene', () => {
        it('initializes the renderer, accessibility and first terrain refresh', async () => {
            document.body.innerHTML = '<div id="canvas-container"></div>';
            Object.assign(state, {
                TARGET_LAT: 46.5,
                TARGET_LON: 7.5,
                ZOOM: 14,
                PIXEL_RATIO_LIMIT: 1,
                SHADOWS: true,
                SHOW_STATS: false,
                PERFORMANCE_PRESET: 'balanced',
                simDate: new Date('2025-06-01T12:00:00'),
            });

            await initScene();

            const renderer = MockWebGLRenderer.instances.at(-1)!;
            expect(renderer.setSize).toHaveBeenCalled();
            expect(renderer.setAnimationLoop).toHaveBeenCalledWith(
                expect.any(Function)
            );
            expect(renderer.domElement.getAttribute('role')).toBe('img');
            expect(
                document.querySelector('#canvas-container canvas')
            ).not.toBeNull();
        });

        it('rearms rendering after a viewport resize', async () => {
            document.body.innerHTML = '<div id="canvas-container"></div>';
            Object.assign(state, {
                TARGET_LAT: 46.5,
                TARGET_LON: 7.5,
                ZOOM: 14,
                PIXEL_RATIO_LIMIT: 1,
                SHADOWS: true,
                SHOW_STATS: false,
                PERFORMANCE_PRESET: 'balanced',
                simDate: new Date('2025-06-01T12:00:00'),
            });

            await initScene();
            const renderer = MockWebGLRenderer.instances.at(-1)!;
            const loopsBeforeResize =
                renderer.setAnimationLoop.mock.calls.length;

            window.dispatchEvent(new Event('resize'));

            expect(renderer.setSize).toHaveBeenCalledTimes(3);
            expect(renderer.setAnimationLoop).toHaveBeenCalledTimes(
                loopsBeforeResize + 1
            );
        });
    });
});
