import { state } from '../state';
import type { PreparedRouteV1 } from '../preparedRoutes/preparedRoute';
import { inspectOfflineTileResources } from '../tileLoader';
import {
    buildRouteCorridorPlan,
    CorridorPlanningError,
    measureCorridorCoverage,
    type CorridorTileInspection,
    type CorridorTileRef,
    type RouteCorridorPlanV1,
} from './routeCorridor';
import type {
    OfflineReadinessData,
    OptionalReadinessInput,
} from './routeReadiness';

const COVERAGE_FRESH_MS = 5 * 60 * 1_000;

interface CachedCoverage {
    key: string;
    measuredAtMs: number;
    input: OptionalReadinessInput<OfflineReadinessData>;
}

export interface RouteCorridorReadinessDependencies {
    buildPlan?: (route: PreparedRouteV1) => RouteCorridorPlanV1;
    inspectTile?: (tile: CorridorTileRef) => Promise<CorridorTileInspection>;
    now?: () => number;
    contextKey?: () => string;
}

function defaultContextKey(): string {
    return JSON.stringify({
        mapSource: state.MAP_SOURCE,
        maptiler: Boolean(state.MK && !state.isMapTilerDisabled),
        trails: state.SHOW_TRAILS,
        installedPacks: [...state.installedPacks].sort(),
    });
}

export class RouteCorridorReadinessService {
    private readonly buildPlan: (route: PreparedRouteV1) => RouteCorridorPlanV1;
    private readonly inspectTile: (
        tile: CorridorTileRef
    ) => Promise<CorridorTileInspection>;
    private readonly now: () => number;
    private readonly contextKey: () => string;
    private readonly cache = new Map<string, CachedCoverage>();
    private readonly pending = new Map<string, Promise<boolean>>();
    private measurementQueue: Promise<void> = Promise.resolve();

    constructor(dependencies: RouteCorridorReadinessDependencies = {}) {
        this.buildPlan = dependencies.buildPlan ?? buildRouteCorridorPlan;
        this.inspectTile =
            dependencies.inspectTile ?? inspectOfflineTileResources;
        this.now = dependencies.now ?? (() => Date.now());
        this.contextKey = dependencies.contextKey ?? defaultContextKey;
    }

    public getInput(
        route: PreparedRouteV1
    ): OptionalReadinessInput<OfflineReadinessData> | undefined {
        if (!Array.isArray(route.geometry) || route.geometry.length < 2) {
            return undefined;
        }
        const cached = this.cache.get(route.id);
        return cached?.key === this.keyFor(route) ? cached.input : undefined;
    }

    public shouldMeasure(route: PreparedRouteV1): boolean {
        if (!Array.isArray(route.geometry) || route.geometry.length < 2) {
            return false;
        }
        if (this.pending.has(route.id)) return false;
        const cached = this.cache.get(route.id);
        return (
            !cached ||
            cached.key !== this.keyFor(route) ||
            this.now() - cached.measuredAtMs > COVERAGE_FRESH_MS
        );
    }

    public measure(route: PreparedRouteV1): Promise<boolean> {
        const existing = this.pending.get(route.id);
        if (existing) return existing;
        const promise = this.measurementQueue
            .then(() => this.measureInternal(route))
            .finally(() => {
                this.pending.delete(route.id);
            });
        this.measurementQueue = promise.then(
            () => undefined,
            () => undefined
        );
        this.pending.set(route.id, promise);
        return promise;
    }

    public clear(): void {
        this.cache.clear();
        this.pending.clear();
    }

    private async measureInternal(route: PreparedRouteV1): Promise<boolean> {
        const key = this.keyFor(route);
        const measuredAtMs = this.now();
        const observedAt = new Date(measuredAtMs).toISOString();
        try {
            const plan = this.buildPlan(route);
            const measurement = await measureCorridorCoverage(
                plan,
                this.inspectTile
            );
            // La configuration peut changer pendant les lectures OPFS/cache.
            // Dans ce cas la mesure n'est pas publiée sous un contexte obsolète.
            if (key !== this.keyFor(route)) return false;
            this.cache.set(route.id, {
                key,
                measuredAtMs,
                input: {
                    kind: 'evidence',
                    evidence: {
                        source: 'corridor-local-index-v1',
                        observedAt,
                        staleAfterMs: COVERAGE_FRESH_MS,
                        data: {
                            ...measurement,
                            corridorId: null,
                        },
                    },
                },
            });
            return true;
        } catch (error) {
            const code =
                error instanceof CorridorPlanningError
                    ? error.code
                    : 'measurement-error';
            this.cache.set(route.id, {
                key,
                measuredAtMs,
                input: {
                    kind: 'error',
                    failure: {
                        source: 'corridor-local-index-v1',
                        observedAt,
                        errorCode: `readiness.offline.${code}`,
                    },
                },
            });
            return true;
        }
    }

    private keyFor(route: PreparedRouteV1): string {
        return `${route.id}|${route.updatedAt}|${route.geometry.length}|${this.contextKey()}`;
    }
}

export const routeCorridorReadinessService =
    new RouteCorridorReadinessService();
