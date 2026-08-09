import SunCalc from '../suncalcCompat';
import type { GPXHistoryEntry } from '../gpxHistoryService';
import type { GPXLayer } from '../state';
import { getElevation } from '../gpxTypes';

export const PREPARED_ROUTE_SCHEMA_VERSION = 1 as const;

export interface RouteWaypoint {
    lat: number;
    lon: number;
    alt?: number;
    name?: string;
}

export interface RoutePoint {
    lat: number;
    lon: number;
    ele: number;
}

export interface RouteBounds {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
}

export type RouteSource = 'manual' | 'gpx-import' | 'legacy-conversion';
export type GuidanceQuality = 'full' | 'approximate' | 'not-ready';

export interface TechnicalDifficulty {
    status: 'known' | 'partial' | 'unknown';
    source: 'ors' | 'osrm' | 'gpx' | 'legacy' | 'none';
    sacLevel: 1 | 2 | 3 | 4 | 5 | 6 | null;
    coveragePercent: number;
    reason:
        | 'complete'
        | 'partial'
        | 'osrm-fallback'
        | 'missing-data'
        | 'gpx-no-difficulty'
        | 'legacy-simplified';
}

export interface RouteDataCoverage {
    trailDifficulty: number;
    steepness: number;
    surface: number;
    wayType: number;
}

export interface RouteEffort {
    level: 'easy' | 'moderate' | 'demanding' | 'strenuous';
    score: number;
    method: 'distance-dplus-duration-v1';
}

export interface RouteLightSummary {
    status: 'daylight' | 'near-sunset' | 'after-dark' | 'unknown';
    etaAt: string | null;
    sunsetAt: string | null;
    daylightMarginMinutes: number | null;
}

export interface RouteStats {
    distance: number;
    ascent: number;
    descent: number;
    duration: number;
    routingDuration: number;
    pointCount: number;
    technicalDifficulty: TechnicalDifficulty;
    dataCoverage: RouteDataCoverage;
    effort: RouteEffort;
    light: RouteLightSummary;
}

/**
 * Contrat métier local v5.83. Les informations de synchronisation restent
 * volontairement hors de ce modèle.
 */
export interface PreparedRouteV1 {
    schemaVersion: 1;
    id: string;
    name: string;
    source: RouteSource;
    activityProfile: string;
    loopEnabled: boolean;
    waypoints: RouteWaypoint[];
    geometry: RoutePoint[];
    stats: RouteStats;
    bounds: RouteBounds;
    plannedStartAt: string | null;
    plannedPaceKmh: number;
    favorite: boolean;
    notes: string;
    tags: string[];
    guidanceQuality: GuidanceQuality;
    createdAt: string;
    updatedAt: string;
}

export interface RouteComputationSnapshot {
    name: string;
    geometry: RoutePoint[];
    distance: number;
    duration: number;
    ascent: number;
    descent: number;
    routingSource: 'ors' | 'osrm' | 'gpx' | 'legacy';
    guidanceQuality: GuidanceQuality;
    technicalDifficulty: TechnicalDifficulty;
    dataCoverage: RouteDataCoverage;
}

export class PreparedRouteValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PreparedRouteValidationError';
    }
}

const GPX_LOOP_ENDPOINT_THRESHOLD_METERS = 50;

function isClosedGPXGeometry(
    geometry: RoutePoint[],
    distanceKm: number
): boolean {
    if (geometry.length < 4 || distanceKm < 0.1) return false;
    const firstPoint = geometry[0];
    const lastPoint = geometry[geometry.length - 1];
    const averageLatitudeRad =
        (((firstPoint.lat + lastPoint.lat) / 2) * Math.PI) / 180;
    const endpointDistanceMeters = Math.hypot(
        (lastPoint.lon - firstPoint.lon) *
            111_320 *
            Math.cos(averageLatitudeRad),
        (lastPoint.lat - firstPoint.lat) * 110_540
    );
    return endpointDistanceMeters <= GPX_LOOP_ENDPOINT_THRESHOLD_METERS;
}

function createGPXWaypoints(
    geometry: RoutePoint[],
    isClosedLoop: boolean
): RouteWaypoint[] {
    const waypointIndexes = isClosedLoop
        ? [
              0,
              Math.round((geometry.length - 1) / 3),
              Math.round(((geometry.length - 1) * 2) / 3),
              geometry.length - 1,
          ]
        : [0, geometry.length - 1];
    return waypointIndexes.map((index) => ({
        lat: geometry[index].lat,
        lon: geometry[index].lon,
        alt: geometry[index].ele,
    }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isIsoDate(value: unknown): value is string {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isNullableIsoDate(value: unknown): value is string | null {
    return value === null || isIsoDate(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
    return value === null || isFiniteNumber(value);
}

function isGeoPoint(value: unknown): value is RoutePoint {
    if (!isRecord(value)) return false;
    return (
        isFiniteNumber(value.lat) &&
        value.lat >= -90 &&
        value.lat <= 90 &&
        isFiniteNumber(value.lon) &&
        value.lon >= -180 &&
        value.lon <= 180 &&
        isFiniteNumber(value.ele)
    );
}

function isWaypoint(value: unknown): value is RouteWaypoint {
    if (!isRecord(value)) return false;
    return (
        isFiniteNumber(value.lat) &&
        value.lat >= -90 &&
        value.lat <= 90 &&
        isFiniteNumber(value.lon) &&
        value.lon >= -180 &&
        value.lon <= 180 &&
        (value.alt === undefined || isFiniteNumber(value.alt)) &&
        (value.name === undefined || typeof value.name === 'string')
    );
}

function isCoverage(value: unknown): value is RouteDataCoverage {
    if (!isRecord(value)) return false;
    return ['trailDifficulty', 'steepness', 'surface', 'wayType'].every(
        (key) =>
            isFiniteNumber(value[key]) &&
            (value[key] as number) >= 0 &&
            (value[key] as number) <= 100
    );
}

function isDifficulty(value: unknown): value is TechnicalDifficulty {
    if (!isRecord(value)) return false;
    return (
        ['known', 'partial', 'unknown'].includes(String(value.status)) &&
        ['ors', 'osrm', 'gpx', 'legacy', 'none'].includes(
            String(value.source)
        ) &&
        (value.sacLevel === null ||
            (Number.isInteger(value.sacLevel) &&
                Number(value.sacLevel) >= 1 &&
                Number(value.sacLevel) <= 6)) &&
        isFiniteNumber(value.coveragePercent) &&
        value.coveragePercent >= 0 &&
        value.coveragePercent <= 100 &&
        [
            'complete',
            'partial',
            'osrm-fallback',
            'missing-data',
            'gpx-no-difficulty',
            'legacy-simplified',
        ].includes(String(value.reason))
    );
}

function isStats(value: unknown): value is RouteStats {
    if (!isRecord(value)) return false;
    const numericKeys = [
        'distance',
        'ascent',
        'descent',
        'duration',
        'routingDuration',
        'pointCount',
    ];
    if (
        !numericKeys.every(
            (key) => isFiniteNumber(value[key]) && Number(value[key]) >= 0
        )
    ) {
        return false;
    }
    if (!isDifficulty(value.technicalDifficulty)) return false;
    if (!isCoverage(value.dataCoverage)) return false;
    if (!isRecord(value.effort) || !isRecord(value.light)) return false;
    return (
        ['easy', 'moderate', 'demanding', 'strenuous'].includes(
            String(value.effort.level)
        ) &&
        isFiniteNumber(value.effort.score) &&
        value.effort.score >= 0 &&
        value.effort.method === 'distance-dplus-duration-v1' &&
        ['daylight', 'near-sunset', 'after-dark', 'unknown'].includes(
            String(value.light.status)
        ) &&
        isNullableIsoDate(value.light.etaAt) &&
        isNullableIsoDate(value.light.sunsetAt) &&
        isNullableFiniteNumber(value.light.daylightMarginMinutes)
    );
}

export function validatePreparedRoute(value: unknown): PreparedRouteV1 {
    if (!isRecord(value)) {
        throw new PreparedRouteValidationError(
            'Route record must be an object'
        );
    }
    if (value.schemaVersion !== PREPARED_ROUTE_SCHEMA_VERSION) {
        throw new PreparedRouteValidationError(
            `Unsupported schemaVersion: ${String(value.schemaVersion)}`
        );
    }
    if (typeof value.id !== 'string' || value.id.trim().length === 0) {
        throw new PreparedRouteValidationError('Route id is required');
    }
    if (typeof value.name !== 'string' || value.name.trim().length === 0) {
        throw new PreparedRouteValidationError('Route name is required');
    }
    if (
        !['manual', 'gpx-import', 'legacy-conversion'].includes(
            String(value.source)
        )
    ) {
        throw new PreparedRouteValidationError('Invalid route source');
    }
    if (typeof value.activityProfile !== 'string') {
        throw new PreparedRouteValidationError('Activity profile is required');
    }
    if (
        value.loopEnabled !== undefined &&
        typeof value.loopEnabled !== 'boolean'
    ) {
        throw new PreparedRouteValidationError('Invalid loop flag');
    }
    if (!Array.isArray(value.waypoints) || !value.waypoints.every(isWaypoint)) {
        throw new PreparedRouteValidationError('Invalid route waypoints');
    }
    if (
        !Array.isArray(value.geometry) ||
        value.geometry.length < 2 ||
        !value.geometry.every(isGeoPoint)
    ) {
        throw new PreparedRouteValidationError('Invalid route geometry');
    }
    if (!isStats(value.stats)) {
        throw new PreparedRouteValidationError('Invalid route statistics');
    }
    if (!isRecord(value.bounds)) {
        throw new PreparedRouteValidationError('Invalid route bounds');
    }
    const bounds = value.bounds;
    if (
        !['minLat', 'maxLat', 'minLon', 'maxLon'].every((key) =>
            isFiniteNumber(bounds[key])
        ) ||
        Number(bounds.minLat) < -90 ||
        Number(bounds.maxLat) > 90 ||
        Number(bounds.minLon) < -180 ||
        Number(bounds.maxLon) > 180 ||
        Number(bounds.minLat) > Number(bounds.maxLat) ||
        Number(bounds.minLon) > Number(bounds.maxLon)
    ) {
        throw new PreparedRouteValidationError('Invalid route bounds');
    }
    if (value.plannedStartAt !== null && !isIsoDate(value.plannedStartAt)) {
        throw new PreparedRouteValidationError('Invalid planned start date');
    }
    if (
        !isFiniteNumber(value.plannedPaceKmh) ||
        value.plannedPaceKmh <= 0 ||
        value.plannedPaceKmh > 30
    ) {
        throw new PreparedRouteValidationError('Invalid planned pace');
    }
    if (typeof value.favorite !== 'boolean') {
        throw new PreparedRouteValidationError('Invalid favorite flag');
    }
    if (typeof value.notes !== 'string') {
        throw new PreparedRouteValidationError('Invalid notes');
    }
    if (
        !Array.isArray(value.tags) ||
        !value.tags.every((tag) => typeof tag === 'string')
    ) {
        throw new PreparedRouteValidationError('Invalid tags');
    }
    if (
        !['full', 'approximate', 'not-ready'].includes(
            String(value.guidanceQuality)
        )
    ) {
        throw new PreparedRouteValidationError('Invalid guidance quality');
    }
    if (!isIsoDate(value.createdAt) || !isIsoDate(value.updatedAt)) {
        throw new PreparedRouteValidationError('Invalid route timestamps');
    }
    // Compatibilité pure avec les premières routes v5.83 : le réglage Boucle
    // pouvait manquer et un GPX fermé ne possédait que deux extrémités
    // superposées. La géométrie persistée reste inchangée.
    const route = (value.loopEnabled === undefined
        ? { ...value, loopEnabled: false }
        : value) as unknown as PreparedRouteV1;
    const isClosedGPX =
        route.source === 'gpx-import' &&
        isClosedGPXGeometry(route.geometry, route.stats.distance);
    if (isClosedGPX && route.waypoints.length <= 2) {
        return {
            ...route,
            loopEnabled: true,
            waypoints: createGPXWaypoints(route.geometry, true),
        };
    }
    return route;
}

export function computeBounds(points: RoutePoint[]): RouteBounds {
    if (points.length < 2) {
        throw new PreparedRouteValidationError(
            'At least two geometry points are required'
        );
    }
    return {
        minLat: Math.min(...points.map((point) => point.lat)),
        maxLat: Math.max(...points.map((point) => point.lat)),
        minLon: Math.min(...points.map((point) => point.lon)),
        maxLon: Math.max(...points.map((point) => point.lon)),
    };
}

export function computePlannedDurationMinutes(
    distanceKm: number,
    ascentM: number,
    paceKmh: number
): number {
    if (paceKmh <= 0) return 0;
    // Temps horizontal à l'allure choisie + 1 h par 600 m de montée.
    return Math.max(0, (distanceKm / paceKmh) * 60 + (ascentM / 600) * 60);
}

export function computeEffort(
    distanceKm: number,
    ascentM: number,
    durationMinutes: number
): RouteEffort {
    const score =
        Math.round((distanceKm + ascentM / 100 + durationMinutes / 120) * 10) /
        10;
    const level: RouteEffort['level'] =
        score < 8
            ? 'easy'
            : score < 16
              ? 'moderate'
              : score < 26
                ? 'demanding'
                : 'strenuous';
    return { level, score, method: 'distance-dplus-duration-v1' };
}

export function computeLightSummary(
    geometry: RoutePoint[],
    plannedStartAt: string | null,
    durationMinutes: number
): RouteLightSummary {
    if (!plannedStartAt || geometry.length < 2) {
        return {
            status: 'unknown',
            etaAt: null,
            sunsetAt: null,
            daylightMarginMinutes: null,
        };
    }
    const start = new Date(plannedStartAt);
    if (Number.isNaN(start.getTime())) {
        return {
            status: 'unknown',
            etaAt: null,
            sunsetAt: null,
            daylightMarginMinutes: null,
        };
    }
    const eta = new Date(start.getTime() + durationMinutes * 60_000);
    const end = geometry[geometry.length - 1];
    const sunset = SunCalc.getTimes(eta, end.lat, end.lon).sunset;
    if (!(sunset instanceof Date) || Number.isNaN(sunset.getTime())) {
        return {
            status: 'unknown',
            etaAt: eta.toISOString(),
            sunsetAt: null,
            daylightMarginMinutes: null,
        };
    }
    const margin = Math.round((sunset.getTime() - eta.getTime()) / 60_000);
    return {
        status:
            margin < 0
                ? 'after-dark'
                : margin < 60
                  ? 'near-sunset'
                  : 'daylight',
        etaAt: eta.toISOString(),
        sunsetAt: sunset.toISOString(),
        daylightMarginMinutes: margin,
    };
}

export function unknownDifficulty(
    source: TechnicalDifficulty['source'],
    reason: TechnicalDifficulty['reason']
): TechnicalDifficulty {
    return {
        status: 'unknown',
        source,
        sacLevel: null,
        coveragePercent: 0,
        reason,
    };
}

export function emptyCoverage(): RouteDataCoverage {
    return { trailDifficulty: 0, steepness: 0, surface: 0, wayType: 0 };
}

export function createPreparedRouteFromComputation(options: {
    id?: string;
    name: string;
    source?: RouteSource;
    activityProfile: string;
    loopEnabled?: boolean;
    waypoints: RouteWaypoint[];
    computation: RouteComputationSnapshot;
    plannedStartAt: string | null;
    plannedPaceKmh: number;
    favorite?: boolean;
    notes?: string;
    tags?: string[];
    guidanceQuality?: GuidanceQuality;
    createdAt?: string;
    now?: string;
}): PreparedRouteV1 {
    const now = options.now ?? new Date().toISOString();
    const duration = computePlannedDurationMinutes(
        options.computation.distance,
        options.computation.ascent,
        options.plannedPaceKmh
    );
    const route: PreparedRouteV1 = {
        schemaVersion: PREPARED_ROUTE_SCHEMA_VERSION,
        id: options.id ?? createRouteId(),
        name: options.name.trim() || options.computation.name,
        source: options.source ?? 'manual',
        activityProfile: options.activityProfile,
        loopEnabled: options.loopEnabled ?? false,
        waypoints: options.waypoints.map((waypoint) => ({ ...waypoint })),
        geometry: options.computation.geometry.map((point) => ({ ...point })),
        stats: {
            distance: options.computation.distance,
            ascent: options.computation.ascent,
            descent: options.computation.descent,
            duration,
            routingDuration: options.computation.duration,
            pointCount: options.computation.geometry.length,
            technicalDifficulty: {
                ...options.computation.technicalDifficulty,
            },
            dataCoverage: { ...options.computation.dataCoverage },
            effort: computeEffort(
                options.computation.distance,
                options.computation.ascent,
                duration
            ),
            light: computeLightSummary(
                options.computation.geometry,
                options.plannedStartAt,
                duration
            ),
        },
        bounds: computeBounds(options.computation.geometry),
        plannedStartAt: options.plannedStartAt,
        plannedPaceKmh: options.plannedPaceKmh,
        favorite: options.favorite ?? false,
        notes: options.notes ?? '',
        tags: [...(options.tags ?? [])],
        guidanceQuality: options.guidanceQuality ?? 'full',
        createdAt: options.createdAt ?? now,
        updatedAt: now,
    };
    return validatePreparedRoute(route);
}

export function createPreparedRouteFromGPXLayer(
    layer: GPXLayer,
    options: {
        plannedStartAt?: string | null;
        plannedPaceKmh?: number;
        now?: string;
    } = {}
): PreparedRouteV1 {
    const rawPoints = layer.rawData?.tracks?.[0]?.points ?? [];
    const geometry = rawPoints.map((point) => ({
        lat: point.lat,
        lon: point.lon,
        ele: getElevation(point),
    }));
    if (geometry.length < 2) {
        throw new PreparedRouteValidationError(
            'The GPX layer does not contain a complete geometry'
        );
    }
    const isClosedLoop = isClosedGPXGeometry(geometry, layer.stats.distance);
    const waypoints = createGPXWaypoints(geometry, isClosedLoop);
    const plannedPaceKmh = options.plannedPaceKmh ?? 4;
    const duration = computePlannedDurationMinutes(
        layer.stats.distance,
        layer.stats.dPlus,
        plannedPaceKmh
    );
    const now = options.now ?? new Date().toISOString();
    return validatePreparedRoute({
        schemaVersion: PREPARED_ROUTE_SCHEMA_VERSION,
        id: createRouteId(),
        name: layer.name,
        source: 'gpx-import',
        activityProfile: 'foot-hiking',
        loopEnabled: isClosedLoop,
        waypoints,
        geometry,
        stats: {
            distance: layer.stats.distance,
            ascent: layer.stats.dPlus,
            descent: layer.stats.dMinus,
            duration,
            routingDuration: layer.stats.estimatedTime ?? duration,
            pointCount: geometry.length,
            technicalDifficulty: unknownDifficulty('gpx', 'gpx-no-difficulty'),
            dataCoverage: emptyCoverage(),
            effort: computeEffort(
                layer.stats.distance,
                layer.stats.dPlus,
                duration
            ),
            light: computeLightSummary(
                geometry,
                options.plannedStartAt ?? null,
                duration
            ),
        },
        bounds: computeBounds(geometry),
        plannedStartAt: options.plannedStartAt ?? null,
        plannedPaceKmh,
        favorite: false,
        notes: '',
        tags: [],
        guidanceQuality: 'full',
        createdAt: now,
        updatedAt: now,
    });
}

export function convertLegacyHistoryEntry(
    entry: GPXHistoryEntry,
    options: { now?: string; plannedPaceKmh?: number } = {}
): PreparedRouteV1 {
    const geometry = entry.simplifiedPoints.map((point) => ({ ...point }));
    const plannedPaceKmh = options.plannedPaceKmh ?? 4;
    const duration = computePlannedDurationMinutes(
        entry.stats.distance,
        entry.stats.dPlus,
        plannedPaceKmh
    );
    const now = options.now ?? new Date().toISOString();
    return validatePreparedRoute({
        schemaVersion: PREPARED_ROUTE_SCHEMA_VERSION,
        id: createRouteId(),
        name: entry.name,
        source: 'legacy-conversion',
        activityProfile: 'foot-hiking',
        loopEnabled: false,
        waypoints: [
            {
                lat: geometry[0].lat,
                lon: geometry[0].lon,
                alt: geometry[0].ele,
            },
            {
                lat: geometry[geometry.length - 1].lat,
                lon: geometry[geometry.length - 1].lon,
                alt: geometry[geometry.length - 1].ele,
            },
        ],
        geometry,
        stats: {
            distance: entry.stats.distance,
            ascent: entry.stats.dPlus,
            descent: entry.stats.dMinus,
            duration,
            routingDuration: entry.stats.estimatedTime ?? duration,
            pointCount: geometry.length,
            technicalDifficulty: unknownDifficulty(
                'legacy',
                'legacy-simplified'
            ),
            dataCoverage: emptyCoverage(),
            effort: computeEffort(
                entry.stats.distance,
                entry.stats.dPlus,
                duration
            ),
            light: computeLightSummary(geometry, null, duration),
        },
        bounds: entry.bounds,
        plannedStartAt: null,
        plannedPaceKmh,
        favorite: false,
        notes: '',
        tags: [],
        guidanceQuality: 'approximate',
        createdAt: now,
        updatedAt: now,
    });
}

export function createRouteId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `route-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
