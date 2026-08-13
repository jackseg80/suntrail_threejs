import type {
    GuidanceQuality,
    PreparedRouteV1,
    RouteEffort,
    TechnicalDifficulty,
} from '../preparedRoutes/preparedRoute';

export type ReadinessSectionStatus =
    'available' | 'stale' | 'unknown' | 'error';
export type ReadinessSignalSeverity = 'info' | 'warning' | 'critical';

export interface ReadinessSignal {
    code: string;
    severity: ReadinessSignalSeverity;
}

export interface ReadinessSection<T> {
    status: ReadinessSectionStatus;
    computedAt: string;
    source: string;
    data: T | null;
    signals: ReadinessSignal[];
}

export interface RouteReadinessData {
    distanceKm: number;
    ascentM: number;
    descentM: number;
    durationMinutes: number;
    effort: RouteEffort;
    technicalDifficulty: TechnicalDifficulty;
    guidanceQuality: GuidanceQuality;
}

export interface LightReadinessData {
    plannedStartAt: string;
    etaAt: string;
    sunsetAt: string;
    daylightMarginMinutes: number;
}

/**
 * La couverture ne peut être fournie que par un index qui a compté les tuiles
 * requises et présentes. Une bbox seule ne constitue jamais une preuve.
 */
export interface OfflineReadinessData {
    coveragePercent: number;
    coveredTileCount: number;
    requiredTileCount: number;
    sizeBytes: number | null;
    corridorId: string | null;
}

export interface ConditionsReadinessData {
    summary: string;
}

export interface DeviceReadinessData {
    gps: 'available' | 'unavailable' | 'unknown';
    permissions: 'available' | 'unavailable' | 'unknown';
    notifications: 'available' | 'unavailable' | 'unknown';
    battery: 'available' | 'restricted' | 'unknown';
}

export interface ReadinessEvidence<T> {
    source: string;
    observedAt: string;
    staleAfterMs: number;
    data: T;
    signals?: ReadinessSignal[];
}

export interface ReadinessFailure {
    source: string;
    observedAt: string;
    errorCode: string;
}

export type OptionalReadinessInput<T> =
    | { kind: 'evidence'; evidence: ReadinessEvidence<T> }
    | { kind: 'error'; failure: ReadinessFailure };

export interface RouteReadinessReport {
    schemaVersion: 1;
    routeId: string;
    computedAt: string;
    sections: {
        route: ReadinessSection<RouteReadinessData>;
        light: ReadinessSection<LightReadinessData>;
        offline: ReadinessSection<OfflineReadinessData>;
        conditions: ReadinessSection<ConditionsReadinessData>;
        device: ReadinessSection<DeviceReadinessData>;
    };
}

export interface BuildRouteReadinessOptions {
    now?: Date | string;
    offline?: OptionalReadinessInput<OfflineReadinessData>;
    conditions?: OptionalReadinessInput<ConditionsReadinessData>;
    device?: OptionalReadinessInput<DeviceReadinessData>;
}

function normalizeNow(value: Date | string | undefined): Date {
    const now =
        value instanceof Date ? new Date(value) : new Date(value ?? Date.now());
    if (Number.isNaN(now.getTime())) {
        throw new Error('Invalid readiness clock');
    }
    return now;
}

function unknownSection<T>(
    computedAt: string,
    source: string,
    signalCode: string
): ReadinessSection<T> {
    return {
        status: 'unknown',
        computedAt,
        source,
        data: null,
        signals: [{ code: signalCode, severity: 'warning' }],
    };
}

function optionalSection<T>(
    input: OptionalReadinessInput<T> | undefined,
    now: Date,
    unknownSource: string,
    unknownSignalCode: string
): ReadinessSection<T> {
    const computedAt = now.toISOString();
    if (!input) {
        return unknownSection(computedAt, unknownSource, unknownSignalCode);
    }
    if (input.kind === 'error') {
        const observedAt = new Date(input.failure.observedAt);
        return {
            status: 'error',
            computedAt: Number.isNaN(observedAt.getTime())
                ? computedAt
                : observedAt.toISOString(),
            source: input.failure.source,
            data: null,
            signals: [
                {
                    code: input.failure.errorCode,
                    severity: 'warning',
                },
            ],
        };
    }

    const observedAt = new Date(input.evidence.observedAt);
    const staleAfterMs = input.evidence.staleAfterMs;
    if (
        Number.isNaN(observedAt.getTime()) ||
        !Number.isFinite(staleAfterMs) ||
        staleAfterMs < 0
    ) {
        return {
            status: 'error',
            computedAt,
            source: input.evidence.source,
            data: null,
            signals: [
                { code: 'readiness.invalid-evidence', severity: 'warning' },
            ],
        };
    }
    const stale = now.getTime() - observedAt.getTime() > staleAfterMs;
    return {
        status: stale ? 'stale' : 'available',
        computedAt: observedAt.toISOString(),
        source: input.evidence.source,
        data: input.evidence.data,
        signals: [
            ...(input.evidence.signals ?? []),
            ...(stale
                ? [{ code: 'readiness.stale', severity: 'warning' as const }]
                : []),
        ],
    };
}

function hasValidOfflineMeasurement(data: OfflineReadinessData): boolean {
    if (
        !Number.isInteger(data.coveredTileCount) ||
        !Number.isInteger(data.requiredTileCount) ||
        data.coveredTileCount < 0 ||
        data.requiredTileCount <= 0 ||
        data.coveredTileCount > data.requiredTileCount ||
        !Number.isFinite(data.coveragePercent) ||
        data.coveragePercent < 0 ||
        data.coveragePercent > 100 ||
        (data.sizeBytes !== null &&
            (!Number.isFinite(data.sizeBytes) || data.sizeBytes < 0))
    ) {
        return false;
    }
    const measuredPercent =
        Math.round(
            (data.coveredTileCount / data.requiredTileCount) * 100 * 10
        ) / 10;
    return Math.abs(measuredPercent - data.coveragePercent) < 0.05;
}

function routeSignals(route: PreparedRouteV1): ReadinessSignal[] {
    const signals: ReadinessSignal[] = [];
    if (route.stats.technicalDifficulty.status === 'unknown') {
        signals.push({
            code: 'readiness.route.difficulty-unknown',
            severity: 'warning',
        });
    } else if (route.stats.technicalDifficulty.status === 'partial') {
        signals.push({
            code: 'readiness.route.difficulty-partial',
            severity: 'warning',
        });
    }
    if (route.guidanceQuality === 'not-ready') {
        signals.push({
            code: 'readiness.route.guidance-not-ready',
            severity: 'critical',
        });
    } else if (route.guidanceQuality === 'approximate') {
        signals.push({
            code: 'readiness.route.guidance-approximate',
            severity: 'warning',
        });
    }
    return signals;
}

function lightSection(
    route: PreparedRouteV1,
    computedAt: string
): ReadinessSection<LightReadinessData> {
    const light = route.stats.light;
    if (
        !route.plannedStartAt ||
        light.status === 'unknown' ||
        !light.etaAt ||
        !light.sunsetAt ||
        light.daylightMarginMinutes === null
    ) {
        return unknownSection(
            computedAt,
            'prepared-route-v1',
            'readiness.light.start-time-missing'
        );
    }

    const signals: ReadinessSignal[] = [];
    if (light.status === 'after-dark') {
        signals.push({
            code: 'readiness.light.after-dark',
            severity: 'critical',
        });
    } else if (light.status === 'near-sunset') {
        signals.push({
            code: 'readiness.light.near-sunset',
            severity: 'warning',
        });
    }
    return {
        status: 'available',
        computedAt,
        source: 'prepared-route-v1+suncalc',
        data: {
            plannedStartAt: route.plannedStartAt,
            etaAt: light.etaAt,
            sunsetAt: light.sunsetAt,
            daylightMarginMinutes: light.daylightMarginMinutes,
        },
        signals,
    };
}

export function buildRouteReadinessReport(
    route: PreparedRouteV1,
    options: BuildRouteReadinessOptions = {}
): RouteReadinessReport {
    const now = normalizeNow(options.now);
    const computedAt = now.toISOString();
    const offline = optionalSection(
        options.offline,
        now,
        'offline-coverage-index',
        'readiness.offline.not-measured'
    );
    if (offline.data && !hasValidOfflineMeasurement(offline.data)) {
        offline.status = 'error';
        offline.data = null;
        offline.signals = [
            {
                code: 'readiness.offline.invalid-measurement',
                severity: 'warning',
            },
        ];
    }
    return {
        schemaVersion: 1,
        routeId: route.id,
        computedAt,
        sections: {
            route: {
                status: 'available',
                computedAt,
                source: 'prepared-route-v1',
                data: {
                    distanceKm: route.stats.distance,
                    ascentM: route.stats.ascent,
                    descentM: route.stats.descent,
                    durationMinutes: route.stats.duration,
                    effort: { ...route.stats.effort },
                    technicalDifficulty: {
                        ...route.stats.technicalDifficulty,
                    },
                    guidanceQuality: route.guidanceQuality,
                },
                signals: routeSignals(route),
            },
            light: lightSection(route, computedAt),
            offline,
            conditions: optionalSection(
                options.conditions,
                now,
                'network-conditions',
                'readiness.conditions.not-loaded'
            ),
            device: optionalSection(
                options.device,
                now,
                'android-device-state',
                'readiness.device.not-checked'
            ),
        },
    };
}
