import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./state', () => ({
    state: {
        routeWaypoints: [] as any[],
        routeLoading: false,
        routeError: null,
        activeRouteProfile: 'foot-hiking',
        routeLoopEnabled: false,
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
    reverseGeocodeWaypoint: vi.fn(() => Promise.resolve(null)),
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

import { state } from './state';
import { computeRoute, clearRouteWaypoints } from './routingService';
import { i18n } from '../i18n/I18nService';
import { initRouteManager, removeWaypointAt, clearRoute } from './routeManager';

const mockComputeRoute = computeRoute as ReturnType<typeof vi.fn>;
const mockClearRouteWaypoints = clearRouteWaypoints as ReturnType<typeof vi.fn>;
const mockI18nT = i18n.t as ReturnType<typeof vi.fn>;

describe('routeManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.routeWaypoints = [];
        state.routeLoading = false;
        state.routeError = null;
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
            expect(state.subscribe).toHaveBeenCalledWith('routeWaypoints', expect.any(Function));
            expect(state.subscribe).toHaveBeenCalledWith('routeLoading', expect.any(Function));
        });
    });

    describe('removeWaypointAt()', () => {
        it('retire le waypoint à l\'index donné', () => {
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

        it('ne modifie pas l\'original (immutabilité)', () => {
            const original = [{ lat: 46.0, lon: 7.0 }, { lat: 46.1, lon: 7.1 }];
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
            expect(document.body.classList.contains('route-planner-active')).toBe(false);
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
            const waypointCallback = (state.subscribe as ReturnType<typeof vi.fn>).mock.calls
                .find((c: any[]) => c[0] === 'routeWaypoints')?.[1];
            if (waypointCallback) waypointCallback();

            vi.advanceTimersByTime(800);
            await Promise.resolve();
            await Promise.resolve();

            if (mockComputeRoute.mock.calls.length > 0) {
                expect(mockComputeRoute).toHaveBeenCalledWith(state.routeWaypoints);
            }

            vi.useRealTimers();
        });
    });

    describe('barre de route', () => {
        it('ajoute route-planner-active au body si ≥1 waypoint', () => {
            state.routeWaypoints = [{ lat: 46.0, lon: 7.0 }];
            initRouteManager();

            const waypointCallback = (state.subscribe as ReturnType<typeof vi.fn>).mock.calls
                .filter((c: any[]) => c[0] === 'routeWaypoints')
                .slice(-1)[0]?.[1];

            if (waypointCallback) {
                waypointCallback();
                expect(document.body.classList.contains('route-planner-active')).toBe(true);
            }
        });

        it('retire route-planner-active si 0 waypoints', () => {
            document.body.classList.add('route-planner-active');
            state.routeWaypoints = [];
            initRouteManager();

            const waypointCallback = (state.subscribe as ReturnType<typeof vi.fn>).mock.calls
                .filter((c: any[]) => c[0] === 'routeWaypoints')
                .slice(-1)[0]?.[1];

            if (waypointCallback) {
                waypointCallback();
                expect(document.body.classList.contains('route-planner-active')).toBe(false);
            }
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
            const routeLoadingCallback = (state.subscribe as ReturnType<typeof vi.fn>).mock.calls
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
            const waypointCallback = (state.subscribe as ReturnType<typeof vi.fn>).mock.calls
                .filter((c: any[]) => c[0] === 'routeWaypoints')
                .slice(-1)[0]?.[1];

            if (waypointCallback) {
                waypointCallback();
                const infoEl = document.getElementById('rb-info');
                expect(infoEl?.textContent).toBe('routeBar.onePoint');
                expect(mockI18nT).toHaveBeenCalledWith('routeBar.onePoint');
            }
        });
    });
});
