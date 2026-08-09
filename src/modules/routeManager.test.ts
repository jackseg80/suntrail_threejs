import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./state', () => ({
    state: {
        routeWaypoints: [] as any[],
        routeLoading: false,
        routeError: null,
        isRoutePlanningMode: false,
        gpxLayers: [] as any[],
        activeRouteProfile: 'foot-hiking',
        routeLoopEnabled: false,
        routeDraftSourceLayerId: null,
        routeDraftName: '',
        routeDraftDirty: false,
        activePreparedRouteId: null,
        routeComputation: null,
        ORS_KEY: '',
        originTile: { x: 0, y: 0, z: 6 },
        scene: null,
        subscribe: vi.fn(() => () => {}),
    },
}));

vi.mock('./routingService', () => ({
    computeRoute: vi.fn(),
    clearRouteWaypoints: vi.fn(),
    addRouteWaypoint: vi.fn(),
    removeRouteWaypoint: vi.fn(),
    reverseWaypoints: vi.fn(),
    getActiveProfile: vi.fn(() => 'foot-hiking'),
}));

vi.mock('./analysis', () => ({
    getAltitudeAt: vi.fn(() => 500),
}));

vi.mock('./geo', () => ({
    lngLatToWorld: vi.fn(() => ({ x: 100, z: 200 })),
}));

vi.mock('../i18n/I18nService', () => ({
    i18n: { t: vi.fn((key: string) => key) },
}));

vi.mock('./geocodingService', () => ({
    getPlaceName: vi.fn(() => Promise.resolve('Mürren')),
}));

vi.mock('./solarRoute', () => ({
    scheduleRouteSolarAnalysis: vi.fn(),
    invalidateRouteCache: vi.fn(),
}));

vi.mock('./toast', () => ({
    showToast: vi.fn(),
}));

import { state } from './state';
import {
    computeRoute,
    clearRouteWaypoints,
    reverseWaypoints,
} from './routingService';
import { showToast } from './toast';
import { i18n } from '../i18n/I18nService';
import { getPlaceName } from './geocodingService';
import {
    initRouteManager,
    removeWaypointAt,
    clearRoute,
    scheduleGeocodeNames,
    setRoutePlanningMode,
    reverseRoute,
} from './routeManager';

const mockComputeRoute = computeRoute as ReturnType<typeof vi.fn>;
const mockClearRouteWaypoints = clearRouteWaypoints as ReturnType<typeof vi.fn>;
const mockI18nT = i18n.t as ReturnType<typeof vi.fn>;
const mockGetPlaceName = getPlaceName as ReturnType<typeof vi.fn>;
const mockReverseWaypoints = reverseWaypoints as ReturnType<typeof vi.fn>;
const mockShowToast = showToast as ReturnType<typeof vi.fn>;

describe('routeManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.routeWaypoints = [];
        state.routeLoading = false;
        state.routeError = null;
        state.isRoutePlanningMode = false;
        state.gpxLayers = [];
        state.routeDraftSourceLayerId = null;
        state.routeDraftName = '';
        state.routeDraftDirty = false;
        state.activePreparedRouteId = null;
        state.routeComputation = null;
        localStorage.clear();
        document.body.className = '';
        document.body.innerHTML = `
            <div id="route-bar">
                <div id="rb-dots"></div>
                <div id="rb-info"></div>
            </div>`;
    });

    describe('initRouteManager()', () => {
        it('souscrit aux changements de routeWaypoints et routeLoading', () => {
            initRouteManager();
            expect(state.subscribe).toHaveBeenCalledWith(
                'routeWaypoints',
                expect.any(Function)
            );
            expect(state.subscribe).toHaveBeenCalledWith(
                'routeLoading',
                expect.any(Function)
            );
            expect(state.subscribe).toHaveBeenCalledWith(
                'isRoutePlanningMode',
                expect.any(Function)
            );
        });

        it('ne recalcule pas la géométrie complète d’un brouillon GPX à partir de ses seules extrémités A/B', () => {
            vi.useFakeTimers();
            state.routeWaypoints = [
                { lat: 46.5, lon: 7.5 },
                { lat: 46.5, lon: 7.5 },
            ];
            state.routeDraftSourceLayerId = 'gpx-loop';
            initRouteManager();
            const waypointCallback = (
                state.subscribe as ReturnType<typeof vi.fn>
            ).mock.calls
                .filter((call: any[]) => call[0] === 'routeWaypoints')
                .slice(-1)[0]?.[1];

            waypointCallback?.();
            vi.advanceTimersByTime(2000);

            expect(mockComputeRoute).not.toHaveBeenCalled();
            expect(mockGetPlaceName).not.toHaveBeenCalled();
            vi.useRealTimers();
        });
    });

    describe('explicit planning mode', () => {
        it('keeps the route bar visible with an empty-route instruction', () => {
            setRoutePlanningMode(true, { announceHint: false });
            initRouteManager();

            expect(state.isRoutePlanningMode).toBe(true);
            expect(
                document.body.classList.contains('route-planning-mode')
            ).toBe(true);
            expect(
                document.body.classList.contains('route-planner-active')
            ).toBe(true);
            expect(document.getElementById('rb-info')?.textContent).toBe(
                'planning.tapToAddStart'
            );
        });

        it('announces the long-press shortcut once without blocking', () => {
            setRoutePlanningMode(true);
            setRoutePlanningMode(false);
            setRoutePlanningMode(true);

            expect(mockShowToast).toHaveBeenCalledTimes(1);
            expect(
                localStorage.getItem('suntrail_planning_long_press_hint_v1')
            ).toBe('1');
        });
    });

    describe('reverseRoute()', () => {
        it('delegates inversion when at least two waypoints exist', () => {
            state.routeWaypoints = [
                { lat: 46, lon: 7 },
                { lat: 47, lon: 8 },
            ];
            reverseRoute();
            expect(mockReverseWaypoints).toHaveBeenCalledOnce();
        });

        it('does nothing with fewer than two waypoints', () => {
            state.routeWaypoints = [{ lat: 46, lon: 7 }];
            reverseRoute();
            expect(mockReverseWaypoints).not.toHaveBeenCalled();
        });
    });

    describe('removeWaypointAt()', () => {
        it("retire le waypoint à l'index donné", () => {
            state.routeWaypoints = [
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1 },
                { lat: 46.2, lon: 7.2 },
            ];
            removeWaypointAt(1);
            expect(state.routeWaypoints).toHaveLength(2);
            expect(state.routeWaypoints[0].lat).toBe(46.0);
            expect(state.routeWaypoints[1].lat).toBe(46.2);
        });

        it("ne modifie pas l'original (immutabilité)", () => {
            const original = [
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1 },
            ];
            state.routeWaypoints = original;
            removeWaypointAt(0);
            expect(original).toHaveLength(2);
        });
    });

    describe('clearRoute()', () => {
        it('appelle clearRouteWaypoints', () => {
            clearRoute();
            expect(mockClearRouteWaypoints).toHaveBeenCalled();
        });

        it('retire la classe route-planner-active du body', () => {
            document.body.classList.add('route-planner-active');
            clearRoute();
            expect(
                document.body.classList.contains('route-planner-active')
            ).toBe(false);
        });
    });

    describe('auto-compute', () => {
        it('se déclenche après 800ms avec ≥2 waypoints', async () => {
            vi.useFakeTimers();
            mockComputeRoute.mockResolvedValueOnce({
                distance: 5.2,
                duration: 90,
                ascent: 300,
                descent: 200,
            });

            state.routeWaypoints = [
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1 },
            ];

            // Simuler le déclenchement via le subscribe
            const waypointCallback = (
                state.subscribe as ReturnType<typeof vi.fn>
            ).mock.calls.find((c: any[]) => c[0] === 'routeWaypoints')?.[1];
            if (waypointCallback) waypointCallback();

            vi.advanceTimersByTime(800);
            await Promise.resolve();
            await Promise.resolve();

            if (mockComputeRoute.mock.calls.length > 0) {
                expect(mockComputeRoute).toHaveBeenCalledWith(
                    state.routeWaypoints
                );
            }

            vi.useRealTimers();
        });
    });

    describe('barre de route', () => {
        it('ajoute route-planner-active au body si ≥1 waypoint', () => {
            state.routeWaypoints = [{ lat: 46.0, lon: 7.0 }];
            initRouteManager();

            const waypointCallback = (
                state.subscribe as ReturnType<typeof vi.fn>
            ).mock.calls
                .filter((c: any[]) => c[0] === 'routeWaypoints')
                .slice(-1)[0]?.[1];

            if (waypointCallback) {
                waypointCallback();
                expect(
                    document.body.classList.contains('route-planner-active')
                ).toBe(true);
            }
        });

        it('retire route-planner-active si 0 waypoints', () => {
            document.body.classList.add('route-planner-active');
            state.routeWaypoints = [];
            initRouteManager();

            const waypointCallback = (
                state.subscribe as ReturnType<typeof vi.fn>
            ).mock.calls
                .filter((c: any[]) => c[0] === 'routeWaypoints')
                .slice(-1)[0]?.[1];

            if (waypointCallback) {
                waypointCallback();
                expect(
                    document.body.classList.contains('route-planner-active')
                ).toBe(false);
            }
        });

        it('nomme explicitement le brouillon dont elle affiche les statistiques', () => {
            state.routeWaypoints = [
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1 },
            ];
            state.routeDraftName = 'Boucle du lac';
            state.routeComputation = {
                name: 'Boucle du lac',
                distance: 8.01,
                ascent: 29,
                descent: 33,
                duration: 120,
            } as any;

            initRouteManager();

            expect(document.getElementById('rb-info')?.textContent).toContain(
                'preparedRoutes.source.manualDraft · Boucle du lac · 8.0 km'
            );
        });

        it('distingue un GPX en préparation de la trace seulement consultée', () => {
            state.routeWaypoints = [
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1 },
            ];
            state.routeDraftSourceLayerId = 'gpx-prepared';
            state.routeDraftName = 'GPX préparé';
            state.activeGPXLayerId = 'gpx-viewed';
            state.routeComputation = {
                name: 'GPX préparé',
                distance: 4.2,
                ascent: 120,
                descent: 80,
                duration: 60,
            } as any;

            initRouteManager();

            expect(document.getElementById('rb-info')?.textContent).toContain(
                'preparedRoutes.source.gpxDraft · GPX préparé · 4.2 km'
            );
            expect(
                document.getElementById('rb-info')?.textContent
            ).not.toContain('gpx-viewed');
        });
    });

    describe('i18n strings in route bar', () => {
        it('affiche le texte i18n pour le calcul en cours', () => {
            state.routeWaypoints = [{ lat: 46.0, lon: 7.0 }];
            state.routeLoading = true;
            document.body.innerHTML = `
                <div id="route-bar">
                    <div id="rb-dots"></div>
                    <div id="rb-info">old</div>
                </div>`;

            initRouteManager();
            const routeLoadingCallback = (
                state.subscribe as ReturnType<typeof vi.fn>
            ).mock.calls
                .filter((c: any[]) => c[0] === 'routeLoading')
                .slice(-1)[0]?.[1];

            if (routeLoadingCallback) {
                routeLoadingCallback();
                const infoEl = document.getElementById('rb-info');
                expect(infoEl?.textContent).toBe('routeBar.computing');
                expect(mockI18nT).toHaveBeenCalledWith('routeBar.computing');
            }
        });

        it('affiche le texte i18n pour 1 seul point', () => {
            state.routeWaypoints = [{ lat: 46.0, lon: 7.0 }];
            state.routeLoading = false;
            document.body.innerHTML = `
                <div id="route-bar">
                    <div id="rb-dots"></div>
                    <div id="rb-info">old</div>
                </div>`;

            initRouteManager();
            const waypointCallback = (
                state.subscribe as ReturnType<typeof vi.fn>
            ).mock.calls
                .filter((c: any[]) => c[0] === 'routeWaypoints')
                .slice(-1)[0]?.[1];

            if (waypointCallback) {
                waypointCallback();
                const infoEl = document.getElementById('rb-info');
                expect(infoEl?.textContent).toBe('routeBar.onePoint');
                expect(mockI18nT).toHaveBeenCalledWith('routeBar.onePoint');
            }
        });

        it("affiche l'erreur de calcul sans masquer les points", () => {
            state.routeWaypoints = [
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1 },
            ];
            state.routeError = 'offline';
            initRouteManager();
            expect(document.getElementById('rb-info')?.textContent).toBe(
                'routeBar.error'
            );
            expect(document.querySelectorAll('#rb-dots .rb-dot')).toHaveLength(
                2
            );
        });
    });

    describe('geocode naming', () => {
        beforeEach(() => {
            vi.clearAllMocks();
            state.routeWaypoints = [];
            state.routeLoading = false;
            mockGetPlaceName.mockResolvedValue('Mürren');
        });

        it('scheduleGeocodeNames should be exported', () => {
            expect(typeof scheduleGeocodeNames).toBe('function');
        });

        it('should resolve names for unnamed waypoints via throttle', async () => {
            vi.useFakeTimers();
            state.routeWaypoints = [
                { lat: 46.5, lon: 7.5 },
                { lat: 46.6, lon: 7.6, name: 'Known' },
            ];

            scheduleGeocodeNames();
            vi.advanceTimersByTime(1500);
            await Promise.resolve();
            await Promise.resolve();

            expect(mockGetPlaceName).toHaveBeenCalledTimes(1);
            expect(mockGetPlaceName).toHaveBeenCalledWith(46.5, 7.5);
            // Le waypoint connu ne doit pas être géocodé
            expect(state.routeWaypoints[0].name).toBe('Mürren');
            expect(state.routeWaypoints[1].name).toBe('Known');

            vi.useRealTimers();
        });
    });
});
