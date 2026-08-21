import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
    mockIsProActive,
    mockPreparedRouteService,
    mockSetRoutePlanningMode,
    mockCorridorReadinessService,
    mockBuildCorridorPlan,
    mockCorridorInstall,
    mockGetCorridorPreflight,
} = vi.hoisted(() => ({
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
    mockCorridorReadinessService: {
        getInput: vi.fn((): unknown => undefined),
        shouldMeasure: vi.fn(() => false),
        measure: vi.fn().mockResolvedValue(false),
        invalidate: vi.fn(),
    },
    mockBuildCorridorPlan: vi.fn(() => ({
        schemaVersion: 1,
        routeId: 'route-local-1',
        radiusMeters: 1_000,
        minLod: 5,
        maxLod: 14,
        tiles: [{ zoom: 14, tx: 8_510, ty: 5_790 }],
        tileCount: 1,
        estimatedSizeBytes: 80 * 1024,
    })),
    mockCorridorInstall: vi.fn(),
    mockGetCorridorPreflight: vi.fn(),
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
        IS_OFFLINE: false,
        isNetworkAvailable: true,
        connectionType: 'wifi',
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
    gpxService: {
        handleGPXImport: vi.fn(),
        buildGPXStringFromLayer: vi.fn(() => '<gpx />'),
    },
}));
vi.mock('../../recordingService', () => ({
    recordingService: {
        toggleRecording: vi.fn(),
        stopRecording: vi.fn(),
        generateSuggestedName: vi.fn(),
        saveToFile: vi.fn(),
    },
}));
vi.mock('../../geoStats', () => ({
    calculateTrackStats: vi.fn(() => ({ distance: 0, dPlus: 0, dMinus: 0 })),
}));
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
vi.mock('../../readiness/routeCorridorReadiness', () => ({
    routeCorridorReadinessService: mockCorridorReadinessService,
}));
vi.mock('../../readiness/routeCorridor', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../readiness/routeCorridor')>()),
    buildRouteCorridorPlan: mockBuildCorridorPlan,
}));
vi.mock('../../readiness/routeCorridorInstall', () => ({
    createRouteCorridorInstallService: vi.fn(() => ({
        install: mockCorridorInstall,
    })),
}));
vi.mock('../../readiness/routeCorridorPreflight', () => ({
    getRouteCorridorPreflight: mockGetCorridorPreflight,
}));
vi.mock('../icons', () => ({
    ICON_CLOSE: '✕',
    ICON_COPY: '⧉',
    ICON_LOCK: '🔒',
    ICON_MAP_LAYERS: '⌑',
    ICON_STAR: '☆',
}));
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
    addGPXLayer,
    hideAllGPXLayers,
    removeGPXLayer,
    showOnlyGPXLayer,
} from '../../gpxLayers';
import { showUpgradePrompt } from '../../iap';
import { loadHistory, removeFromHistory } from '../../gpxHistoryService';
import { updateElevationProfile } from '../../profile';
import { recordingService } from '../../recordingService';

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

    it('resolve avec null sur Ne pas enregistrer', async () => {
        const promise = (sheet as any).showSaveTrackPrompt('Defaut');
        document.getElementById('rec-save-discard')?.click();
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
        document.getElementById('rec-save-discard')?.click();
        await promise;
        expect(document.getElementById('rec-save-discard')).toBeNull();
    });
});

describe('TrackSheet - Prepared Routes library', () => {
    let sheet: TrackSheet;

    beforeEach(() => {
        vi.clearAllMocks();
        mockIsProActive.mockReturnValue(false);
        mockCorridorReadinessService.getInput.mockReturnValue(undefined);
        mockCorridorReadinessService.measure.mockResolvedValue(false);
        mockGetCorridorPreflight.mockResolvedValue({
            networkType: 'wifi',
            networkAllowed: true,
            requiresCellularConfirmation: false,
            quotaStatus: 'sufficient',
            estimatedSizeBytes: 80 * 1024,
            availableBytes: 10 * 1024 * 1024,
        });
        mockCorridorInstall.mockImplementation(async (_plan, options) => {
            options.onProgress?.({
                processedResourceCount: 1,
                successfulResourceCount: 1,
                failedResourceCount: 0,
                totalResourceCount: 1,
                sizeBytes: 120,
            });
            return {
                status: 'completed',
                manifest: {},
                deletedResourceCount: 0,
            };
        });
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
                geometry: [
                    { lat: 46.8, lon: 7.1 },
                    { lat: 46.9, lon: 7.2 },
                ],
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
        ).toBe(true);
        expect(
            document.getElementById('gpx-layers-list')?.parentElement?.id
        ).toBe('legacy-tracks-anchor');
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
        expect(mockIsProActive).toHaveReturnedWith(false);
    });

    it('keeps every route accessible in Free and gates only map overlay', () => {
        (sheet as any).renderPreparedRoutes();

        expect(
            document.querySelector('[data-route-action="open"]')
        ).not.toBeNull();
        expect(
            document.querySelector('[data-route-action="guidance"]')
        ).not.toBeNull();
        const overlay = document.querySelector(
            '[data-route-action="overlay"]'
        ) as HTMLButtonElement;
        expect(overlay.classList.contains('is-pro-locked')).toBe(true);
        expect(
            document.querySelectorAll('.prepared-route-primary-actions button')
        ).toHaveLength(2);
        expect(
            document.querySelectorAll(
                '.prepared-route-secondary-actions button'
            )
        ).toHaveLength(4);
        expect(overlay.textContent).toContain('⌑');
        expect(overlay.querySelector('span')).toBeNull();
        overlay.click();
        expect(showUpgradePrompt).toHaveBeenCalledWith('multi_gpx');
        expect(addGPXLayer).not.toHaveBeenCalled();
    });

    it('lets Pro add a prepared route as a map overlay', () => {
        mockIsProActive.mockReturnValue(true);
        (sheet as any).renderPreparedRoutes();

        (
            document.querySelector(
                '[data-route-action="overlay"]'
            ) as HTMLButtonElement
        ).click();

        expect(addGPXLayer).toHaveBeenCalledWith(
            expect.objectContaining({ tracks: expect.any(Array) }),
            'Tour local Free',
            expect.objectContaining({
                id: 'prepared-overlay-route-local-1',
                source: 'prepared',
                persistHistory: false,
            })
        );
    });

    it('affiche une couverture locale mesurée sans masquer le guidage', () => {
        mockCorridorReadinessService.getInput.mockReturnValue({
            kind: 'evidence',
            evidence: {
                source: 'corridor-local-index-v1',
                observedAt: new Date().toISOString(),
                staleAfterMs: 300_000,
                data: {
                    coveragePercent: 50,
                    coveredTileCount: 5,
                    requiredTileCount: 10,
                    sizeBytes: 1_000,
                    corridorId: null,
                },
            },
        });

        (sheet as any).renderPreparedRoutes();

        expect(
            document.querySelector('.prepared-readiness')?.textContent
        ).toContain('readiness.status.measured');
        expect(
            document.querySelector('.prepared-readiness-coverage')?.textContent
        ).toBe('readiness.offline.coverage');
        expect(
            document.querySelector('[data-route-action="guidance"]')
        ).not.toBeNull();
    });

    it('télécharge un corridor Free de 1 km et remesure la couverture', async () => {
        (sheet as any).renderPreparedRoutes();

        expect(document.querySelector('[data-corridor-radius]')).toBeNull();
        (
            document.querySelector(
                '[data-route-action="corridor"]'
            ) as HTMLButtonElement
        ).click();

        await vi.waitFor(() => expect(mockCorridorInstall).toHaveBeenCalled());
        expect(mockBuildCorridorPlan).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'route-local-1' }),
            { radiusMeters: 1_000 }
        );
        expect(mockCorridorInstall).toHaveBeenCalledWith(
            expect.objectContaining({ routeId: 'route-local-1' }),
            expect.objectContaining({
                isPro: false,
                replaceFree: false,
                networkAllowed: true,
            })
        );
        await vi.waitFor(() =>
            expect(
                mockCorridorReadinessService.invalidate
            ).toHaveBeenCalledWith('route-local-1')
        );
        expect(mockCorridorReadinessService.measure).toHaveBeenCalled();
    });

    it('propose les rayons 0,5/1/2 km à Pro', () => {
        mockIsProActive.mockReturnValue(true);
        (sheet as any).renderPreparedRoutes();

        const select = document.querySelector(
            '[data-corridor-radius]'
        ) as HTMLSelectElement;
        expect([...select.options].map((option) => option.value)).toEqual([
            '500',
            '1000',
            '2000',
        ]);
    });

    it('demande un accord explicite avant tout téléchargement cellulaire', async () => {
        mockGetCorridorPreflight.mockResolvedValue({
            networkType: 'cellular',
            networkAllowed: true,
            requiresCellularConfirmation: true,
            quotaStatus: 'sufficient',
            estimatedSizeBytes: 80 * 1024,
            availableBytes: 10 * 1024 * 1024,
        });
        (sheet as any).renderPreparedRoutes();

        (
            document.querySelector(
                '[data-route-action="corridor"]'
            ) as HTMLButtonElement
        ).click();
        await vi.waitFor(() =>
            expect(
                document.getElementById('confirm-dialog-overlay')
            ).not.toBeNull()
        );
        expect(mockCorridorInstall).not.toHaveBeenCalled();
        (
            document.querySelector(
                '#confirm-dialog-overlay [data-action="cancel"]'
            ) as HTMLButtonElement
        ).click();
        await Promise.resolve();
        expect(mockCorridorInstall).not.toHaveBeenCalled();
    });

    it('annule le transfert en cours depuis la carte sans perdre le contrôle UI', async () => {
        let receivedSignal: AbortSignal | undefined;
        mockCorridorInstall.mockImplementation(
            async (_plan, options) =>
                new Promise((resolve) => {
                    receivedSignal = options.signal;
                    options.onProgress?.({
                        processedResourceCount: 0,
                        successfulResourceCount: 0,
                        failedResourceCount: 0,
                        totalResourceCount: 3,
                        sizeBytes: 0,
                    });
                    options.signal?.addEventListener('abort', () =>
                        resolve({
                            status: 'cancelled',
                            manifest: {},
                            deletedResourceCount: 0,
                        })
                    );
                })
        );
        (sheet as any).renderPreparedRoutes();
        (
            document.querySelector(
                '[data-route-action="corridor"]'
            ) as HTMLButtonElement
        ).click();

        await vi.waitFor(() =>
            expect(
                document.querySelector('.prepared-corridor-cancel')
            ).not.toBeNull()
        );
        (
            document.querySelector(
                '.prepared-corridor-cancel'
            ) as HTMLButtonElement
        ).click();

        await vi.waitFor(() => expect(receivedSignal?.aborted).toBe(true));
        await vi.waitFor(() =>
            expect(
                document.querySelector('.prepared-corridor-download')
            ).not.toBeNull()
        );
    });

    it('confirme le remplacement Free avant de relancer avec replaceFree', async () => {
        mockCorridorInstall
            .mockResolvedValueOnce({
                status: 'replacement-required',
                existingManifest: { id: 'old-free' },
            })
            .mockResolvedValueOnce({
                status: 'completed',
                manifest: {},
                deletedResourceCount: 1,
            });
        (sheet as any).renderPreparedRoutes();
        (
            document.querySelector(
                '[data-route-action="corridor"]'
            ) as HTMLButtonElement
        ).click();

        await vi.waitFor(() =>
            expect(
                document.getElementById('confirm-dialog-overlay')
            ).not.toBeNull()
        );
        expect(mockCorridorInstall).toHaveBeenCalledTimes(1);
        (
            document.querySelector(
                '#confirm-dialog-overlay [data-action="confirm"]'
            ) as HTMLButtonElement
        ).click();

        await vi.waitFor(() =>
            expect(mockCorridorInstall).toHaveBeenLastCalledWith(
                expect.anything(),
                expect.objectContaining({ replaceFree: true })
            )
        );
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
        mockIsProActive.mockReturnValue(false);
        vi.mocked(loadHistory).mockReturnValue([]);
        document.body.dataset.trackDestination = 'outing';
        document.body.innerHTML = `
            <div id="track">
                <div class="nav-tab" data-tab="track"></div>
                <button id="rec-btn-sheet" class="track-btn rec">
                    <span class="trk-rec-label">REC</span>
                </button>
                <button id="import-gpx-sheet"></button>
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
        mockIsProActive.mockReturnValue(false);
        document.body.innerHTML = `
            <div id="track">
                <div id="gpx-layers-list"></div>
                <div id="outing-dashboard">
                    <section id="outing-rec-card" data-outing-state="recording"></section>
                </div>
                <div id="track-dist"></div>
                <div id="track-pace"></div>
                <div id="track-points"></div>
                <div id="track-dplus"></div>
                <div id="track-dminus"></div>
                <div id="track-duration"></div>
                <div id="track-altitude"></div>
                <div id="track-gps-quality"></div>
            </div>`;
        document.body.dataset.trackDestination = 'library';
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
        vi.mocked(loadHistory).mockReturnValue([
            {
                id: 'gpx-viewed',
                name: 'Tour GPX',
                color: '#00ff00',
                source: 'rec',
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
                    { lat: 46.49, lon: 7.49, ele: 1000 },
                    { lat: 46.51, lon: 7.51, ele: 1010 },
                ],
                stats: (state as any).gpxLayers[0].stats,
            },
        ] as any);
        sheet = new TrackSheet();
        (sheet as any).element = document.getElementById('track');
    });

    afterEach(() => {
        document.body.innerHTML = '';
        delete document.body.dataset.trackDestination;
        vi.mocked(loadHistory).mockReturnValue([]);
        (state as any).gpxLayers = [];
    });

    it('presents REC history as an activity with an explicit repeat action', () => {
        (sheet as any).renderUnifiedTrackList();

        expect(document.querySelector('.track-layers-overview')).toBeNull();
        expect(
            document.querySelector(
                '.library-status-badge[data-status="recorded"]'
            )?.textContent
        ).toBe('preparedRoutes.library.statusRecorded');
        expect(
            document.querySelector('[data-action="legacy-convert"]')
        ).not.toBeNull();
        expect(
            document.querySelectorAll(
                '.library-activity-primary-actions button'
            )
        ).toHaveLength(2);
        expect(
            document.querySelector('.library-activity-view')?.textContent
        ).toBe('preparedRoutes.library.view');
        expect(
            document.querySelector('.library-activity-secondary-actions')
        ).not.toBeNull();
        expect(
            mockPreparedRouteService.prepareGPXLayerAsDraft
        ).not.toHaveBeenCalled();
    });

    it('shows export as a clear Pro action without locking the activity', async () => {
        (sheet as any).renderUnifiedTrackList();
        const freeExport = document.querySelector(
            '[data-action="export"]'
        ) as HTMLButtonElement;
        expect(freeExport.classList.contains('is-pro-locked')).toBe(true);
        freeExport.click();
        expect(showUpgradePrompt).toHaveBeenCalledWith('export_gpx');

        mockIsProActive.mockReturnValue(true);
        (state as any).gpxLayers = [];
        vi.mocked(recordingService.saveToFile).mockResolvedValue('tour.gpx');
        (sheet as any).renderUnifiedTrackList();
        (
            document.querySelector(
                '[data-action="export"]'
            ) as HTMLButtonElement
        ).click();

        await vi.waitFor(() =>
            expect(recordingService.saveToFile).toHaveBeenCalledWith(
                'Tour GPX',
                expect.stringContaining('<gpx')
            )
        );
    });

    it('keeps loaded tracks and GPX history in Library only', () => {
        vi.mocked(loadHistory).mockReturnValue([
            {
                id: 'gpx-viewed',
                name: 'Tour GPX',
                color: '#00ff00',
                source: 'rec',
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
                    { lat: 46.49, lon: 7.49, ele: 1000 },
                    { lat: 46.51, lon: 7.51, ele: 1010 },
                ],
                stats: (state as any).gpxLayers[0].stats,
            },
            {
                id: 'gpx-archived',
                name: 'Trace archivée',
                color: '#888888',
                source: 'import',
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
                    { lat: 46.59, lon: 7.59, ele: 900 },
                    { lat: 46.61, lon: 7.61, ele: 920 },
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
        ).toContain('Trace archivée');
        expect(document.querySelector('.track-layers-overview')).toBeNull();
        expect(
            document.querySelectorAll(
                '.library-status-badge[data-status="recorded"]'
            )
        ).toHaveLength(1);
        expect(
            document.querySelectorAll(
                '.library-status-badge[data-status="follow"]'
            )
        ).toHaveLength(1);

        document.body.dataset.trackDestination = 'outing';
        (sheet as any).renderUnifiedTrackList();
        expect(document.getElementById('gpx-layers-list')?.textContent).toBe(
            ''
        );
        expect(document.getElementById('gpx-layers-list')?.style.display).toBe(
            'none'
        );
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
        expect(document.getElementById('gpx-layers-list')?.textContent).toBe(
            ''
        );
        expect(
            document.getElementById('gpx-layers-list')?.parentElement?.id
        ).toBe('legacy-tracks-anchor');
        expect(
            (document.getElementById('gpx-layers-list') as HTMLElement).hidden
        ).toBe(true);
    });

    it('deletes a Library entry from both the loaded layers and history', () => {
        (sheet as any).renderUnifiedTrackList();
        (
            document.querySelector(
                '[data-action="remove"]'
            ) as HTMLButtonElement
        ).click();
        expect(removeGPXLayer).toHaveBeenCalledWith('gpx-viewed');
        expect(removeFromHistory).toHaveBeenCalledWith('gpx-viewed');
    });

    it('creates an itinerary from an activity without replacing a dirty draft', async () => {
        (state as any).routeWaypoints = [
            { lat: 46.5, lon: 7.5 },
            { lat: 46.6, lon: 7.6 },
        ];
        (state as any).routeComputation = { distance: 4 };
        (state as any).routeDraftDirty = true;
        (sheet as any).renderUnifiedTrackList();

        (
            document.querySelector(
                '[data-action="legacy-convert"]'
            ) as HTMLButtonElement
        ).click();
        await vi.waitFor(() =>
            expect(
                document.getElementById('confirm-dialog-overlay')
            ).not.toBeNull()
        );
        document
            .querySelector<HTMLButtonElement>('.confirm-dialog-accept')
            ?.click();
        await vi.waitFor(() =>
            expect(mockPreparedRouteService.convertLegacy).toHaveBeenCalled()
        );
        expect((state as any).routeDraftDirty).toBe(true);
        expect(
            mockPreparedRouteService.prepareGPXLayerAsDraft
        ).not.toHaveBeenCalled();
    });

    it('offers multi-visibility controls to Pro without touching REC', () => {
        mockIsProActive.mockReturnValue(true);
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
        document.body.dataset.trackDestination = 'outing';
        (state as any).isRecording = true;
        (state as any).recordingStartTime = 1000;
        (state as any).recordedPoints = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
        ];

        (sheet as any).updateStats();

        expect(document.getElementById('outing-dashboard')?.dataset.phase).toBe(
            'recording'
        );
        expect(document.getElementById('track-points')?.textContent).toBe('1');
    });
});

describe('TrackSheet — DOM rendering', () => {
    let sheet: TrackSheet;
    let container: HTMLElement;

    beforeEach(() => {
        vi.clearAllMocks();
        mockIsProActive.mockReturnValue(false);
        (state as any).isRecording = false;
        (state as any).recordedPoints = [];
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
                <input id="gpx-upload" type="file">
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

    it('lets a Free user name a completed REC before saving it internally', async () => {
        (state as any).isRecording = true;
        (state as any).recordedPoints = [
            { lat: 46.5, lon: 7.5, timestamp: 1_000 },
            { lat: 46.51, lon: 7.51, timestamp: 2_000 },
        ];
        vi.mocked(recordingService.generateSuggestedName).mockResolvedValue(
            'Sortie suggérée'
        );
        vi.mocked(recordingService.stopRecording).mockImplementation(
            async (_name, options) => {
                const selected =
                    await options?.resolveName?.('Sortie suggérée');
                return selected || 'Sortie suggérée';
            }
        );
        sheet.render();

        document.getElementById('rec-btn-sheet')?.click();
        await vi.waitFor(() =>
            expect(document.getElementById('rec-save-name')).not.toBeNull()
        );
        const input = document.getElementById(
            'rec-save-name'
        ) as HTMLInputElement;
        input.value = 'Ma sortie Free';
        document.getElementById('rec-save-confirm')?.click();

        await vi.waitFor(() =>
            expect(recordingService.stopRecording).toHaveBeenCalledWith(
                undefined,
                expect.objectContaining({
                    resolveName: expect.any(Function),
                })
            )
        );
    });

    it('empty state is visible when no tracks', () => {
        const el = document.getElementById('track-empty');
        expect(el).not.toBeNull();
    });

    it('disposes cleanly', () => {
        expect(() => sheet.dispose()).not.toThrow();
    });
});
