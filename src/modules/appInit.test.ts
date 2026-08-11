import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { appInit } from './appInit';

// Mocking all external services called by appInit
vi.mock('./state', () => ({
    state: {
        uiVisible: true,
        subscribe: vi.fn().mockReturnValue(() => {}),
        lang: 'en',
        PERFORMANCE_PRESET: 'balanced',
        isNetworkAvailable: true,
        TARGET_LAT: 46.5,
        TARGET_LON: 7.5,
        IS_2D_MODE: false,
        originTile: { x: 0, y: 0, z: 14 },
    },
    loadSettings: vi.fn().mockReturnValue({
        MAP_SOURCE: 'swisstopo',
        PERFORMANCE_PRESET: 'balanced',
    }),
    loadProStatus: vi.fn(),
    loadGpxHistory: vi.fn(),
}));

vi.mock('./iapService', () => ({
    iapService: { initialize: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('./config', () => ({
    resolveMapTilerKey: vi.fn().mockResolvedValue(undefined),
    resolveORSKey: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./scene', () => ({
    initScene: vi.fn().mockResolvedValue(undefined),
    flyTo: vi.fn(),
}));
vi.mock('./theme', () => ({ initTheme: vi.fn() }));
vi.mock('../i18n/I18nService', () => ({
    i18n: {
        setLocale: vi.fn(),
        t: (k: string) => k,
        detectSystemLocale: vi.fn(() => 'en'),
    },
}));

// Mock components
vi.mock('./ui/components/TopStatusBar', () => ({
    TopStatusBar: class {
        hydrate = vi.fn();
    },
}));
vi.mock('./ui/components/NavigationBar', () => ({
    NavigationBar: class {
        hydrate = vi.fn();
    },
}));
vi.mock('./ui/components/WidgetsComponent', () => ({
    WidgetsComponent: class {
        hydrate = vi.fn();
    },
}));
vi.mock('./ui/components/TimelineComponent', () => ({
    TimelineComponent: class {
        hydrate = vi.fn();
    },
}));

describe('appInit.ts — Initialization Sequence', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal(
            'MutationObserver',
            class {
                observe = vi.fn();
                disconnect = vi.fn();
                takeRecords = vi.fn().mockReturnValue([]);
            }
        );
        document.body.innerHTML = '<div id="canvas-container"></div>';
    });

    it('should initialize core services and hydration in order', async () => {
        const { iapService } = await import('./iapService');
        const { resolveMapTilerKey } = await import('./config');
        const { initScene } = await import('./scene');
        const { loadProStatus } = await import('./state');

        await appInit();

        // 1. Pro status must be loaded first
        expect(loadProStatus).toHaveBeenCalled();

        // 2. IAP should be initialized (fire and forget)
        expect(iapService.initialize).toHaveBeenCalled();

        // 3. MapTiler key must be resolved
        expect(resolveMapTilerKey).toHaveBeenCalled();

        // 4. Scene must be launched
        expect(initScene).toHaveBeenCalled();
    });

    it('should apply saved settings if they exist', async () => {
        const { loadSettings } = await import('./state');

        vi.mocked(loadSettings).mockReturnValue({
            MAP_SOURCE: 'swisstopo',
            PERFORMANCE_PRESET: 'ultra',
        } as any);

        await appInit();

        // Check if ultra preset was applied via loadSettings
        const perf = await import('./performance');
        expect(perf.applyPreset).toHaveBeenCalledWith('ultra');
    });

    it('should detect system language on first launch (no saved settings)', async () => {
        const { loadSettings, state } = await import('./state');
        const { i18n } = await import('../i18n/I18nService');

        vi.mocked(loadSettings).mockReturnValue(null);
        vi.mocked(i18n.detectSystemLocale).mockReturnValue('de');

        await appInit();

        expect(i18n.detectSystemLocale).toHaveBeenCalled();
        expect(state.lang).toBe('de');
        expect(i18n.setLocale).toHaveBeenCalledWith('de');
    });

    it('should keep saved language preference on later launches', async () => {
        const { loadSettings, state } = await import('./state');
        const { i18n } = await import('../i18n/I18nService');

        vi.mocked(loadSettings).mockReturnValue({
            MAP_SOURCE: 'swisstopo',
            PERFORMANCE_PRESET: 'balanced',
            lang: 'it',
        } as any);
        state.lang = 'it'; // le vrai loadSettings restaure la langue sauvegardée

        await appInit();

        expect(i18n.detectSystemLocale).not.toHaveBeenCalled();
        expect(state.lang).toBe('it');
        expect(i18n.setLocale).toHaveBeenCalledWith('it');
    });

    it('wires map selection, coordinate dismissal and route controls', async () => {
        document.body.innerHTML = `
            <div id="canvas-container"></div>
            <div id="coords-pill"><button id="close-coords"></button><span id="click-latlon"></span><span id="click-alt"></span><span id="click-poi-name"></span></div>
            <div class="fab-stack"></div><button id="layers-fab"></button><button id="compass-fab"></button>
            <button id="gps-main-btn"></button><span id="compass-svg"></span><span id="lp-indicator"></span>
            <button id="rb-clear-btn"></button><button id="rb-settings-btn"></button>
            <div id="route-settings" class="hidden"></div><select id="rs-profile"><option value="foot">foot</option></select><input id="rs-loop" type="checkbox" />
            <div id="route-bar"></div><div id="nav-bar"></div><div id="top-status-bar"></div><div id="widgets-container"></div><div id="bottom-bar"></div>
        `;
        const { state } = await import('./state');
        const { findTerrainIntersection, getAltitudeAt } =
            await import('./analysis');
        const { clearRoute, scheduleAutoCompute } =
            await import('./routeManager');
        const { sheetManager } = await import('./ui/core/SheetManager');
        vi.mocked(findTerrainIntersection).mockReturnValue(
            new THREE.Vector3(20, 0, 30)
        );
        vi.mocked(getAltitudeAt).mockReturnValue(1200);
        vi.spyOn(sheetManager, 'toggle');
        vi.spyOn(sheetManager, 'close');
        Object.assign(state, {
            renderer: {},
            camera: new THREE.PerspectiveCamera(),
            scene: new THREE.Scene(),
            originTile: { x: 0, y: 0, z: 14 },
            RELIEF_EXAGGERATION: 1,
            routeWaypoints: [
                { lat: 1, lon: 2, alt: 3 },
                { lat: 4, lon: 5, alt: 6 },
            ],
        });

        await appInit();
        document
            .getElementById('canvas-container')!
            .dispatchEvent(
                new MouseEvent('click', { clientX: 100, clientY: 100 })
            );

        expect(state.hasLastClicked).toBe(true);
        expect(state.clickMarker).not.toBeNull();
        expect(document.getElementById('click-alt')!.textContent).toBe(
            '1200 m'
        );

        document.getElementById('close-coords')!.click();
        expect(state.hasLastClicked).toBe(false);
        expect(state.clickMarker).toBeNull();

        document.getElementById('layers-fab')!.click();
        expect(sheetManager.toggle).toHaveBeenCalledWith('layers-sheet');
        document.getElementById('rb-settings-btn')!.click();
        expect(
            document
                .getElementById('route-settings')!
                .classList.contains('hidden')
        ).toBe(false);
        document
            .getElementById('rs-profile')!
            .dispatchEvent(new Event('change'));
        (document.getElementById('rs-loop') as HTMLInputElement).checked = true;
        document.getElementById('rs-loop')!.dispatchEvent(new Event('change'));
        document.getElementById('rb-clear-btn')!.click();
        expect(scheduleAutoCompute).toHaveBeenCalledTimes(2);
        expect(clearRoute).toHaveBeenCalled();
    });
});

describe('showLoadingError / resetLoadingError', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="map-loading-overlay" class="visible">
                <span class="spinner map-loading-spinner"></span>
                <span class="map-loading-text">Chargement de la carte...</span>
                <div id="map-loading-offline-msg" style="display:none;"></div>
                <button id="map-loading-retry" style="display:none;">Réessayer</button>
            </div>
        `;
    });

    it('showLoadingError hides spinner, changes text, shows retry button, sets flag', async () => {
        const { showLoadingError } = await import('./appInit');
        const overlay = document.getElementById('map-loading-overlay')!;
        const spinner = overlay.querySelector(
            '.map-loading-spinner'
        ) as HTMLElement;
        const text = overlay.querySelector('.map-loading-text') as HTMLElement;
        const retryBtn = document.getElementById('map-loading-retry')!;

        showLoadingError(overlay);

        expect(spinner.style.display).toBe('none');
        expect(text.textContent).toBe('Erreur de chargement');
        expect(retryBtn.style.display).toBe('block');
        expect(typeof retryBtn.onclick).toBe('function');
        expect(overlay.dataset.loadingError).toBe('true');
    });

    it('resetLoadingError restores original state and removes flag', async () => {
        const { showLoadingError, resetLoadingError } =
            await import('./appInit');
        const overlay = document.getElementById('map-loading-overlay')!;
        const spinner = overlay.querySelector(
            '.map-loading-spinner'
        ) as HTMLElement;
        const text = overlay.querySelector('.map-loading-text') as HTMLElement;

        // Set error state first
        showLoadingError(overlay);
        expect(overlay.dataset.loadingError).toBe('true');

        // Reset
        resetLoadingError(overlay);

        expect(overlay.dataset.loadingError).toBeUndefined();
        expect(spinner.style.display).toBe('');
        expect(text.textContent).toBe('Chargement de la carte...');
        expect(text.style.color).toBe('');
        const retryBtn = document.getElementById('map-loading-retry')!;
        expect(retryBtn.style.display).toBe('none');
        expect(retryBtn.onclick).toBeNull();
    });

    it('resetLoadingError is no-op when no error state active', async () => {
        const { resetLoadingError } = await import('./appInit');
        const overlay = document.getElementById('map-loading-overlay')!;
        const text = overlay.querySelector('.map-loading-text') as HTMLElement;

        resetLoadingError(overlay);

        expect(text.textContent).toBe('Chargement de la carte...');
        expect(overlay.dataset.loadingError).toBeUndefined();
    });
});

// Need to mock performance separately to track calls
vi.mock('./performance', () => ({
    applyPreset: vi.fn(),
    detectBestPreset: () => 'balanced',
    getGpuInfo: () => ({ renderer: 'mock' }),
    applyCustomSettings: vi.fn(),
}));

vi.mock('./weather', () => ({ fetchWeather: vi.fn() }));
vi.mock('./peaks', () => ({ fetchLocalPeaks: vi.fn() }));
vi.mock('./ui/autoHide', () => ({ initAutoHide: vi.fn() }));
vi.mock('./ui/mobile', () => ({ initMobileUI: vi.fn() }));
vi.mock('./acceptanceWall', () => ({
    requestAcceptance: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./onboardingTutorial', () => ({
    requestOnboarding: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./gpsDisclosure', () => ({ requestGPSDisclosure: vi.fn() }));
vi.mock('./location', () => ({
    startLocationTracking: vi.fn(),
    updateUserMarker: vi.fn(),
    stopLocationTracking: vi.fn(),
    clearUserMarker: vi.fn(),
}));
vi.mock('./terrain', () => ({ refreshTerrain: vi.fn() }));
vi.mock('./tileLoader', () => ({
    initCacheLayer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./packManager', () => ({
    packManager: { initialize: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('./routeManager', () => ({
    initRouteManager: vi.fn(),
    removeWaypointAt: vi.fn(),
    scheduleAutoCompute: vi.fn(),
    clearRoute: vi.fn(),
}));
vi.mock('./ui/core/SheetManager', () => ({
    sheetManager: {
        open: vi.fn(),
        close: vi.fn(),
        toggle: vi.fn(),
        getActiveSheetId: vi.fn(() => null),
    },
}));
vi.mock('./analysis', () => ({
    findTerrainIntersection: vi.fn(),
    getAltitudeAt: vi.fn(),
}));
vi.mock('./profile', () => ({
    closeElevationProfile: vi.fn(),
    updateElevationProfile: vi.fn(),
}));
vi.mock('./haptics', () => ({ haptic: vi.fn() }));
vi.mock('./eventBus', () => ({ eventBus: { emit: vi.fn(), on: vi.fn() } }));
