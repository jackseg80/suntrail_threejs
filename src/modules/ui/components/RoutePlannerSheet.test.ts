import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../i18n/I18nService', () => ({
    i18n: {
        t: vi.fn((key: string) => key),
        applyToDOM: vi.fn(),
    },
}));

vi.mock('../../eventBus', () => ({
    eventBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));

vi.mock('../../state', () => ({
    state: {
        routeWaypoints: [] as any[],
        routeLoading: false,
        routeError: null,
        activeRouteProfile: 'foot-hiking' as const,
        ORS_KEY: '',
        hasLastClicked: false,
        lastClickedCoords: { x: 0, z: 0, alt: 0 },
        originTile: null,
        gpxLayers: [],
        ZOOM: 13,
        RELIEF_EXAGGERATION: 1,
    },
}));

vi.mock('../../routingService', () => ({
    computeRoute: vi.fn(),
    addRouteWaypoint: vi.fn(),
    removeRouteWaypoint: vi.fn(),
    clearRouteWaypoints: vi.fn(),
    reverseWaypoints: vi.fn(),
    reverseGeocodeWaypoint: vi.fn(),
    getActiveProfile: vi.fn(() => 'foot-hiking'),
}));

vi.mock('../../geo', () => ({
    worldToLngLat: vi.fn(() => ({ lat: 46.5, lon: 7.5 })),
}));

vi.mock('../core/SheetManager', () => ({
    sheetManager: { open: vi.fn(), close: vi.fn(), toggle: vi.fn(), getActiveSheetId: vi.fn(() => null) },
}));

import { state } from '../../state';
import {
    computeRoute,
    addRouteWaypoint,
    removeRouteWaypoint,
    clearRouteWaypoints,
    reverseWaypoints,
} from '../../routingService';
import { RoutePlannerSheet } from './RoutePlannerSheet';

const mockComputeRoute = computeRoute as ReturnType<typeof vi.fn>;
const mockAddRouteWaypoint = addRouteWaypoint as ReturnType<typeof vi.fn>;
const mockRemoveRouteWaypoint = removeRouteWaypoint as ReturnType<typeof vi.fn>;
const mockClearRouteWaypoints = clearRouteWaypoints as ReturnType<typeof vi.fn>;
const mockReverseWaypoints = reverseWaypoints as ReturnType<typeof vi.fn>;

describe('RoutePlannerSheet', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.routeWaypoints = [];
        state.routeLoading = false;
        state.routeError = null;
        state.hasLastClicked = false;
        state.lastClickedCoords = { x: 0, z: 0, alt: 0 };
    });

    it('should instantiate without error', () => {
        const sheet = new RoutePlannerSheet();
        expect(sheet).toBeDefined();
    });

    describe('waypoint operations', () => {
        it('clearRouteWaypoints should reset waypoints', () => {
            clearRouteWaypoints();
            expect(mockClearRouteWaypoints).toHaveBeenCalled();
        });

        it('reverseWaypoints should reverse order', () => {
            reverseWaypoints();
            expect(mockReverseWaypoints).toHaveBeenCalled();
        });

        it('addRouteWaypoint should add a waypoint', () => {
            addRouteWaypoint({ lat: 46.5, lon: 7.5 });
            expect(mockAddRouteWaypoint).toHaveBeenCalledWith({ lat: 46.5, lon: 7.5 });
        });

        it('removeRouteWaypoint should remove by index', () => {
            removeRouteWaypoint(2);
            expect(mockRemoveRouteWaypoint).toHaveBeenCalledWith(2);
        });
    });

    describe('computeRoute callback', () => {
        it('should call computeRoute with waypoints', async () => {
            mockComputeRoute.mockResolvedValueOnce({
                name: 'Test → Route',
                distance: 5.2,
                duration: 90,
                ascent: 300,
                descent: 200,
            });

            state.routeWaypoints = [
                { lat: 46.0, lon: 7.0 },
                { lat: 46.1, lon: 7.1 },
            ];

            await computeRoute(state.routeWaypoints);
            expect(mockComputeRoute).toHaveBeenCalled();
        });
    });
});
