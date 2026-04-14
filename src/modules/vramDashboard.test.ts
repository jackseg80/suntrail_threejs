import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TEXTURE_LIMITS, formatTriangles, VRAMDashboard } from './ui/components/VRAMDashboard';
import { state } from './state';
import { showToast } from './toast';

// Mock terrain activeTiles
vi.mock('./terrain', () => ({
    activeTiles: new Map([['tile1', {}], ['tile2', {}], ['tile3', {}]]),
    resetTerrain: vi.fn(),
    updateVisibleTiles: vi.fn(),
    updateHydrologyVisibility: vi.fn()
}));

// Mock workerManager
vi.mock('./workerManager', () => ({
    tileWorkerManager: { workers: new Array(8) }
}));

// Mock utils
vi.mock('./utils', () => ({
    throttle: vi.fn((fn: any) => fn)
}));

// Mock toast
vi.mock('./toast', () => ({
    showToast: vi.fn()
}));

// Mock geo
vi.mock('./geo', () => ({
    isPositionInSwitzerland: vi.fn(),
    isPositionInFrance: vi.fn(),
    lngLatToWorld: vi.fn(),
    worldToLngLat: vi.fn(),
    lngLatToTile: vi.fn()
}));

// Mock i18n
vi.mock('../i18n/I18nService', () => ({
    i18n: {
        t: (key: string) => key,
        applyToDOM: vi.fn(),
        getLocale: vi.fn(() => 'fr'),
        setLocale: vi.fn()
    }
}));

// Mock eventBus
vi.mock('./eventBus', () => ({
    eventBus: {
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn()
    }
}));

const mockedShowToast = vi.mocked(showToast);

describe('VRAMDashboard', () => {
    let dashboard: VRAMDashboard;

    beforeEach(() => {
        vi.useFakeTimers();
        mockedShowToast.mockClear();

        // Clean body
        document.body.innerHTML = '';

        // Mock renderer on state
        (state as any).renderer = {
            info: {
                memory: { geometries: 42, textures: 100 },
                render: { calls: 55, triangles: 12345 }
            }
        };
        (state as any).PERFORMANCE_PRESET = 'balanced';
        // Tests de toggle : partir d'un état caché (SHOW_STATS=false)
        (state as any).SHOW_STATS = false;

        dashboard = new VRAMDashboard();
        dashboard.init();
    });

    afterEach(() => {
        dashboard.dispose();
        vi.useRealTimers();
    });

    // Test 1: TEXTURE_LIMITS is an exported object with correct values per profile
    describe('TEXTURE_LIMITS', () => {
        it('should have correct thresholds per profile', () => {
            expect(TEXTURE_LIMITS.eco).toBe(50);
            expect(TEXTURE_LIMITS.balanced).toBe(150);
            expect(TEXTURE_LIMITS.performance).toBe(300);
            expect(TEXTURE_LIMITS.ultra).toBe(500);
            expect(TEXTURE_LIMITS.custom).toBe(200);
        });
    });

    // Test 2: Alert does NOT fire when under threshold
    it('should not trigger alert when textures are below the threshold', () => {
        (state as any).renderer.info.memory.textures = 100; // below balanced limit of 150

        dashboard.start();
        vi.advanceTimersByTime(500);
        dashboard.stop();

        expect(mockedShowToast).not.toHaveBeenCalled();
    });

    // Test 3: Alert fires when ABOVE threshold
    it('should trigger alert when textures exceed the threshold', () => {
        (state as any).renderer.info.memory.textures = 200; // above balanced limit of 150

        dashboard.start();
        vi.advanceTimersByTime(500);
        dashboard.stop();

        expect(mockedShowToast).toHaveBeenCalledTimes(1);
        expect(mockedShowToast).toHaveBeenCalledWith(expect.stringContaining('200'));
    });

    // Test 4: Alert respects 30s cooldown
    it('should respect the 30s cooldown between alerts', () => {
        (state as any).renderer.info.memory.textures = 200; // above balanced limit

        dashboard.start();
        // First tick at 500ms — triggers alert
        vi.advanceTimersByTime(500);
        expect(mockedShowToast).toHaveBeenCalledTimes(1);

        // 2nd tick at 1000ms — should NOT trigger (cooldown)
        vi.advanceTimersByTime(500);
        expect(mockedShowToast).toHaveBeenCalledTimes(1);

        // Advance to 30.5s — should trigger again
        vi.advanceTimersByTime(29_500);
        expect(mockedShowToast).toHaveBeenCalledTimes(2);

        dashboard.stop();
    });

    // Test 5: Toggle changes visibility
    it('should toggle panel visibility', () => {
        const panel = document.getElementById('vram-dashboard');
        expect(panel).not.toBeNull();
        expect(panel!.style.display).toBe('none');

        dashboard.toggle(); // show
        expect(panel!.style.display).toBe('block');
        expect(dashboard.isRunning()).toBe(true);

        dashboard.toggle(); // hide
        expect(panel!.style.display).toBe('none');
        expect(dashboard.isRunning()).toBe(false);
    });

    // Test 6: start() / stop() manage the interval
    it('should manage interval with start() and stop()', () => {
        expect(dashboard.isRunning()).toBe(false);

        dashboard.start();
        expect(dashboard.isRunning()).toBe(true);

        // Calling start() again should be idempotent
        dashboard.start();
        expect(dashboard.isRunning()).toBe(true);

        dashboard.stop();
        expect(dashboard.isRunning()).toBe(false);

        // Calling stop() again should be safe
        dashboard.stop();
        expect(dashboard.isRunning()).toBe(false);
    });

    // Test 7: Triangles formatted correctly (K suffix for > 1000)
    describe('formatTriangles', () => {
        it('should format triangles with K suffix when > 1000', () => {
            expect(formatTriangles(500)).toBe('500');
            expect(formatTriangles(999)).toBe('999');
            expect(formatTriangles(1000)).toBe('1.0K');
            expect(formatTriangles(12345)).toBe('12.3K');
            expect(formatTriangles(0)).toBe('0');
        });
    });

    // Test 8: Metrics are updated correctly in DOM spans
    it('should update DOM spans with correct metric values', () => {
        dashboard.start();
        vi.advanceTimersByTime(500);
        dashboard.stop();

        expect(document.getElementById('vram-geo')!.textContent).toBe('42');
        expect(document.getElementById('vram-tex')!.textContent).toBe('100');
        expect(document.getElementById('vram-draw')!.textContent).toBe('55');
        expect(document.getElementById('vram-tri')!.textContent).toBe('12.3K');
        expect(document.getElementById('vram-tiles')!.textContent).toBe('3'); // 3 mocked tiles
        expect(document.getElementById('vram-workers')!.textContent).toBe('8');
    });

    // Test 9: dispose() clears interval
    it('should clear interval on dispose', () => {
        dashboard.start();
        expect(dashboard.isRunning()).toBe(true);

        dashboard.dispose();
        expect(dashboard.isRunning()).toBe(false);
    });

    // --- PerfRecorder ---

    describe('PerfRecorder', () => {
        beforeEach(() => {
            (state as any).currentFPS = 60;
            (state as any).ZOOM = 14;
            (state as any).isProcessingTiles = false;
            (state as any).isUserInteracting = false;
            (state as any).ENERGY_SAVER = true;
            dashboard.start();
        });

        it('démarre inactif — buffer vide, isRecording=false', () => {
            expect(dashboard.getIsRecording()).toBe(false);
            expect(dashboard.getSamples()).toHaveLength(0);
        });

        it('startRecording() remplit le buffer à chaque tick (500ms)', () => {
            dashboard.startRecording();
            expect(dashboard.getIsRecording()).toBe(true);

            vi.advanceTimersByTime(500);
            expect(dashboard.getSamples()).toHaveLength(1);

            vi.advanceTimersByTime(1000);
            expect(dashboard.getSamples()).toHaveLength(3);
        });

        it('les échantillons contiennent les bonnes métriques', () => {
            dashboard.startRecording();
            vi.advanceTimersByTime(500);

            const s = dashboard.getSamples()[0];
            expect(s.fps).toBe(60);
            expect(s.textures).toBe(100);
            expect(s.geometries).toBe(42);
            expect(s.drawCalls).toBe(55);
            expect(s.zoom).toBe(14);
            expect(s.energySaver).toBe(true);
            expect(s.t).toBeGreaterThanOrEqual(0);
        });

        it('stopRecording() arrête l\'enregistrement et vide le flag', () => {
            dashboard.startRecording();
            vi.advanceTimersByTime(500);
            dashboard.stopRecording(false); // sans export

            expect(dashboard.getIsRecording()).toBe(false);
            // Buffer conservé pour export ultérieur
            expect(dashboard.getSamples()).toHaveLength(1);
        });

        it('startRecording() réinitialise le buffer à chaque nouvelle session', () => {
            dashboard.startRecording();
            vi.advanceTimersByTime(1000);
            expect(dashboard.getSamples()).toHaveLength(2);

            dashboard.stopRecording(false);
            dashboard.startRecording();
            expect(dashboard.getSamples()).toHaveLength(0);
        });

        it('buffer circulaire : MAX_SAMPLES=600 — le 601e échantillon évince le 1er', () => {
            dashboard.startRecording();
            // 600 ticks × 500ms = 300s
            vi.advanceTimersByTime(500 * 601);
            // Buffer plafonné à 600
            expect(dashboard.getSamples().length).toBeLessThanOrEqual(600);
        });

        it('fermer le panel (setVisible false) arrête automatiquement l\'enregistrement', () => {
            dashboard.startRecording();
            vi.advanceTimersByTime(500);
            expect(dashboard.getIsRecording()).toBe(true);

            dashboard.setVisible(false);
            expect(dashboard.getIsRecording()).toBe(false);
        });
    });

    // Test 10: Alert uses correct limit per preset
    it('should use correct texture limit for eco preset', () => {
        (state as any).PERFORMANCE_PRESET = 'eco';
        (state as any).renderer.info.memory.textures = 60; // above eco limit of 50

        dashboard.start();
        vi.advanceTimersByTime(500);
        dashboard.stop();

        expect(mockedShowToast).toHaveBeenCalledTimes(1);
        expect(mockedShowToast).toHaveBeenCalledWith(expect.stringContaining('60'));
    });
});
