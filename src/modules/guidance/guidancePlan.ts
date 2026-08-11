import type {
    PreparedRouteV1,
    RoutePoint,
    RouteWaypoint,
} from '../preparedRoutes/preparedRoute';
import { guidanceMath } from './GuidanceEngine';
import type {
    GuidanceCueKind,
    GuidanceCueV1,
    GuidancePlanV1,
} from './guidanceTypes';

const WAYPOINT_ASSOCIATION_METERS = 50;
const DERIVED_MIN_LEG_METERS = 25;
const DERIVED_MIN_SPACING_METERS = 80;
const DERIVED_MIN_ANGLE_DEGREES = 45;
const DERIVED_MAX_ANGLE_DEGREES = 120;

export interface ORSGuidanceStep {
    distance: number;
    duration?: number;
    type: number;
    instruction?: string;
    name?: string;
    way_points?: [number, number];
}

export interface OSRMGuidanceStep {
    distance: number;
    name?: string;
    maneuver: {
        type: string;
        modifier?: string;
        location: [number, number];
    };
}

function cumulativeDistances(geometry: RoutePoint[]): number[] {
    const cumulative = [0];
    for (let index = 1; index < geometry.length; index++) {
        cumulative.push(
            cumulative[index - 1] +
                guidanceMath.haversineMeters(
                    geometry[index - 1],
                    geometry[index]
                )
        );
    }
    return cumulative;
}

function closestProgress(
    geometry: RoutePoint[],
    cumulative: number[],
    point: { lat: number; lon: number }
): { progressMeters: number; distanceMeters: number } {
    let best = { progressMeters: 0, distanceMeters: Number.POSITIVE_INFINITY };
    const latitudeScale = 111_195;
    const longitudeScale =
        latitudeScale * Math.cos((point.lat * Math.PI) / 180);
    for (let index = 0; index < geometry.length - 1; index++) {
        const start = geometry[index];
        const end = geometry[index + 1];
        const sx = (start.lon - point.lon) * longitudeScale;
        const sy = (start.lat - point.lat) * latitudeScale;
        const ex = (end.lon - point.lon) * longitudeScale;
        const ey = (end.lat - point.lat) * latitudeScale;
        const dx = ex - sx;
        const dy = ey - sy;
        const denominator = dx * dx + dy * dy;
        const ratio = Math.max(
            0,
            Math.min(
                1,
                denominator === 0 ? 0 : -(sx * dx + sy * dy) / denominator
            )
        );
        const distanceMeters = Math.hypot(sx + ratio * dx, sy + ratio * dy);
        if (distanceMeters < best.distanceMeters) {
            best = {
                distanceMeters,
                progressMeters:
                    cumulative[index] +
                    ratio * (cumulative[index + 1] - cumulative[index]),
            };
        }
    }
    return best;
}

function normalizeAngleDifference(value: number): number {
    let result = value;
    while (result <= -180) result += 360;
    while (result > 180) result -= 360;
    return result;
}

function cueKindFromTurn(angle: number): GuidanceCueKind {
    const magnitude = Math.abs(angle);
    const side = angle < 0 ? 'left' : 'right';
    if (magnitude < 60) return side === 'left' ? 'slight-left' : 'slight-right';
    if (magnitude < 100) return side;
    return side === 'left' ? 'sharp-left' : 'sharp-right';
}

function cueKindFromORS(type: number): GuidanceCueKind {
    const byType: Record<number, GuidanceCueKind> = {
        0: 'left',
        1: 'right',
        2: 'sharp-left',
        3: 'sharp-right',
        4: 'slight-left',
        5: 'slight-right',
        6: 'continue',
        9: 'u-turn',
        10: 'arrive',
        11: 'depart',
        12: 'slight-left',
        13: 'slight-right',
    };
    return byType[type] ?? 'continue';
}

function cueKindFromOSRM(step: OSRMGuidanceStep): GuidanceCueKind {
    const type = step.maneuver.type;
    const modifier = step.maneuver.modifier ?? '';
    if (type === 'depart') return 'depart';
    if (type === 'arrive') return 'arrive';
    if (type === 'uturn' || modifier === 'uturn') return 'u-turn';
    if (modifier === 'sharp left') return 'sharp-left';
    if (modifier === 'sharp right') return 'sharp-right';
    if (modifier === 'slight left') return 'slight-left';
    if (modifier === 'slight right') return 'slight-right';
    if (modifier.includes('left')) return 'left';
    if (modifier.includes('right')) return 'right';
    return 'continue';
}

function cueId(
    source: GuidanceCueV1['source'],
    progressMeters: number,
    index: number
): string {
    return `${source}-${Math.round(progressMeters)}-${index}`;
}

export function computeGeometryFingerprint(geometry: RoutePoint[]): string {
    let hash = 0x811c9dc5;
    for (const point of geometry) {
        const token = `${point.lat.toFixed(6)},${point.lon.toFixed(6)},${point.ele.toFixed(1)};`;
        for (let index = 0; index < token.length; index++) {
            hash ^= token.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193);
        }
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function cuesFromORSSteps(
    steps: ORSGuidanceStep[],
    geometry: RoutePoint[]
): GuidanceCueV1[] {
    const cumulative = cumulativeDistances(geometry);
    const total = cumulative[cumulative.length - 1] ?? 0;
    return steps.map((step, index) => {
        const pointIndex = Math.max(
            0,
            Math.min(geometry.length - 1, step.way_points?.[0] ?? 0)
        );
        const progressMeters = Math.min(total, cumulative[pointIndex] ?? 0);
        return {
            id: cueId('ors', progressMeters, index),
            kind: cueKindFromORS(step.type),
            progressMeters,
            label: step.instruction?.trim() || step.name?.trim() || null,
            source: 'ors',
            confidence: 'routed',
        };
    });
}

export function cuesFromOSRMSteps(
    steps: OSRMGuidanceStep[],
    geometry: RoutePoint[]
): GuidanceCueV1[] {
    const cumulative = cumulativeDistances(geometry);
    return steps.map((step, index) => {
        const [lon, lat] = step.maneuver.location;
        const progressMeters = closestProgress(geometry, cumulative, {
            lat,
            lon,
        }).progressMeters;
        return {
            id: cueId('osrm', progressMeters, index),
            kind: cueKindFromOSRM(step),
            progressMeters,
            label: step.name?.trim() || null,
            source: 'osrm',
            confidence: 'routed',
        };
    });
}

function namedWaypointCues(
    route: PreparedRouteV1,
    namedWaypoints: RouteWaypoint[]
): GuidanceCueV1[] {
    const cumulative = cumulativeDistances(route.geometry);
    const total = cumulative[cumulative.length - 1] ?? 0;
    return namedWaypoints.flatMap((waypoint, index) => {
        const label = waypoint.name?.trim();
        if (!label) return [];
        const match = closestProgress(route.geometry, cumulative, waypoint);
        if (match.distanceMeters > WAYPOINT_ASSOCIATION_METERS) return [];
        if (match.progressMeters < 5 || match.progressMeters > total - 5) {
            return [];
        }
        return [
            {
                id: cueId('gpx-waypoint', match.progressMeters, index),
                kind: 'waypoint' as const,
                progressMeters: match.progressMeters,
                label,
                source: 'gpx-waypoint' as const,
                confidence: 'declared' as const,
            },
        ];
    });
}

function derivedGeometryCues(route: PreparedRouteV1): GuidanceCueV1[] {
    const geometry = route.geometry;
    const cumulative = cumulativeDistances(geometry);
    const candidates: GuidanceCueV1[] = [];
    let lastProgress = -Number.POSITIVE_INFINITY;
    for (let index = 1; index < geometry.length - 1; index++) {
        const previousLength = cumulative[index] - cumulative[index - 1];
        const nextLength = cumulative[index + 1] - cumulative[index];
        if (
            previousLength < DERIVED_MIN_LEG_METERS ||
            nextLength < DERIVED_MIN_LEG_METERS ||
            cumulative[index] - lastProgress < DERIVED_MIN_SPACING_METERS
        ) {
            continue;
        }
        const before = guidanceMath.bearingDegrees(
            geometry[index - 1],
            geometry[index]
        );
        const after = guidanceMath.bearingDegrees(
            geometry[index],
            geometry[index + 1]
        );
        const turn = normalizeAngleDifference(after - before);
        const magnitude = Math.abs(turn);
        if (
            magnitude < DERIVED_MIN_ANGLE_DEGREES ||
            magnitude > DERIVED_MAX_ANGLE_DEGREES
        ) {
            continue;
        }
        candidates.push({
            id: cueId('geometry-derived', cumulative[index], index),
            kind: cueKindFromTurn(turn),
            progressMeters: cumulative[index],
            label: null,
            source: 'geometry-derived',
            confidence: 'derived',
        });
        lastProgress = cumulative[index];
    }
    return candidates;
}

export function buildGuidancePlan(
    route: PreparedRouteV1,
    options: {
        routedCues?: GuidanceCueV1[];
        namedWaypoints?: RouteWaypoint[];
        now?: string;
    } = {}
): GuidancePlanV1 {
    const cumulative = cumulativeDistances(route.geometry);
    const total = cumulative[cumulative.length - 1] ?? 0;
    const routed = options.routedCues ?? [];
    const declared = namedWaypointCues(
        route,
        options.namedWaypoints ?? route.waypoints
    );
    const derived = routed.length === 0 ? derivedGeometryCues(route) : [];
    const cues: GuidanceCueV1[] = [
        {
            id: 'manual-depart-0',
            kind: 'depart',
            progressMeters: 0,
            label: route.waypoints[0]?.name?.trim() || null,
            source: 'manual',
            confidence: 'declared',
        },
        ...routed,
        ...declared,
        ...derived,
        {
            id: `manual-arrive-${Math.round(total)}`,
            kind: 'arrive',
            progressMeters: total,
            label:
                route.waypoints[route.waypoints.length - 1]?.name?.trim() ||
                null,
            source: 'manual',
            confidence: 'declared',
        },
    ];
    const deduplicated = cues
        .sort((a, b) => a.progressMeters - b.progressMeters)
        .filter(
            (cue, index, all) =>
                index === 0 ||
                cue.kind !== all[index - 1].kind ||
                Math.abs(cue.progressMeters - all[index - 1].progressMeters) > 8
        );
    return validateGuidancePlan({
        schemaVersion: 1,
        routeId: route.id,
        geometryFingerprint: computeGeometryFingerprint(route.geometry),
        cues: deduplicated,
        createdAt: options.now ?? new Date().toISOString(),
    });
}

export function validateGuidancePlan(value: unknown): GuidancePlanV1 {
    if (!value || typeof value !== 'object') {
        throw new Error('Guidance plan must be an object');
    }
    const plan = value as Partial<GuidancePlanV1>;
    if (
        plan.schemaVersion !== 1 ||
        typeof plan.routeId !== 'string' ||
        !plan.routeId ||
        typeof plan.geometryFingerprint !== 'string' ||
        !Array.isArray(plan.cues) ||
        typeof plan.createdAt !== 'string' ||
        Number.isNaN(Date.parse(plan.createdAt))
    ) {
        throw new Error('Invalid GuidancePlanV1');
    }
    const validKinds: GuidanceCueKind[] = [
        'depart',
        'continue',
        'slight-left',
        'left',
        'sharp-left',
        'slight-right',
        'right',
        'sharp-right',
        'u-turn',
        'arrive',
        'waypoint',
        'poi',
    ];
    for (const cue of plan.cues) {
        if (
            !cue ||
            typeof cue.id !== 'string' ||
            !validKinds.includes(cue.kind) ||
            !Number.isFinite(cue.progressMeters) ||
            cue.progressMeters < 0 ||
            (cue.label !== null && typeof cue.label !== 'string') ||
            ![
                'ors',
                'osrm',
                'gpx-waypoint',
                'manual',
                'geometry-derived',
            ].includes(cue.source) ||
            !['routed', 'declared', 'derived'].includes(cue.confidence)
        ) {
            throw new Error('Invalid guidance cue');
        }
    }
    return plan as GuidancePlanV1;
}

export function isGuidancePlanCurrent(
    plan: GuidancePlanV1,
    route: PreparedRouteV1
): boolean {
    return (
        plan.routeId === route.id &&
        plan.geometryFingerprint === computeGeometryFingerprint(route.geometry)
    );
}

export const GUIDANCE_PLAN_THRESHOLDS = Object.freeze({
    waypointAssociationMeters: WAYPOINT_ASSOCIATION_METERS,
    derivedMinLegMeters: DERIVED_MIN_LEG_METERS,
    derivedMinSpacingMeters: DERIVED_MIN_SPACING_METERS,
    derivedMinAngleDegrees: DERIVED_MIN_ANGLE_DEGREES,
    derivedMaxAngleDegrees: DERIVED_MAX_ANGLE_DEGREES,
});
