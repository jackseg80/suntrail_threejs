import { eventBus } from '../eventBus';
import { clearRouteWaypoints, displayPreparedRoute } from '../routingService';
import { cancelScheduledAutoCompute } from '../routeManager';
import { state } from '../state';
import type { GPXHistoryEntry } from '../gpxHistoryService';
import type { GPXLayer } from '../state';
import { RouteRepository, RouteRepositoryError } from './RouteRepository';
import { resetRouteDraftHistory } from './routeDraftHistory';
import {
    createPreparedRouteFromComputation,
    createPreparedRouteFromGPXLayer,
    createRouteId,
    convertLegacyHistoryEntry,
    type PreparedRouteV1,
    type RouteWaypoint,
} from './preparedRoute';
import {
    buildGuidancePlan,
    isGuidancePlanCurrent,
} from '../guidance/guidancePlan';
import type { GuidancePlanV1 } from '../guidance/guidanceTypes';
import { nativeGPSService } from '../nativeGPSService';

export class PreparedRouteService {
    private repository: RouteRepository | null;
    private lastError: RouteRepositoryError | null = null;

    constructor(repository?: RouteRepository) {
        this.repository = repository ?? null;
    }

    public getLastError(): RouteRepositoryError | null {
        return this.lastError;
    }

    public async initialize(): Promise<void> {
        try {
            await this.getRepository().open();
            await this.refresh();
        } catch (error) {
            this.captureError(error);
            state.preparedRoutes = [];
            eventBus.emit('preparedRoutesUpdated');
        }
    }

    public async refresh(): Promise<PreparedRouteV1[]> {
        try {
            const routes = await this.getRepository().list();
            this.lastError = null;
            state.preparedRoutes = routes;
            eventBus.emit('preparedRoutesUpdated');
            return routes;
        } catch (error) {
            this.captureError(error);
            eventBus.emit('preparedRoutesUpdated');
            throw error;
        }
    }

    public async saveCurrentDraft(): Promise<PreparedRouteV1> {
        if (!state.routeComputation || state.routeWaypoints.length < 2) {
            throw new Error('preparedRoutes.error.notReady');
        }
        const existing = state.activePreparedRouteId
            ? state.preparedRoutes.find(
                  (route) => route.id === state.activePreparedRouteId
              )
            : undefined;
        const route = createPreparedRouteFromComputation({
            id: existing?.id,
            createdAt: existing?.createdAt,
            name: state.routeDraftName.trim() || state.routeComputation.name,
            source:
                state.routeComputation.routingSource === 'gpx'
                    ? 'gpx-import'
                    : state.routeComputation.routingSource === 'legacy'
                      ? 'legacy-conversion'
                      : 'manual',
            activityProfile: state.activeRouteProfile,
            loopEnabled: state.routeLoopEnabled,
            waypoints: state.routeWaypoints,
            computation: state.routeComputation,
            plannedStartAt: state.routePlannedStartAt,
            plannedPaceKmh: state.routePlannedPaceKmh,
            favorite: state.routeDraftFavorite,
            notes: state.routeDraftNotes,
            tags: state.routeDraftTags,
            guidanceQuality: state.routeComputation.guidanceQuality,
        });
        const plan = buildGuidancePlan(route, {
            routedCues: state.routeComputation.guidanceCues,
        });
        await this.saveRoute(route, plan);
        this.applyRouteMetadata(route);
        state.routeDraftDirty = false;
        state.routeLastSavedAt = route.updatedAt;
        return route;
    }

    public async importGPXLayer(layer: GPXLayer): Promise<PreparedRouteV1> {
        const route = createPreparedRouteFromGPXLayer(layer, {
            plannedStartAt: state.routePlannedStartAt,
            plannedPaceKmh: state.routePlannedPaceKmh,
        });
        const namedWaypoints: RouteWaypoint[] = [
            ...(layer.rawData.waypoints ?? []).map((waypoint) => ({
                lat: waypoint.lat,
                lon: waypoint.lon,
                alt: waypoint.ele,
                name:
                    waypoint.name?.trim() ||
                    waypoint.desc?.trim() ||
                    waypoint.cmt?.trim(),
            })),
            ...(layer.rawData.routes ?? []).flatMap((gpxRoute) =>
                gpxRoute.points
                    .filter((point) => !!point.name?.trim())
                    .map((point) => ({
                        lat: point.lat,
                        lon: point.lon,
                        alt: point.ele ?? point.alt,
                        name: point.name,
                    }))
            ),
        ];
        await this.saveRoute(
            route,
            buildGuidancePlan(route, { namedWaypoints })
        );
        return route;
    }

    public async convertLegacy(
        entry: GPXHistoryEntry
    ): Promise<PreparedRouteV1> {
        const route = convertLegacyHistoryEntry(entry, {
            plannedPaceKmh: state.routePlannedPaceKmh,
        });
        await this.saveRoute(route, buildGuidancePlan(route));
        return route;
    }

    public async load(id: string): Promise<PreparedRouteV1> {
        const route = await this.getRepository().get(id);
        if (!route) throw new Error('preparedRoutes.error.notFound');
        displayPreparedRoute(route);
        cancelScheduledAutoCompute();
        this.applyRouteMetadata(route);
        state.routeDraftDirty = false;
        state.routeLastSavedAt = route.updatedAt;
        return route;
    }

    /** Lecture sans effet UI, notamment pour rattacher une WebView au guidage natif. */
    public async getById(id: string): Promise<PreparedRouteV1 | null> {
        return this.getRepository().get(id);
    }

    public prepareGPXLayerAsDraft(layer: GPXLayer): void {
        const route = createPreparedRouteFromGPXLayer(layer, {
            plannedStartAt: state.routePlannedStartAt,
            plannedPaceKmh: state.routePlannedPaceKmh,
        });
        clearRouteWaypoints();
        state.routeDraftSourceLayerId = layer.id;
        resetRouteDraftHistory(
            route.waypoints.map((waypoint) => ({
                ...waypoint,
                name:
                    waypoint.name ||
                    `${waypoint.lat.toFixed(5)}, ${waypoint.lon.toFixed(5)}`,
            }))
        );
        cancelScheduledAutoCompute();
        state.routeComputation = {
            name: route.name,
            geometry: route.geometry.map((point) => ({ ...point })),
            distance: route.stats.distance,
            duration: route.stats.routingDuration,
            ascent: route.stats.ascent,
            descent: route.stats.descent,
            routingSource: 'gpx',
            guidanceQuality: route.guidanceQuality,
            technicalDifficulty: { ...route.stats.technicalDifficulty },
            dataCoverage: { ...route.stats.dataCoverage },
        };
        state.activeRouteProfile =
            route.activityProfile as typeof state.activeRouteProfile;
        state.routeLoopEnabled = route.loopEnabled;
        state.activePreparedRouteId = null;
        state.routeDraftName = route.name;
        state.routeDraftFavorite = false;
        state.routeDraftNotes = '';
        state.routeDraftTags = [];
        state.routeDraftDirty = true;
        state.routeLastSavedAt = null;
        state.activeGPXLayerId = layer.id;
    }

    public async duplicate(id: string): Promise<PreparedRouteV1> {
        const source = await this.getRepository().get(id);
        if (!source) throw new Error('preparedRoutes.error.notFound');
        const now = new Date().toISOString();
        const duplicate: PreparedRouteV1 = {
            ...source,
            id: createRouteId(),
            name: `${source.name} — copie`,
            waypoints: source.waypoints.map((waypoint) => ({ ...waypoint })),
            geometry: source.geometry.map((point) => ({ ...point })),
            stats: {
                ...source.stats,
                technicalDifficulty: {
                    ...source.stats.technicalDifficulty,
                },
                dataCoverage: { ...source.stats.dataCoverage },
                effort: { ...source.stats.effort },
                light: { ...source.stats.light },
            },
            bounds: { ...source.bounds },
            tags: [...source.tags],
            favorite: false,
            createdAt: now,
            updatedAt: now,
        };
        const sourcePlan = await this.getRepository().getGuidancePlan(id);
        await this.saveRoute(
            duplicate,
            buildGuidancePlan(duplicate, {
                routedCues: sourcePlan?.cues.filter(
                    (cue) => cue.source === 'ors' || cue.source === 'osrm'
                ),
            })
        );
        return duplicate;
    }

    public async getGuidancePlan(
        route: PreparedRouteV1
    ): Promise<GuidancePlanV1> {
        const stored = await this.getRepository().getGuidancePlan(route.id);
        if (stored && isGuidancePlanCurrent(stored, route)) return stored;
        const regenerated = buildGuidancePlan(route);
        await this.getRepository().saveGuidancePlan(regenerated);
        return regenerated;
    }

    public async toggleFavorite(id: string): Promise<PreparedRouteV1> {
        const route = await this.getRepository().get(id);
        if (!route) throw new Error('preparedRoutes.error.notFound');
        const updated = {
            ...route,
            favorite: !route.favorite,
            updatedAt: new Date().toISOString(),
        };
        const plan = await this.getGuidancePlan(route);
        await this.saveRoute(updated, plan);
        if (state.activePreparedRouteId === id) {
            state.routeDraftFavorite = updated.favorite;
        }
        return updated;
    }

    public async delete(id: string): Promise<void> {
        try {
            const nativeSession = await nativeGPSService.getActiveSession();
            if (nativeSession?.guidance && nativeSession.routeId === id) {
                await nativeGPSService.stopGuidance();
            }
            await this.getRepository().delete(id);
            if (state.activePreparedRouteId === id) {
                state.activePreparedRouteId = null;
                state.routeLastSavedAt = null;
                state.routeDraftDirty = true;
            }
            await this.refresh();
        } catch (error) {
            this.captureError(error);
            throw error;
        }
    }

    public async close(): Promise<void> {
        await this.repository?.close();
    }

    private async saveRoute(
        route: PreparedRouteV1,
        plan?: GuidancePlanV1
    ): Promise<void> {
        try {
            if (plan) {
                await this.getRepository().saveRouteWithPlan(route, plan);
            } else {
                await this.getRepository().save(route);
            }
            this.lastError = null;
            await this.refresh();
        } catch (error) {
            this.captureError(error);
            eventBus.emit('preparedRoutesUpdated');
            throw error;
        }
    }

    private applyRouteMetadata(route: PreparedRouteV1): void {
        state.activePreparedRouteId = route.id;
        state.routeDraftSourceLayerId = null;
        state.routeDraftName = route.name;
        state.routeLoopEnabled = route.loopEnabled;
        state.routePlannedStartAt = route.plannedStartAt;
        state.routePlannedPaceKmh = route.plannedPaceKmh;
        state.routeDraftFavorite = route.favorite;
        state.routeDraftNotes = route.notes;
        state.routeDraftTags = [...route.tags];
    }

    private getRepository(): RouteRepository {
        if (this.repository) return this.repository;
        const factory = globalThis.indexedDB;
        if (!factory) {
            throw new RouteRepositoryError(
                'unavailable',
                'IndexedDB is unavailable on this device.'
            );
        }
        this.repository = new RouteRepository(factory);
        return this.repository;
    }

    private captureError(error: unknown): void {
        this.lastError =
            error instanceof RouteRepositoryError
                ? error
                : new RouteRepositoryError(
                      'unknown',
                      error instanceof Error
                          ? error.message
                          : 'Prepared route storage error',
                      error
                  );
    }
}

export const preparedRouteService = new PreparedRouteService();
