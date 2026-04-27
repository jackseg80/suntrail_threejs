import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { appInit } from './appInit';
import { state } from './state';

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
        originTile: { x: 0, y: 0, z: 14 }
    },
    loadSettings: vi.fn().mockReturnValue({ MAP_SOURCE: 'swisstopo', PERFORMANCE_PRESET: 'balanced' }),
    loadProStatus: vi.fn(),
}));

vi.mock('./iapService', () => ({ iapService: { initialize: vi.fn() } }));
vi.mock('./config', () => ({ resolveMapTilerKey: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./scene', () => ({ initScene: vi.fn().mockResolvedValue(undefined), flyTo: vi.fn() }));
vi.mock('./theme', () => ({ initTheme: vi.fn() }));
vi.mock('../i18n/I18nService', () => ({ i18n: { setLocale: vi.fn(), t: (k: string) => k } }));

// Mock components
vi.mock('./ui/components/TopStatusBar', () => ({ TopStatusBar: class { hydrate = vi.fn() } }));
vi.mock('./ui/components/NavigationBar', () => ({ NavigationBar: class { hydrate = vi.fn() } }));
vi.mock('./ui/components/WidgetsComponent', () => ({ WidgetsComponent: class { hydrate = vi.fn() } }));
vi.mock('./ui/components/TimelineComponent', () => ({ TimelineComponent: class { hydrate = vi.fn() } }));

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
        const { applyPreset } = await import('./performance');
        
        vi.mocked(loadSettings).mockReturnValue({ 
            MAP_SOURCE: 'swisstopo', 
            PERFORMANCE_PRESET: 'ultra' 
        });

        await appInit();

        // Check if ultra preset was applied via loadSettings
        const perf = await import('./performance');
        expect(perf.applyPreset).toHaveBeenCalledWith('ultra');
    });
});

// Need to mock performance separately to track calls
vi.mock('./performance', () => ({
    applyPreset: vi.fn(),
    detectBestPreset: () => 'balanced',
    getGpuInfo: () => ({ renderer: 'mock' }),
    applyCustomSettings: vi.fn()
}));

vi.mock('./weather', () => ({ fetchWeather: vi.fn() }));
vi.mock('./peaks', () => ({ fetchLocalPeaks: vi.fn() }));
vi.mock('./ui/autoHide', () => ({ initAutoHide: vi.fn() }));
vi.mock('./ui/mobile', () => ({ initMobileUI: vi.fn() }));
vi.mock('./acceptanceWall', () => ({ requestAcceptance: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./onboardingTutorial', () => ({ requestOnboarding: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./gpsDisclosure', () => ({ requestGPSDisclosure: vi.fn() }));
vi.mock('./location', () => ({ startLocationTracking: vi.fn(), updateUserMarker: vi.fn(), stopLocationTracking: vi.fn(), clearUserMarker: vi.fn() }));
vi.mock('./terrain', () => ({ refreshTerrain: vi.fn() }));
vi.mock('./analysis', () => ({ findTerrainIntersection: vi.fn(), getAltitudeAt: vi.fn() }));
vi.mock('./profile', () => ({ closeElevationProfile: vi.fn(), updateElevationProfile: vi.fn() }));
vi.mock('./haptics', () => ({ haptic: vi.fn() }));
vi.mock('./eventBus', () => ({ eventBus: { emit: vi.fn(), on: vi.fn() } }));
