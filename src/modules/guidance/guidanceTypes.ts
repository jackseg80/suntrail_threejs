import type { RoutePoint } from '../preparedRoutes/preparedRoute';

export type GuidanceStatus =
    | 'idle'
    | 'acquiring'
    | 'onRoute'
    | 'offRoute'
    | 'recovered'
    | 'arrived'
    | 'paused';

export type GuidanceCueKind =
    | 'depart'
    | 'continue'
    | 'slight-left'
    | 'left'
    | 'sharp-left'
    | 'slight-right'
    | 'right'
    | 'sharp-right'
    | 'u-turn'
    | 'arrive'
    | 'waypoint'
    | 'poi';

export interface GuidanceCueV1 {
    id: string;
    kind: GuidanceCueKind;
    progressMeters: number;
    label: string | null;
    source: 'ors' | 'osrm' | 'gpx-waypoint' | 'manual' | 'geometry-derived';
    confidence: 'routed' | 'declared' | 'derived';
}

export interface GuidancePlanV1 {
    schemaVersion: 1;
    routeId: string;
    geometryFingerprint: string;
    cues: GuidanceCueV1[];
    createdAt: string;
}

export interface GuidanceSnapshot {
    routeId: string;
    status: GuidanceStatus;
    progressMeters: number;
    remainingMeters: number;
    crossTrackMeters: number;
    eta: string | null;
    bearing: number | null;
    nextCue: GuidanceCueV1 | null;
    distanceToNextCueMeters: number | null;
    accuracyMeters: number | null;
    positionAgeMs: number | null;
    updatedAt: string;
}

export interface GuidancePosition {
    lat: number;
    lon: number;
    accuracyMeters: number | null;
    timestamp: number;
}

export interface GuidanceRouteInput {
    routeId: string;
    geometry: RoutePoint[];
    plannedPaceKmh: number;
    plan?: GuidancePlanV1 | null;
}

export interface GuidanceThresholds {
    maximumAccuracyMeters: number;
    stalePositionMs: number;
    acquiringGoodSamples: number;
    offRouteBaseMeters: number;
    offRouteAccuracyFactor: number;
    offRouteHoldMs: number;
    recoveryThresholdRatio: number;
    recoveryHoldMs: number;
    recoveryDisplayMs: number;
    alertCooldownMs: number;
    arrivalRadiusMeters: number;
    arrivalHoldMs: number;
    maximumBackwardMeters: number;
    continuitySearchMeters: number;
    maximumPlausibleSpeedMps: number;
    gpsJumpBaseMeters: number;
    lookAheadMeters: number;
    cuePassedMeters: number;
}

export const DEFAULT_GUIDANCE_THRESHOLDS: Readonly<GuidanceThresholds> =
    Object.freeze({
        maximumAccuracyMeters: 60,
        stalePositionMs: 15_000,
        acquiringGoodSamples: 2,
        offRouteBaseMeters: 40,
        offRouteAccuracyFactor: 1.5,
        offRouteHoldMs: 20_000,
        recoveryThresholdRatio: 0.6,
        recoveryHoldMs: 10_000,
        recoveryDisplayMs: 5_000,
        alertCooldownMs: 120_000,
        arrivalRadiusMeters: 25,
        arrivalHoldMs: 10_000,
        maximumBackwardMeters: 35,
        continuitySearchMeters: 600,
        maximumPlausibleSpeedMps: 12,
        gpsJumpBaseMeters: 250,
        lookAheadMeters: 35,
        cuePassedMeters: 12,
    });

export type GuidanceEvent = 'off-route' | 'recovered' | 'arrived';

export interface GuidanceUpdate {
    snapshot: GuidanceSnapshot;
    events: GuidanceEvent[];
    acceptedPosition: boolean;
}
