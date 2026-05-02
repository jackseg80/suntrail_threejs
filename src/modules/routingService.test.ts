import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./state', () => ({
    state: {
        ORS_KEY: '',
        routeWaypoints: [] as any[],
        routeLoading: false,
        routeError: null,
        activeRouteProfile: 'foot-hiking' as const,
        gpxLayers: [] as any[],
        ZOOM: 13,
        originTile: { x: 0, y: 0, z: 13 },
        RELIEF_EXAGGERATION: 1,
        scene: null,
        IS_2D_MODE: false,
    },
}));

const _baseMockLayer = { id: 'mock-layer-id', name: 'mock', color: '#fff', visible: true, rawData: {}, points: [] as any[], mesh: null, stats: { distance: 6.2, dPlus: 350, dMinus: 230, pointCount: 5, estimatedTime: 75 } };

let _mockLayer: typeof _baseMockLayer;

vi.mock('./gpxLayers', () => ({
    addGPXLayer: vi.fn(() => _mockLayer),
    removeGPXLayer: vi.fn(),
}));
vi.mock('./toast', () => ({ showToast: vi.fn() }));

vi.mock('../i18n/I18nService', () => ({
    i18n: { t: vi.fn((key: string) => key) },
}));

vi.mock('./geo', () => ({
    worldToLngLat: vi.fn((x: number, z: number) => ({ lat: 46 + x * 0.001, lon: 7 + z * 0.001 })),
}));

vi.mock('./geoStats', () => ({
    calculateTrackStats: vi.fn(() => ({
        distance: 8.5,
        dPlus: 500,
        dMinus: 300,
        estimatedTime: 120,
    })),
}));

import { state } from './state';
import { addGPXLayer } from './gpxLayers';
import { worldToLngLat } from './geo';
import { calculateTrackStats } from './geoStats';
import {
    computeRoute,
    addRouteWaypoint,
    removeRouteWaypoint,
    clearRouteWaypoints,
    reverseWaypoints,
    getActiveProfile,
} from './routingService';

const mockAddGPXLayer = addGPXLayer as ReturnType<typeof vi.fn>;
const mockWorldToLngLat = worldToLngLat as ReturnType<typeof vi.fn>;
const mockCalculateTrackStats = calculateTrackStats as ReturnType<typeof vi.fn>;

const VALID_ORS_RESPONSE = {
    features: [{
        geometry: {
            coordinates: [
                [7.0, 46.0, 1500],
                [7.01, 46.01, 1550],
                [7.02, 46.02, 1600],
                [7.03, 46.03, 1580],
                [7.04, 46.04, 1620],
            ] as [number, number, number][],
        },
        properties: {
            summary: {
                distance: 6200,
                duration: 4500,
            },
            ascent: 350,
            descent: 230,
        },
    }],
};

const VALID_OSRM_RESPONSE = {
    code: 'Ok',
    routes: [{
        distance: 6200,
        duration: 4500,
        geometry: {
            coordinates: [
                [7.0, 46.0],
                [7.01, 46.01],
                [7.02, 46.02],
            ] as [number, number][],
        },
    }],
};

describe('routingService', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        _mockLayer = { ..._baseMockLayer, stats: { ..._baseMockLayer.stats }, points: [..._baseMockLayer.points] };
        mockFetch = vi.fn();
        global.fetch = mockFetch as unknown as typeof fetch;
        state.ORS_KEY = '';
        state.routeWaypoints = [];
        state.routeLoading = false;
        state.routeError = null;
        state.gpxLayers = [];
    });

    describe('computeRoute (OSRM fallback - no ORS key)', () => {
        beforeEach(() => {
            state.ORS_KEY = '';
        });

        it('should compute a route via OSRM when no ORS key is set', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_OSRM_RESPONSE),
            });

            const result = await computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.04, lon: 7.04 },
            ]);

            expect(result.distance).toBe(6.2);
            expect(result.duration).toBe(75);
            expect(mockFetch).toHaveBeenCalledTimes(1);
            const fetchUrl = mockFetch.mock.calls[0][0] as string;
            expect(fetchUrl).toContain('router.project-osrm.org');
            expect(fetchUrl).toContain('foot');
            expect(fetchUrl).toContain('7,46;7.04,46.04');
            expect(mockAddGPXLayer).toHaveBeenCalledTimes(1);
        });

        it('should use geoJSON flag for OSRM', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_OSRM_RESPONSE),
            });

            await computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.04, lon: 7.04 },
            ]);

            const fetchUrl = mockFetch.mock.calls[0][0] as string;
            expect(fetchUrl).toContain('geometries=geojson');
            expect(fetchUrl).toContain('overview=full');
        });
    });

    describe('computeRoute (ORS - with key)', () => {
        beforeEach(() => {
            state.ORS_KEY = 'test-ors-key-1234567890';
        });

        it('should compute a route via ORS when key is set', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_ORS_RESPONSE),
            });

            const result = await computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.04, lon: 7.04 },
            ]);

            expect(result.distance).toBe(6.2);
            expect(result.duration).toBe(75);
            expect(result.ascent).toBe(350);
            expect(result.descent).toBe(230);
            expect(mockFetch).toHaveBeenCalledTimes(1);

            const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
            expect(url).toContain('openrouteservice.org');
            expect(url).toContain('foot-hiking');
            expect(options.method).toBe('POST');
            expect((options.headers as Record<string, string>).Authorization).toBe(state.ORS_KEY);
            expect(mockAddGPXLayer).toHaveBeenCalledTimes(1);
        });

        it('should convert ORS lon/lat/elevation to lat/lon points', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_ORS_RESPONSE),
            });

            await computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.04, lon: 7.04 },
            ]);

            const rawData = mockAddGPXLayer.mock.calls[0][0];
            const points = rawData.tracks[0].points;
            expect(points.length).toBe(5);
            expect(points[0].lat).toBe(46.0);
            expect(points[0].lon).toBe(7.0);
            expect(points[0].ele).toBe(1500);
            expect(points[4].lat).toBe(46.04);
            expect(points[4].lon).toBe(7.04);
            expect(points[4].ele).toBe(1620);
        });

        it('should handle missing elevation in ORS response', async () => {
            const noElevResponse = {
                features: [{
                    geometry: {
                        coordinates: [[7.0, 46.0], [7.01, 46.01]] as [number, number][],
                    },
                    properties: { summary: { distance: 1000, duration: 600 } },
                }],
            };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(noElevResponse),
            });

            await computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.01, lon: 7.01 },
            ]);

            const rawData = mockAddGPXLayer.mock.calls[0][0];
            expect(rawData.tracks[0].points[0].ele).toBe(0);
        });
    });

    describe('computeRoute errors', () => {
        it('should throw when less than 2 waypoints', async () => {
            await expect(computeRoute([{ lat: 46.0, lon: 7.0 }]))
                .rejects.toThrow('routePlanner.error.minWaypoints');
        });

        it('should handle ORS API error gracefully', async () => {
            state.ORS_KEY = 'test-ors-key-1234567890';
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                text: () => Promise.resolve('Forbidden'),
            });

            await expect(computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1 },
            ])).rejects.toThrow(/403/);

            expect(state.routeError).toBeTruthy();
        });

        it('should handle OSRM no-route response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ code: 'NoRoute', routes: [] }),
            });

            await expect(computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1 },
            ])).rejects.toThrow('routePlanner.error.noRoute');
        });

        it('should set routeLoading to false after error', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: () => Promise.resolve('Server error'),
            });

            await expect(computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1 },
            ])).rejects.toThrow();

            expect(state.routeLoading).toBe(false);
        });

        it('should handle fetch network error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            await expect(computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1 },
            ])).rejects.toThrow('Network error');

            expect(state.routeLoading).toBe(false);
        });
    });

    describe('waypoint management', () => {
        it('should add a waypoint', () => {
            addRouteWaypoint({ lat: 46.0, lon: 7.0 });
            addRouteWaypoint({ lat: 46.1, lon: 7.1 });

            expect(state.routeWaypoints.length).toBe(2);
            expect(state.routeWaypoints[0].lat).toBe(46.0);
        });

        it('should not add waypoint without coordinates', () => {
            addRouteWaypoint({ lat: 0, lon: 0 });
            expect(state.routeWaypoints.length).toBe(0);
        });

        it('should remove a waypoint by index', () => {
            state.routeWaypoints = [
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1 },
                { lat: 46.2, lon: 7.2 },
            ];

            removeRouteWaypoint(1);
            expect(state.routeWaypoints.length).toBe(2);
            expect(state.routeWaypoints[1].lat).toBe(46.2);
        });

        it('should not remove on invalid index', () => {
            state.routeWaypoints = [{ lat: 46.0, lon: 7.0 }];
            removeRouteWaypoint(5);
            expect(state.routeWaypoints.length).toBe(1);
        });

        it('should clear all waypoints', () => {
            state.routeWaypoints = [
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1 },
            ];
            state.routeError = 'some error';

            clearRouteWaypoints();
            expect(state.routeWaypoints.length).toBe(0);
            expect(state.routeError).toBeNull();
        });

        it('should reverse waypoints order', () => {
            state.routeWaypoints = [
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1 },
                { lat: 46.2, lon: 7.2 },
            ];

            reverseWaypoints();
            expect(state.routeWaypoints[0].lat).toBe(46.2);
            expect(state.routeWaypoints[2].lat).toBe(46.0);
        });

        it('should handle reverse on empty list', () => {
            state.routeWaypoints = [];
            reverseWaypoints();
            expect(state.routeWaypoints.length).toBe(0);
        });
    });

    describe('getActiveProfile', () => {
        it('should return default profile', () => {
            state.activeRouteProfile = 'foot-hiking';
            expect(getActiveProfile()).toBe('foot-hiking');
        });

        it('should return current profile', () => {
            state.activeRouteProfile = 'foot-walking';
            expect(getActiveProfile()).toBe('foot-walking');
        });
    });

    describe('multiple waypoints', () => {
        it('should handle 3+ waypoints via OSRM', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_OSRM_RESPONSE),
            });

            await computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1 },
                { lat: 46.2, lon: 7.2 },
            ]);

            const fetchUrl = mockFetch.mock.calls[0][0] as string;
            expect(fetchUrl).toContain('7,46;7.1,46.1;7.2,46.2');
        });
    });

    describe('route naming', () => {
        beforeEach(() => {
            state.gpxLayers = [];
        });

        it('should name route from waypoint coordinates', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_OSRM_RESPONSE),
            });

            await computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.04, lon: 7.04 },
            ]);

            expect(mockAddGPXLayer).toHaveBeenCalledWith(
                expect.any(Object),
                '46.000, 7.000 → 46.040, 7.040',
                { silent: true },
            );
        });

        it('should use named waypoints in route name', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_OSRM_RESPONSE),
            });

            await computeRoute([
                { lat: 46.0, lon: 7.0, name: 'Start' },
                { lat: 46.04, lon: 7.04, name: 'End' },
            ]);

            expect(mockAddGPXLayer).toHaveBeenCalledWith(
                expect.any(Object),
                'Start → End',
                { silent: true },
            );
        });

        it('should include mid point in long route names', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_OSRM_RESPONSE),
            });

            await computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1, name: 'Mid' },
                { lat: 46.0, lon: 7.0 },
            ]);

            const name = mockAddGPXLayer.mock.calls[0][1] as string;
            expect(name).toContain('Mid');
        });
    });

    describe('loop (round trip)', () => {
        beforeEach(() => {
            state.gpxLayers = [];
            state.routeLoopEnabled = false;
        });

        it('should append start waypoint when loop enabled', async () => {
            state.routeLoopEnabled = true;
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_OSRM_RESPONSE),
            });

            await computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.04, lon: 7.04 },
            ]);

            const fetchUrl = mockFetch.mock.calls[0][0] as string;
            expect(fetchUrl).toContain('7,46;7.04,46.04;7,46');
        });

        it('should add loop suffix to route name', async () => {
            state.routeLoopEnabled = true;
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_OSRM_RESPONSE),
            });

            await computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.04, lon: 7.04 },
            ]);

            const name = mockAddGPXLayer.mock.calls[0][1] as string;
            expect(name).toContain('routePlanner.loop');
        });

        it('should NOT append start when loop disabled', async () => {
            state.routeLoopEnabled = false;
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_OSRM_RESPONSE),
            });

            await computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.04, lon: 7.04 },
            ]);

            const fetchUrl = mockFetch.mock.calls[0][0] as string;
            expect(fetchUrl).toContain('7,46;7.04,46.04');
            expect(fetchUrl).not.toContain('7,46;7.04,46.04;7,46');
        });

        it('should not loop with less than 2 waypoints even if enabled', async () => {
            state.routeLoopEnabled = true;
            expect(state.routeLoopEnabled).toBe(true);
        });
    });

    describe('draped stats recalculation', () => {
        beforeEach(() => {
            state.gpxLayers = [];
            _mockLayer.points = [
                { x: 100, y: 1500, z: 200 },
                { x: 110, y: 1550, z: 210 },
                { x: 120, y: 1600, z: 220 },
            ] as any[];
            _mockLayer.stats = { distance: 0, dPlus: 0, dMinus: 0, pointCount: 3, estimatedTime: 0 };
        });

        it('should recalculate stats from draped terrain for OSRM routes', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_OSRM_RESPONSE),
            });

            const result = await computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.04, lon: 7.04 },
            ]);

            expect(mockWorldToLngLat).toHaveBeenCalled();
            expect(mockCalculateTrackStats).toHaveBeenCalled();
            expect(result.distance).toBe(8.5);
            expect(result.ascent).toBe(500);
            expect(result.descent).toBe(300);
            expect(result.duration).toBe(120);
        });

        it('should use ORS API stats directly (no draping override)', async () => {
            _mockLayer.stats = { distance: 6.2, dPlus: 350, dMinus: 230, pointCount: 5, estimatedTime: 75 };
            state.ORS_KEY = 'test-ors-key-1234567890';
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_ORS_RESPONSE),
            });

            const result = await computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.04, lon: 7.04 },
            ]);

            // ORS utilise les stats du layer (calculées sur données API avec élévation), pas le drapage
            expect(result.distance).toBe(6.2);
            expect(result.ascent).toBe(350);
            expect(result.descent).toBe(230);
            expect(result.duration).toBe(75);
        });

        it('should skip draping when layer has insufficient points', async () => {
            _mockLayer.points = [{ x: 100, y: 1500, z: 200 }] as any[];
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_OSRM_RESPONSE),
            });

            await computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.04, lon: 7.04 },
            ]);

            expect(mockCalculateTrackStats).not.toHaveBeenCalled();
        });

        it('should skip draping when no originTile', async () => {
            state.originTile = null as any;
            _mockLayer.points = [
                { x: 100, y: 1500, z: 200 },
                { x: 110, y: 1550, z: 210 },
            ] as any[];
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_OSRM_RESPONSE),
            });

            await computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.04, lon: 7.04 },
            ]);

            expect(mockCalculateTrackStats).not.toHaveBeenCalled();
        });
    });

    describe('generation counter (race condition)', () => {
        let resolveFirst: (value: any) => void;

        beforeEach(() => {
            state.gpxLayers = [];
        });

        it('should cancel stale computation when a newer one starts', async () => {
            // Premier appel : fetch lent qui ne résout jamais
            const firstPromise = new Promise<Response>(resolve => {
                resolveFirst = resolve;
            });
            mockFetch.mockReturnValueOnce(firstPromise);

            const firstCall = computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1 },
            ]);

            // Deuxième appel immédiat : incrémente la génération
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_OSRM_RESPONSE),
            });

            const secondCall = computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1 },
            ]);

            // Résoudre le premier fetch (trop tard)
            resolveFirst!({
                ok: true,
                json: () => Promise.resolve(VALID_OSRM_RESPONSE),
            });

            await expect(firstCall).rejects.toThrow('Route cancelled');
            const secondResult = await secondCall;
            expect(secondResult.distance).toBe(6.2);
            expect(state.routeError).toBeNull();
        });

        it('should reject cancelled computation without setting routeError', async () => {
            const firstPromise = new Promise<Response>(resolve => {
                resolveFirst = resolve;
            });
            mockFetch.mockReturnValueOnce(firstPromise);

            const firstCall = computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1 },
            ]);

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_OSRM_RESPONSE),
            });
            void computeRoute([
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1 },
            ]);

            resolveFirst!({
                ok: true,
                json: () => Promise.resolve(VALID_OSRM_RESPONSE),
            });

            await expect(firstCall).rejects.toThrow('Route cancelled');
            expect(state.routeError).toBeNull();
        });
    });
});
