import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockIsProActive, mockPreparedRouteService, mockSetRoutePlanningMode } =
    vi.hoisted(() => ({
        mockIsProActive: vi.fn(() => false),
        mockPreparedRouteService: {
            getLastError: vi.fn(() => null),
            load: vi.fn().mockResolvedValue(undefined),
            toggleFavorite: vi.fn().mockResolvedValue(undefined),
            duplicate: vi.fn().mockResolvedValue(undefined),
            delete: vi.fn().mockResolvedValue(undefined),
            importGPXLayer: vi.fn().mockResolvedValue(undefined),
            prepareGPXLayerAsDraft: vi.fn(),
            saveCurrentDraft: vi.fn().mockResolvedValue(undefined),
            convertLegacy: vi.fn().mockResolvedValue(undefined),
        },
        mockSetRoutePlanningMode: vi.fn(),
    }));

vi.mock('../../../i18n/I18nService', () => ({
    i18n: { t: (k: string) => k, getLocale: () => 'fr' },
}));

vi.mock('../../state', () => ({
    state: {
        isRecording: false,
        recordedPoints: [],
        recordedMesh: null,
        gpxLayers: [],
        activeGPXLayerId: null,
        preparedRoutes: [],
        routeWaypoints: [],
        routeComputation: null,
        routeDraftDirty: false,
        routeDraftSourceLayerId: null,
        SHOW_BUILDINGS: false,
        subscribe: vi.fn(() => vi.fn()),
    },
    isProActive: mockIsProActive,
}));

vi.mock('../../haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../toast', () => ({ showToast: vi.fn() }));
vi.mock('../../eventBus', () => ({
    eventBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));
vi.mock('../../foregroundService', () => ({
    clearInterruptedRecording: vi.fn(),
    stopRecordingService: vi.fn(),
}));
vi.mock('../../location', () => ({
    startLocationTracking: vi.fn(),
    isWatchActive: vi.fn(),
}));
vi.mock('../../profile', () => ({
    updateElevationProfile: vi.fn(),
    closeElevationProfile: vi.fn(),
}));
vi.mock('../../gpxLayers', () => ({
    removeGPXLayer: vi.fn(),
    toggleGPXLayer: vi.fn(),
    addGPXLayer: vi.fn(),
    activateGPXLayer: vi.fn(),
    hideAllGPXLayers: vi.fn(),
    showOnlyGPXLayer: vi.fn(),
    updateRecordedTrackMesh: vi.fn(),
}));
vi.mock('../../gpxService', () => ({
    gpxService: { handleGPXImport: vi.fn() },
}));
vi.mock('../../recordingService', () => ({
    recordingService: {
        toggleRecording: vi.fn(),
        stopRecording: vi.fn(),
        generateSuggestedName: vi.fn(),
    },
}));
vi.mock('../../geoStats', () => ({ calculateTrackStats: vi.fn() }));
vi.mock('../../utils', () => ({ fmtDuration: vi.fn(() => '00:00') }));
vi.mock('../../iap', () => ({ showUpgradePrompt: vi.fn() }));
vi.mock('../../gpxHistoryService', () => ({
    gpxHistoryService: { getHistory: vi.fn(() => []), addEntry: vi.fn() },
    loadHistory: vi.fn(() => []),
    removeFromHistory: vi.fn(),
    updateHistoryEntryLocation: vi.fn(),
}));
vi.mock('../../geo', () => ({
    lngLatToWorld: vi.fn(),
    getCountryCode: vi.fn(() => null),
    COUNTRY_NAMES: {},
}));
vi.mock('../../geocodingService', () => ({
    getPlaceName: vi.fn().mockResolvedValue('Test Location'),
}));
vi.mock('../../routeManager', () => ({
    setRoutePlanningMode: mockSetRoutePlanningMode,
}));
vi.mock('../../preparedRoutes/preparedRouteService', () => ({
    preparedRouteService: mockPreparedRouteService,
}));
vi.mock('../../releaseFlags', () => ({
    releaseFlags: { isEnabled: vi.fn(() => true) },
}));
vi.mock('../icons', () => ({ ICON_CLOSE: '✕', ICON_LOCK: '🔒' }));
vi.mock('../core/SheetManager', () => ({
    sheetManager: { open: vi.fn(), close: vi.fn() },
}));
vi.mock('../tooltip', () => ({
    createTooltip: vi.fn(() => ({ dispose: vi.fn() })),
}));
vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: vi.fn(() => false) },
}));
import { TrackSheet } from './TrackSheet';
import { state } from '../../state';
import { sheetManager } from '../core/SheetManager';
import {
    activateGPXLayer,
    hideAllGPXLayers,
    removeGPXLayer,
    showOnlyGPXLayer,
} from '../../gpxLayers';
import { loadHistory, removeFromHistory } from '../../gpxHistoryService';
import { updateElevationProfile } from '../../profile';

describe('TrackSheet — showSaveTrackPrompt', () => {
    let sheet: TrackSheet;

    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="track"></div>';
        sheet = new TrackSheet();
        (sheet as any).element = document.getElementById('track');
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('resolve avec le nom saisi sur Enregistrer', async () => {
        const promise = (sheet as any).showSaveTrackPrompt('Defaut');
        const input = document.getElementById(
            'rec-save-name'
        ) as HTMLInputElement;
        input.value = 'Ma Rando';
        document.getElementById('rec-save-confirm')?.click();
        await expect(promise).resolves.toBe('Ma Rando');
    });

    it('resolve avec null sur Annuler', async () => {
        const promise = (sheet as any).showSaveTrackPrompt('Defaut');
        document.getElementById('rec-save-cancel')?.click();
        await expect(promise).resolves.toBeNull();
    });

    it('resolve avec null sur Escape', async () => {
        const promise = (sheet as any).showSaveTrackPrompt('Defaut');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await expect(promise).resolves.toBeNull();
    });

    it('resolve avec la valeur sur Entrée', async () => {
        const promise = (sheet as any).showSaveTrackPrompt('Defaut');
        const input = document.getElementById(
            'rec-save-name'
        ) as HTMLInputElement;
        input.value = 'Saisie';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await expect(promise).resolves.toBe('Saisie');
    });

    it('resolve avec le nom suggéré si input vide sur Enregistrer', async () => {
        const promise = (sheet as any).showSaveTrackPrompt('Suggere');
        const input = document.getElementById(
            'rec-save-name'
        ) as HTMLInputElement;
        input.value = '   ';
        document.getElementById('rec-save-confirm')?.click();
        await expect(promise).resolves.toBe('Suggere');
    });

    it('resolve avec null sur clic fond overlay', async () => {
        const promise = (sheet as any).showSaveTrackPrompt('Defaut');
        const overlay = document.body.lastElementChild as HTMLElement;
        expect(overlay).not.toBeNull();
        overlay.click();
        await expect(promise).resolves.toBeNull();
    });

    it('nettoie le DOM et le listener Escape après dismiss', async () => {
        const promise = (sheet as any).showSaveTrackPrompt('Defaut');
        document.getElementById('rec-save-cancel')?.click();
        await promise;
        expect(document.getElementById('rec-save-cancel')).toBeNull();
    });
});

describe('TrackSheet - Prepared Routes library', () => {
    let sheet: TrackSheet;

    beforeEach(() => {
        vi.clearAllMocks();
        mockIsProActive.mockReturnValue(false);
        (state as any).routeWaypoints = [];
        (state as any).routeComputation = null;
        (state as any).routeDraftDirty = false;
        (state as any).routeDraftSourceLayerId = null;
        document.body.innerHTML = `
            <div id="track">
                <div class="sheet-title"></div>
                <section id="prepared-routes-section" hidden>
                    <div id="prepared-storage-error" hidden></div>
                    <div id="prepared-routes-list"></div>
                    <div id="prepared-routes-empty"></div>
                    <div id="legacy-tracks-anchor">
                        <div id="gpx-layers-list"></div>
                    </div>
                </section>
                <div id="outing-tracks-anchor" class="track-outing-only"></div>
                <div class="track-outing-only"></div>
            </div>`;
        (state as any).preparedRoutes = [
            {
                id: 'route-local-1',
                name: 'Tour local Free',
                favorite: false,
                guidanceQuality: 'approximate',
                stats: {
                    distance: 6.2,
                    ascent: 410,
                    technicalDifficulty: {
                        status: 'unknown',
                        sacLevel: null,
                        coveragePercent: 0,
                    },
                    effort: { level: 'moderate' },
                    light: {
                        etaAt: null,
                        daylightMarginMinutes: null,
                    },
                },
            },
        ];
        sheet = new TrackSheet();
        (sheet as any).element = document.getElementById('track');
    });

    afterEach(() => {
        document.body.innerHTML = '';
        (state as any).preparedRoutes = [];
    });

    it('transitions between Outing and Library without a second sheet', () => {
        (sheet as any).syncDestination('library');
        expect(
            (document.getElementById('prepared-routes-section') as HTMLElement)
                .hidden
        ).toBe(false);
        expect(
            (document.getElementById('gpx-layers-list') as HTMLElement).hidden
        ).toBe(false);
        expect(document.querySelector('.sheet-title')?.textContent).toBe(
            'nav.tab.library'
        );

        (sheet as any).syncDestination('outing');
        expect(
            (document.getElementById('prepared-routes-section') as HTMLElement)
                .hidden
        ).toBe(true);
        expect(
            (document.getElementById('gpx-layers-list') as HTMLElement).hidden
        ).toBe(false);
        expect(
            document.getElementById('gpx-layers-list')?.parentElement?.id
        ).toBe('outing-tracks-anchor');
    });

    it('renders an approximate warning and keeps local actions available to Free', async () => {
        (sheet as any).renderPreparedRoutes();
        expect(
            document.querySelector('.prepared-route-card')?.textContent
        ).toContain('Tour local Free');
        expect(
            document.querySelector('.prepared-route-warning')
        ).not.toBeNull();
        expect(document.querySelector('.prepared-readiness')).not.toBeNull();
        expect(
            document.querySelector('.prepared-readiness')?.textContent
        ).toContain('readiness.offline.not-measured');
        expect(
            document.querySelector('.prepared-readiness')?.textContent
        ).not.toContain('readiness.route.guidance-approximate');
        expect(
            document.querySelector('[data-route-action="guidance"]')
        ).not.toBeNull();
        expect(
            document.querySelector('.prepared-route-card')?.textContent
        ).not.toContain('0%');

        (
            document.querySelector(
                '[data-route-action="favorite"]'
            ) as HTMLButtonElement
        ).click();
        await vi.waitFor(() =>
            expect(
                mockPreparedRouteService.toggleFavorite
            ).toHaveBeenCalledWith('route-local-1')
        );
        expect(mockIsProActive).not.toHaveBeenCalled();
    });

    it('opens a saved route in the existing planning flow', async () => {
        (state as any).activeGPXLayerId = 'prepared-route-local-1';
        (sheet as any).renderPreparedRoutes();
        (
            document.querySelector(
                '[data-route-action="open"]'
            ) as HTMLButtonElement
        ).click();
        await vi.waitFor(() =>
            expect(mockPreparedRouteService.load).toHaveBeenCalledWith(
                'route-local-1'
            )
        );
        expect(sheetManager.close).toHaveBeenCalled();
        expect(mockSetRoutePlanningMode).toHaveBeenCalledWith(true, {
            announceHint: false,
        });
        expect(updateElevationProfile).toHaveBeenCalledWith(
            'prepared-route-local-1'
        );
    });

    it('does not replace a dirty draft when opening a saved route is cancelled', async () => {
        (state as any).routeWaypoints = [
            { lat: 46.5, lon: 7.5 },
            { lat: 46.6, lon: 7.6 },
        ];
        (state as any).routeComputation = { distance: 5 };
        (state as any).routeDraftDirty = true;
        (sheet as any).renderPreparedRoutes();

        (
            document.querySelector(
                '[data-route-action="open"]'
            ) as HTMLButtonElement
        ).click();
        await vi.waitFor(() =>
            expect(
                document.getElementById('prepared-draft-cancel')
            ).not.toBeNull()
        );
        document.getElementById('prepared-draft-cancel')?.click();

        await Promise.resolve();
        expect(mockPreparedRouteService.load).not.toHaveBeenCalled();
        expect(mockSetRoutePlanningMode).not.toHaveBeenCalled();
    });

    it('saves a dirty draft before opening another prepared route', async () => {
        (state as any).routeWaypoints = [
            { lat: 46.5, lon: 7.5 },
            { lat: 46.6, lon: 7.6 },
        ];
        (state as any).routeComputation = { distance: 5 };
        (state as any).routeDraftDirty = true;
        (sheet as any).renderPreparedRoutes();

        (
            document.querySelector(
                '[data-route-action="open"]'
            ) as HTMLButtonElement
        ).click();
        await vi.waitFor(() =>
            expect(
                document.getElementById('prepared-draft-save')
            ).not.toBeNull()
        );
        document.getElementById('prepared-draft-save')?.click();

        await vi.waitFor(() =>
            expect(mockPreparedRouteService.saveCurrentDraft).toHaveBeenCalled()
        );
        expect(mockPreparedRouteService.load).toHaveBeenCalledWith(
            'route-local-1'
        );
    });
});

describe('TrackSheet — updateRecUI', () => {
    let sheet: TrackSheet;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(loadHistory).mockReturnValue([]);
        document.body.dataset.trackDestination = 'outing';
        document.body.innerHTML = `
            <div id="track">
                <div class="nav-tab" data-tab="track"></div>
                <button id="rec-btn-sheet" class="track-btn rec">
                    <span class="trk-rec-label">REC</span>
                </button>
                <button id="import-gpx-sheet"></button>
                <div id="rec-recording-upsell" class="rec-upsell-banner"></div>
            </div>
        `;
        sheet = new TrackSheet();
        (sheet as any).element = document.getElementById('track');
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it("ajoute la classe recording pendant l'enregistrement", () => {
        state.isRecording = true;
        (sheet as any).updateRecUI();
        const track = document.getElementById('track')!;
        expect(track.classList.contains('recording')).toBe(true);
        expect(
            document
                .getElementById('rec-btn-sheet')
                ?.classList.contains('active')
        ).toBe(true);
    });

    it("retire la classe recording quand l'enregistrement s'arrête", () => {
        state.isRecording = false;
        (sheet as any).updateRecUI();
        const track = document.getElementById('track')!;
        expect(track.classList.contains('recording')).toBe(false);
        expect(
            document
                .getElementById('rec-btn-sheet')
                ?.classList.contains('active')
        ).toBe(false);
    });

    it("ajoute la classe is-pro pendant l'enregistrement si Pro", () => {
        state.isRecording = true;
        mockIsProActive.mockReturnValue(true);
        (sheet as any).updateRecUI();
        const track = document.getElementById('track')!;
        expect(track.classList.contains('recording')).toBe(true);
        expect(track.classList.contains('is-pro')).toBe(true);
    });

    it("n'ajoute pas is-pro pour les Free", () => {
        state.isRecording = true;
        mockIsProActive.mockReturnValue(false);
        (sheet as any).updateRecUI();
        const track = document.getElementById('track')!;
        expect(track.classList.contains('recording')).toBe(true);
        expect(track.classList.contains('is-pro')).toBe(false);
    });

    it("retire les classes recording et is-pro quand l'enregistrement s'arrête", () => {
        state.isRecording = true;
        mockIsProActive.mockReturnValue(true);
        (sheet as any).updateRecUI();
        const track = document.getElementById('track')!;
        expect(track.classList.contains('recording')).toBe(true);
        expect(track.classList.contains('is-pro')).toBe(true);

        state.isRecording = false;
        mockIsProActive.mockReturnValue(false);
        (sheet as any).updateRecUI();
        expect(track.classList.contains('recording')).toBe(false);
        expect(track.classList.contains('is-pro')).toBe(false);
    });

    it("gère la classe has-notif sur l'onglet nav", () => {
        state.isRecording = true;
        (sheet as any).updateRecUI();
        const navTab = document.querySelector('.nav-tab[data-tab="track"]')!;
        expect(navTab.classList.contains('has-notif')).toBe(true);

        state.isRecording = false;
        (sheet as any).updateRecUI();
        expect(navTab.classList.contains('has-notif')).toBe(false);
    });
});

describe('TrackSheet — trace roles and visibility', () => {
    let sheet: TrackSheet;

    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = `
            <div id="track">
                <div id="gpx-layers-list"></div>
                <div id="track-stats-context"></div>
                <div id="track-dist"></div>
                <div id="track-points"></div>
                <div id="track-dplus"></div>
                <div id="track-dminus"></div>
                <div id="track-duration"></div>
            </div>`;
        (state as any).gpxLayers = [
            {
                id: 'gpx-viewed',
                name: 'Tour GPX',
                color: '#00ff00',
                visible: true,
                isManualRoute: false,
                rawData: { tracks: [{ points: [] }] },
                stats: {
                    distance: 8.01,
                    dPlus: 29,
                    dMinus: 33,
                    pointCount: 219,
                    estimatedTime: 120,
                },
            },
        ];
        (state as any).activeGPXLayerId = 'gpx-viewed';
        (state as any).recordedPoints = [];
        (state as any).recordedMesh = null;
        (state as any).isRecording = false;
        (state as any).routeWaypoints = [];
        (state as any).routeComputation = null;
        (state as any).routeDraftDirty = false;
        (state as any).routeDraftSourceLayerId = null;
        sheet = new TrackSheet();
        (sheet as any).element = document.getElementById('track');
    });

    afterEach(() => {
        document.body.innerHTML = '';
        delete document.body.dataset.trackDestination;
        vi.mocked(loadHistory).mockReturnValue([]);
        (state as any).gpxLayers = [];
    });

    it('shows the viewed trace separately and prepares it only through the explicit action', async () => {
        (sheet as any).renderUnifiedTrackList();

        expect(document.querySelector('.track-layers-overview')).not.toBeNull();
        expect(
            document.querySelector('[data-action="prepare-draft"]')
        ).not.toBeNull();
        expect(
            mockPreparedRouteService.prepareGPXLayerAsDraft
        ).not.toHaveBeenCalled();

        (
            document.querySelector(
                '[data-action="prepare-draft"]'
            ) as HTMLButtonElement
        ).click();

        await vi.waitFor(() =>
            expect(
                mockPreparedRouteService.prepareGPXLayerAsDraft
            ).toHaveBeenCalledWith((state as any).gpxLayers[0])
        );
        expect(activateGPXLayer).toHaveBeenCalledWith('gpx-viewed');
        expect(mockSetRoutePlanningMode).toHaveBeenCalledWith(true, {
            announceHint: false,
        });
    });

    it('shows only loaded tracks in Outing while Library keeps the GPX history', () => {
        vi.mocked(loadHistory).mockReturnValue([
            {
                id: 'gpx-viewed',
                name: 'Tour GPX',
                color: '#00ff00',
                timestamp: Date.now(),
                locationName: 'Test',
                centerLat: 46.5,
                centerLon: 7.5,
                bounds: {
                    minLat: 46.49,
                    maxLat: 46.51,
                    minLon: 7.49,
                    maxLon: 7.51,
                },
                simplifiedPoints: [
                    { lat: 46.49, lon: 7.49 },
                    { lat: 46.51, lon: 7.51 },
                ],
                stats: (state as any).gpxLayers[0].stats,
            },
            {
                id: 'gpx-archived',
                name: 'Trace archivée',
                color: '#888888',
                timestamp: Date.now(),
                locationName: 'Test',
                centerLat: 46.6,
                centerLon: 7.6,
                bounds: {
                    minLat: 46.59,
                    maxLat: 46.61,
                    minLon: 7.59,
                    maxLon: 7.61,
                },
                simplifiedPoints: [
                    { lat: 46.59, lon: 7.59 },
                    { lat: 46.61, lon: 7.61 },
                ],
                stats: (state as any).gpxLayers[0].stats,
            },
        ] as any);

        (sheet as any).renderUnifiedTrackList();
        expect(
            document.getElementById('gpx-layers-list')?.textContent
        ).toContain('Tour GPX');
        expect(
            document.getElementById('gpx-layers-list')?.textContent
        ).not.toContain('Trace archivée');
        expect(
            document.getElementById('gpx-layers-list')?.textContent
        ).toContain('track.layers.loadedTitle');

        document.body.dataset.trackDestination = 'library';
        (sheet as any).renderUnifiedTrackList();
        expect(
            document.getElementById('gpx-layers-list')?.textContent
        ).toContain('Trace archivée');
    });

    it('recomputes the catalogue immediately when switching destinations', () => {
        const track = document.getElementById('track')!;
        track.insertAdjacentHTML(
            'beforeend',
            `<section id="prepared-routes-section" hidden>
                <div id="legacy-tracks-anchor"></div>
            </section>
            <div id="outing-tracks-anchor" class="track-outing-only"></div>`
        );
        vi.mocked(loadHistory).mockReturnValue([
            {
                id: 'gpx-viewed',
                name: 'Tour GPX',
                color: '#00ff00',
                timestamp: Date.now(),
                locationName: 'Test',
                centerLat: 46.5,
                centerLon: 7.5,
                bounds: {
                    minLat: 46.49,
                    maxLat: 46.51,
                    minLon: 7.49,
                    maxLon: 7.51,
                },
                simplifiedPoints: [
                    { lat: 46.49, lon: 7.49 },
                    { lat: 46.51, lon: 7.51 },
                ],
                stats: (state as any).gpxLayers[0].stats,
            },
            {
                id: 'gpx-archived',
                name: 'Trace archivée',
                color: '#888888',
                timestamp: Date.now(),
                locationName: 'Test',
                centerLat: 46.6,
                centerLon: 7.6,
                bounds: {
                    minLat: 46.59,
                    maxLat: 46.61,
                    minLon: 7.59,
                    maxLon: 7.61,
                },
                simplifiedPoints: [
                    { lat: 46.59, lon: 7.59 },
                    { lat: 46.61, lon: 7.61 },
                ],
                stats: (state as any).gpxLayers[0].stats,
            },
        ] as any);

        (sheet as any).syncDestination('library');
        expect(
            document.getElementById('gpx-layers-list')?.textContent
        ).toContain('Trace archivée');
        expect(
            document.getElementById('gpx-layers-list')?.parentElement?.id
        ).toBe('legacy-tracks-anchor');

        (sheet as any).syncDestination('outing');
        expect(
            document.getElementById('gpx-layers-list')?.textContent
        ).not.toContain('Trace archivée');
        expect(
            document.getElementById('gpx-layers-list')?.textContent
        ).toContain('Tour GPX');
        expect(
            document.getElementById('gpx-layers-list')?.parentElement?.id
        ).toBe('outing-tracks-anchor');
    });

    it('unloads from Outing without deleting history, but deletes from Library', () => {
        (sheet as any).renderUnifiedTrackList();
        (
            document.querySelector(
                '[data-action="remove"]'
            ) as HTMLButtonElement
        ).click();
        expect(removeGPXLayer).toHaveBeenCalledWith('gpx-viewed');
        expect(removeFromHistory).not.toHaveBeenCalled();

        vi.clearAllMocks();
        document.body.dataset.trackDestination = 'library';
        (sheet as any).renderUnifiedTrackList();
        (
            document.querySelector(
                '[data-action="remove"]'
            ) as HTMLButtonElement
        ).click();
        expect(removeGPXLayer).toHaveBeenCalledWith('gpx-viewed');
        expect(removeFromHistory).toHaveBeenCalledWith('gpx-viewed');
    });

    it('keeps a dirty manual draft until replacement is explicitly confirmed', async () => {
        (state as any).routeWaypoints = [
            { lat: 46.5, lon: 7.5 },
            { lat: 46.6, lon: 7.6 },
        ];
        (state as any).routeComputation = { distance: 4 };
        (state as any).routeDraftDirty = true;
        (sheet as any).renderUnifiedTrackList();

        (
            document.querySelector(
                '[data-action="prepare-draft"]'
            ) as HTMLButtonElement
        ).click();
        await vi.waitFor(() =>
            expect(
                document.getElementById('prepared-draft-replace')
            ).not.toBeNull()
        );
        expect(
            mockPreparedRouteService.prepareGPXLayerAsDraft
        ).not.toHaveBeenCalled();

        document.getElementById('prepared-draft-replace')?.click();
        await vi.waitFor(() =>
            expect(
                mockPreparedRouteService.prepareGPXLayerAsDraft
            ).toHaveBeenCalled()
        );
    });

    it('offers quick visibility actions without touching REC', () => {
        (sheet as any).renderUnifiedTrackList();

        (
            document.querySelector(
                '[data-layer-overview-action="only"]'
            ) as HTMLButtonElement
        ).click();
        expect(showOnlyGPXLayer).toHaveBeenCalledWith('gpx-viewed');

        (
            document.querySelector(
                '[data-layer-overview-action="hide-all"]'
            ) as HTMLButtonElement
        ).click();
        expect(hideAllGPXLayers).toHaveBeenCalledOnce();
    });

    it('keeps REC statistics explicit even while a reference trace is selected', () => {
        (state as any).isRecording = true;
        (state as any).recordedPoints = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
        ];

        (sheet as any).updateStats();

        expect(
            document.getElementById('track-stats-context')?.textContent
        ).toBe('track.statsContext.recording');
        expect(document.getElementById('track-points')?.textContent).toBe('1');
    });
});

describe('TrackSheet — DOM rendering', () => {
    let sheet: TrackSheet;
    let container: HTMLElement;

    beforeEach(() => {
        vi.clearAllMocks();
        container = document.createElement('div');
        container.id = 'sheet-container';
        document.body.appendChild(container);

        document.body.innerHTML += `
            <div id="track" class="bottom-sheet">
                <button id="close-track"></button>
                <div id="track-empty">
                    <p class="empty-state-title" data-i18n="track.empty.title">Aucun parcours</p>
                </div>
                <div id="track-stats">
                    <div class="stat-card">
                        <div class="stat-card-label" data-i18n="track.stats.distance">Distance</div>
                        <div class="stat-card-value" id="track-dist">0.0 km</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-label" data-i18n="track.stats.dplus">D+</div>
                        <div class="stat-card-value" id="track-dplus">0</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-label" data-i18n="track.stats.dminus">D-</div>
                        <div class="stat-card-value" id="track-dminus">0</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-label" data-i18n="track.stats.points">Points</div>
                        <div class="stat-card-value" id="track-points">0</div>
                    </div>
                </div>
                <div id="track-layers-list"></div>
                <button id="rec-btn-sheet" class="track-btn rec">
                    <span class="trk-rec-label">REC</span>
                </button>
                <button id="import-gpx-sheet"></button>
                <div id="track-history"></div>
            </div>
        `;
        sheet = new TrackSheet();
        (sheet as any).element = document.getElementById('track');
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('close button has aria-label', () => {
        sheet.render();
        const btn = document.getElementById('close-track');
        expect(btn?.getAttribute('aria-label')).toBe('track.aria.close');
    });

    it('close button click closes sheet', () => {
        sheet.render();
        const btn = document.getElementById('close-track')!;
        btn.click();
        expect(sheetManager.close).toHaveBeenCalled();
    });

    it('stats display exists in DOM', () => {
        sheet.render();
        expect(document.getElementById('track-dist')).not.toBeNull();
        expect(document.getElementById('track-dplus')).not.toBeNull();
        expect(document.getElementById('track-dminus')).not.toBeNull();
        expect(document.getElementById('track-points')).not.toBeNull();
    });

    it('empty state is visible when no tracks', () => {
        const el = document.getElementById('track-empty');
        expect(el).not.toBeNull();
    });

    it('disposes cleanly', () => {
        expect(() => sheet.dispose()).not.toThrow();
    });
});
