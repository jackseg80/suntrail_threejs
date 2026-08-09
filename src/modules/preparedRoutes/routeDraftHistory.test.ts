import { beforeEach, describe, expect, it } from 'vitest';
import { state } from '../state';
import {
    getRouteDraftHistoryState,
    mutateRouteWaypoints,
    redoRouteWaypoints,
    resetRouteDraftHistory,
    undoRouteWaypoints,
} from './routeDraftHistory';

describe('prepared route draft undo/redo', () => {
    beforeEach(() => {
        state.routeWaypoints = [];
        state.routeComputation = null;
        state.routeDraftDirty = false;
        resetRouteDraftHistory([]);
    });

    it('undoes and redoes add, move, reorder and delete snapshots', () => {
        mutateRouteWaypoints([{ lat: 46.5, lon: 7.5 }]);
        mutateRouteWaypoints([
            { lat: 46.5, lon: 7.5 },
            { lat: 46.6, lon: 7.6 },
        ]);
        mutateRouteWaypoints([
            { lat: 46.6, lon: 7.6 },
            { lat: 46.5, lon: 7.5 },
        ]);
        expect(getRouteDraftHistoryState()).toEqual({
            canUndo: true,
            canRedo: false,
        });

        expect(undoRouteWaypoints()).toBe(true);
        expect(state.routeWaypoints[0]).toEqual({ lat: 46.5, lon: 7.5 });
        expect(redoRouteWaypoints()).toBe(true);
        expect(state.routeWaypoints[0]).toEqual({ lat: 46.6, lon: 7.6 });
        expect(state.routeDraftDirty).toBe(true);
        expect(state.routeComputation).toBeNull();
    });

    it('resets history when a saved route is opened', () => {
        mutateRouteWaypoints([{ lat: 46.5, lon: 7.5 }]);
        resetRouteDraftHistory([
            { lat: 47, lon: 8 },
            { lat: 47.1, lon: 8.1 },
        ]);
        expect(getRouteDraftHistoryState()).toEqual({
            canUndo: false,
            canRedo: false,
        });
        expect(undoRouteWaypoints()).toBe(false);
    });
});
