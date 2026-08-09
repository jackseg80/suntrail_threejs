import { state } from '../state';
import type { RouteWaypoint } from './preparedRoute';

const MAX_HISTORY = 50;
let undoStack: RouteWaypoint[][] = [];
let redoStack: RouteWaypoint[][] = [];

function cloneWaypoints(waypoints: RouteWaypoint[]): RouteWaypoint[] {
    return waypoints.map((waypoint) => ({ ...waypoint }));
}

function areEqual(a: RouteWaypoint[], b: RouteWaypoint[]): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

function applySnapshot(snapshot: RouteWaypoint[]): void {
    // Any explicit waypoint edit leaves the imported GPX snapshot and requires
    // a fresh route computation. Merely opening a GPX uses resetRouteDraftHistory.
    state.routeDraftSourceLayerId = null;
    state.routeWaypoints = cloneWaypoints(snapshot);
    state.routeComputation = null;
    state.routeDraftDirty = true;
}

export function mutateRouteWaypoints(next: RouteWaypoint[]): boolean {
    if (areEqual(state.routeWaypoints, next)) return false;
    undoStack.push(cloneWaypoints(state.routeWaypoints));
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    applySnapshot(next);
    return true;
}

export function undoRouteWaypoints(): boolean {
    const previous = undoStack.pop();
    if (!previous) return false;
    redoStack.push(cloneWaypoints(state.routeWaypoints));
    applySnapshot(previous);
    return true;
}

export function redoRouteWaypoints(): boolean {
    const next = redoStack.pop();
    if (!next) return false;
    undoStack.push(cloneWaypoints(state.routeWaypoints));
    applySnapshot(next);
    return true;
}

export function resetRouteDraftHistory(
    waypoints: RouteWaypoint[] = state.routeWaypoints
): void {
    undoStack = [];
    redoStack = [];
    state.routeWaypoints = cloneWaypoints(waypoints);
}

export function getRouteDraftHistoryState(): {
    canUndo: boolean;
    canRedo: boolean;
} {
    return { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
}
