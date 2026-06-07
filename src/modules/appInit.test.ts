import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appInit } from './appInit';

// Mocking all external services called by appInit
vi.mock('./state', () => ({
    state: {
        uiVisible: true,
        subscribe: vi.fn().mockReturnValue(() => {}),
        lang: 'fr',
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
    i18n: { setLocale: vi.fn(), t: (k: string) => k },
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
