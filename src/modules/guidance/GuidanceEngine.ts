import type { RoutePoint } from '../preparedRoutes/preparedRoute';
import {
    DEFAULT_GUIDANCE_THRESHOLDS,
    type GuidanceCueV1,
    type GuidancePosition,
    type GuidanceRouteInput,
    type GuidanceSnapshot,
    type GuidanceStatus,
    type GuidanceThresholds,
    type GuidanceUpdate,
} from './guidanceTypes';

const EARTH_RADIUS_METERS = 6_371_000;

interface XYPoint {
    x: number;
    y: number;
}

interface PreparedSegment {
    start: RoutePoint;
    end: RoutePoint;
    startXY: XYPoint;
    endXY: XYPoint;
    lengthMeters: number;
    cumulativeStartMeters: number;
    bearing: number;
}

interface ProjectionCandidate {
    segmentIndex: number;
    progressMeters: number;
    crossTrackMeters: number;
    projected: RoutePoint;
}

function toRadians(value: number): number {
    return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
    return (value * 180) / Math.PI;
}

function normalizeBearing(value: number): number {
    return ((value % 360) + 360) % 360;
}

function haversineMeters(a: RoutePoint, b: RoutePoint): number {
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);
    const dLat = lat2 - lat1;
    const dLon = toRadians(b.lon - a.lon);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearingDegrees(a: RoutePoint, b: RoutePoint): number {
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);
    const dLon = toRadians(b.lon - a.lon);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
        Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return normalizeBearing(toDegrees(Math.atan2(y, x)));
}

function createProjector(
    reference: RoutePoint
): (point: RoutePoint) => XYPoint {
    const latitudeScale = EARTH_RADIUS_METERS * (Math.PI / 180);
    const longitudeScale = latitudeScale * Math.cos(toRadians(reference.lat));
    return (point) => ({
        x: (point.lon - reference.lon) * longitudeScale,
        y: (point.lat - reference.lat) * latitudeScale,
    });
}

function interpolatePoint(
    start: RoutePoint,
    end: RoutePoint,
    ratio: number
): RoutePoint {
    return {
        lat: start.lat + (end.lat - start.lat) * ratio,
        lon: start.lon + (end.lon - start.lon) * ratio,
        ele: start.ele + (end.ele - start.ele) * ratio,
    };
}

function projectOnSegment(
    position: RoutePoint,
    segment: PreparedSegment,
    project: (point: RoutePoint) => XYPoint,
    segmentIndex: number
): ProjectionCandidate {
    const point = project(position);
    const dx = segment.endXY.x - segment.startXY.x;
    const dy = segment.endXY.y - segment.startXY.y;
    const lengthSquared = dx * dx + dy * dy;
    const rawRatio =
        lengthSquared === 0
            ? 0
            : ((point.x - segment.startXY.x) * dx +
                  (point.y - segment.startXY.y) * dy) /
              lengthSquared;
    const ratio = Math.max(0, Math.min(1, rawRatio));
    const projectedXY = {
        x: segment.startXY.x + ratio * dx,
        y: segment.startXY.y + ratio * dy,
    };
    return {
        segmentIndex,
        progressMeters:
            segment.cumulativeStartMeters + ratio * segment.lengthMeters,
        crossTrackMeters: Math.hypot(
            point.x - projectedXY.x,
            point.y - projectedXY.y
        ),
        projected: interpolatePoint(segment.start, segment.end, ratio),
    };
}

/**
 * Moteur de suivi v5.84 pur : aucune dépendance DOM, Capacitor ou Three.js.
 */
export class GuidanceEngine {
    private readonly thresholds: GuidanceThresholds;
    private readonly geometry: RoutePoint[];
    private readonly segments: PreparedSegment[];
    private readonly project: (point: RoutePoint) => XYPoint;
    private readonly totalMeters: number;
    private readonly cues: GuidanceCueV1[];
    private status: GuidanceStatus = 'idle';
    private progressMeters = 0;
    private crossTrackMeters = 0;
    private currentSegmentIndex = 0;
    private lastAcceptedPosition: GuidancePosition | null = null;
    private lastProjectedPoint: RoutePoint | null = null;
    private goodSampleCount = 0;
    private offRouteSince: number | null = null;
    private recoverySince: number | null = null;
    private recoveredAt: number | null = null;
    private arrivalSince: number | null = null;
    private lastOffRouteAlertAt: number | null = null;

    constructor(
        private readonly route: GuidanceRouteInput,
        thresholds: Partial<GuidanceThresholds> = {}
    ) {
        if (route.geometry.length < 2) {
            throw new Error('Guidance requires at least two route points');
        }
        this.thresholds = { ...DEFAULT_GUIDANCE_THRESHOLDS, ...thresholds };
        this.geometry = route.geometry.map((point) => ({ ...point }));
        this.project = createProjector(this.geometry[0]);
        let cumulative = 0;
        this.segments = [];
        for (let index = 0; index < this.geometry.length - 1; index++) {
            const start = this.geometry[index];
            const end = this.geometry[index + 1];
            const lengthMeters = haversineMeters(start, end);
            this.segments.push({
                start,
                end,
                startXY: this.project(start),
                endXY: this.project(end),
                lengthMeters,
                cumulativeStartMeters: cumulative,
                bearing: bearingDegrees(start, end),
            });
            cumulative += lengthMeters;
        }
        this.totalMeters = cumulative;
        this.cues = [...(route.plan?.cues ?? [])].sort(
            (a, b) => a.progressMeters - b.progressMeters
        );
    }

    public start(now = Date.now()): GuidanceUpdate {
        this.status = 'acquiring';
        return this.createUpdate(now, [], false);
    }

    public pause(now = Date.now()): GuidanceUpdate {
        if (this.status !== 'idle' && this.status !== 'arrived') {
            this.status = 'paused';
        }
        return this.createUpdate(now, [], false);
    }

    public resume(now = Date.now()): GuidanceUpdate {
        if (this.status === 'paused') {
            this.status = 'acquiring';
            this.goodSampleCount = 0;
            this.offRouteSince = null;
            this.recoverySince = null;
        }
        return this.createUpdate(now, [], false);
    }

    public stop(now = Date.now()): GuidanceUpdate {
        this.status = 'idle';
        return this.createUpdate(now, [], false);
    }

    public tick(now = Date.now()): GuidanceUpdate {
        if (
            this.status !== 'idle' &&
            this.status !== 'paused' &&
            this.status !== 'arrived' &&
            (!this.lastAcceptedPosition ||
                now - this.lastAcceptedPosition.timestamp >
                    this.thresholds.stalePositionMs)
        ) {
            this.status = 'acquiring';
            this.goodSampleCount = 0;
            this.offRouteSince = null;
            this.recoverySince = null;
        }
        return this.createUpdate(now, [], false);
    }

    public update(
        position: GuidancePosition,
        now = Date.now()
    ): GuidanceUpdate {
        if (
            this.status === 'idle' ||
            this.status === 'paused' ||
            this.status === 'arrived'
        ) {
            return this.createUpdate(now, [], false);
        }

        const positionAgeMs = Math.max(0, now - position.timestamp);
        const accuracy = position.accuracyMeters;
        if (
            positionAgeMs > this.thresholds.stalePositionMs ||
            (accuracy !== null &&
                accuracy > this.thresholds.maximumAccuracyMeters)
        ) {
            this.status = 'acquiring';
            this.goodSampleCount = 0;
            this.offRouteSince = null;
            this.recoverySince = null;
            return this.createUpdate(now, [], false, position);
        }

        if (this.isImplausibleJump(position)) {
            this.status = 'acquiring';
            this.goodSampleCount = 0;
            this.offRouteSince = null;
            this.recoverySince = null;
            return this.createUpdate(now, [], false, position);
        }

        const candidate = this.selectProjection(position);
        this.lastAcceptedPosition = { ...position };
        this.lastProjectedPoint = candidate.projected;
        this.currentSegmentIndex = candidate.segmentIndex;
        this.crossTrackMeters = candidate.crossTrackMeters;
        this.progressMeters = Math.max(
            this.progressMeters,
            Math.min(this.totalMeters, candidate.progressMeters)
        );
        this.goodSampleCount += 1;

        const events: GuidanceUpdate['events'] = [];
        const offRouteThreshold = Math.max(
            this.thresholds.offRouteBaseMeters,
            this.thresholds.offRouteAccuracyFactor * (accuracy ?? 0)
        );
        const recoveryThreshold =
            offRouteThreshold * this.thresholds.recoveryThresholdRatio;
        const remaining = this.totalMeters - this.progressMeters;

        if (
            remaining <= this.thresholds.arrivalRadiusMeters &&
            candidate.crossTrackMeters <= offRouteThreshold
        ) {
            this.arrivalSince ??= now;
            if (now - this.arrivalSince >= this.thresholds.arrivalHoldMs) {
                this.status = 'arrived';
                this.progressMeters = this.totalMeters;
                events.push('arrived');
                return this.createUpdate(now, events, true);
            }
        } else {
            this.arrivalSince = null;
        }

        if (candidate.crossTrackMeters > offRouteThreshold) {
            this.offRouteSince ??= now;
            this.recoverySince = null;
            this.recoveredAt = null;
            if (now - this.offRouteSince >= this.thresholds.offRouteHoldMs) {
                this.status = 'offRoute';
                if (
                    this.lastOffRouteAlertAt === null ||
                    now - this.lastOffRouteAlertAt >=
                        this.thresholds.alertCooldownMs
                ) {
                    events.push('off-route');
                    this.lastOffRouteAlertAt = now;
                }
            }
        } else if (this.status === 'offRoute') {
            this.offRouteSince = null;
            if (candidate.crossTrackMeters <= recoveryThreshold) {
                this.recoverySince ??= now;
                if (
                    now - this.recoverySince >=
                    this.thresholds.recoveryHoldMs
                ) {
                    this.status = 'recovered';
                    this.recoveredAt = now;
                    this.recoverySince = null;
                    events.push('recovered');
                }
            } else {
                this.recoverySince = null;
            }
        } else {
            this.offRouteSince = null;
            this.recoverySince = null;
            if (
                this.status === 'recovered' &&
                this.recoveredAt !== null &&
                now - this.recoveredAt < this.thresholds.recoveryDisplayMs
            ) {
                // Keep the transient recovered state visible long enough to read.
            } else if (
                this.goodSampleCount >= this.thresholds.acquiringGoodSamples
            ) {
                this.status = 'onRoute';
                this.recoveredAt = null;
            } else {
                this.status = 'acquiring';
            }
        }

        return this.createUpdate(now, events, true);
    }

    public getSnapshot(now = Date.now()): GuidanceSnapshot {
        return this.createSnapshot(now);
    }

    public getTotalMeters(): number {
        return this.totalMeters;
    }

    private isImplausibleJump(position: GuidancePosition): boolean {
        if (!this.lastAcceptedPosition) return false;
        const elapsedMs =
            position.timestamp - this.lastAcceptedPosition.timestamp;
        if (elapsedMs <= 0) return true;
        const distance = haversineMeters(
            { ...this.lastAcceptedPosition, ele: 0 },
            { ...position, ele: 0 }
        );
        const allowed = Math.max(
            this.thresholds.gpsJumpBaseMeters,
            this.thresholds.maximumPlausibleSpeedMps * (elapsedMs / 1000) +
                (position.accuracyMeters ?? 0) +
                (this.lastAcceptedPosition.accuracyMeters ?? 0)
        );
        return distance > allowed;
    }

    private selectProjection(position: GuidancePosition): ProjectionCandidate {
        const point = { lat: position.lat, lon: position.lon, ele: 0 };
        if (!this.lastAcceptedPosition) {
            const candidates = this.segments.map((segment, index) =>
                projectOnSegment(point, segment, this.project, index)
            );
            const nearestDistance = Math.min(
                ...candidates.map((candidate) => candidate.crossTrackMeters)
            );
            return candidates
                .filter(
                    (candidate) =>
                        candidate.crossTrackMeters <= nearestDistance + 8
                )
                .sort((a, b) => a.progressMeters - b.progressMeters)[0];
        }

        const elapsedSeconds = Math.max(
            0,
            (position.timestamp - this.lastAcceptedPosition.timestamp) / 1000
        );
        const movementMeters = haversineMeters(
            { ...this.lastAcceptedPosition, ele: 0 },
            point
        );
        const predictedAdvance = Math.min(
            movementMeters,
            this.thresholds.maximumPlausibleSpeedMps * elapsedSeconds
        );
        const expectedProgress = Math.min(
            this.totalMeters,
            this.progressMeters + predictedAdvance
        );

        const scoreCandidate = (candidate: ProjectionCandidate): number => {
            const delta = candidate.progressMeters - expectedProgress;
            const outsideContinuity =
                delta < -this.thresholds.maximumBackwardMeters ||
                delta > this.thresholds.continuitySearchMeters;
            const continuityPenalty =
                Math.abs(delta) * (delta < 0 ? 0.8 : 0.28) +
                (outsideContinuity ? 500 : 0);
            const segmentPenalty =
                Math.abs(candidate.segmentIndex - this.currentSegmentIndex) *
                0.15;
            return (
                candidate.crossTrackMeters + continuityPenalty + segmentPenalty
            );
        };

        const lowerProgress = Math.max(
            0,
            expectedProgress - this.thresholds.maximumBackwardMeters
        );
        const upperProgress = Math.min(
            this.totalMeters,
            expectedProgress + this.thresholds.continuitySearchMeters
        );
        let best: ProjectionCandidate | null = null;
        let bestScore = Number.POSITIVE_INFINITY;
        for (let index = 0; index < this.segments.length; index++) {
            const segment = this.segments[index];
            const segmentEnd =
                segment.cumulativeStartMeters + segment.lengthMeters;
            if (
                segmentEnd < lowerProgress ||
                segment.cumulativeStartMeters > upperProgress
            ) {
                continue;
            }
            const candidate = projectOnSegment(
                point,
                segment,
                this.project,
                index
            );
            const score = scoreCandidate(candidate);
            if (score < bestScore) {
                best = candidate;
                bestScore = score;
            }
        }

        // Every excluded candidate receives the 500-point continuity penalty.
        // Below that bound the local result is therefore identical to a full scan.
        if (best && bestScore < 500) return best;

        best = null;
        bestScore = Number.POSITIVE_INFINITY;
        for (let index = 0; index < this.segments.length; index++) {
            const candidate = projectOnSegment(
                point,
                this.segments[index],
                this.project,
                index
            );
            const score = scoreCandidate(candidate);
            if (score < bestScore) {
                best = candidate;
                bestScore = score;
            }
        }
        return best!;
    }

    private pointAtProgress(progressMeters: number): RoutePoint {
        const target = Math.max(0, Math.min(this.totalMeters, progressMeters));
        const segment =
            this.segments.find(
                (candidate) =>
                    target <=
                    candidate.cumulativeStartMeters + candidate.lengthMeters
            ) ?? this.segments[this.segments.length - 1];
        const ratio =
            segment.lengthMeters > 0
                ? (target - segment.cumulativeStartMeters) /
                  segment.lengthMeters
                : 0;
        return interpolatePoint(segment.start, segment.end, ratio);
    }

    private nextCue(): GuidanceCueV1 | null {
        return (
            this.cues.find(
                (cue) =>
                    cue.progressMeters >=
                    this.progressMeters - this.thresholds.cuePassedMeters
            ) ?? null
        );
    }

    private createSnapshot(now: number): GuidanceSnapshot {
        const remainingMeters = Math.max(
            0,
            this.totalMeters - this.progressMeters
        );
        const paceKmh =
            Number.isFinite(this.route.plannedPaceKmh) &&
            this.route.plannedPaceKmh > 0
                ? this.route.plannedPaceKmh
                : 4;
        const eta =
            this.status === 'idle' || this.status === 'arrived'
                ? this.status === 'arrived'
                    ? new Date(now).toISOString()
                    : null
                : new Date(
                      now + (remainingMeters / (paceKmh * 1000)) * 3_600_000
                  ).toISOString();
        const nextCue = this.nextCue();
        const lookAhead = this.pointAtProgress(
            this.progressMeters + this.thresholds.lookAheadMeters
        );
        const bearing =
            this.status === 'offRoute' &&
            this.lastAcceptedPosition &&
            this.lastProjectedPoint
                ? bearingDegrees(
                      { ...this.lastAcceptedPosition, ele: 0 },
                      this.lastProjectedPoint
                  )
                : this.lastProjectedPoint
                  ? bearingDegrees(this.lastProjectedPoint, lookAhead)
                  : (this.segments[this.currentSegmentIndex]?.bearing ?? null);
        return {
            routeId: this.route.routeId,
            status: this.status,
            progressMeters: this.progressMeters,
            remainingMeters,
            crossTrackMeters: this.crossTrackMeters,
            eta,
            bearing: Number.isFinite(bearing) ? bearing : null,
            nextCue,
            distanceToNextCueMeters: nextCue
                ? Math.max(0, nextCue.progressMeters - this.progressMeters)
                : null,
            accuracyMeters: this.lastAcceptedPosition?.accuracyMeters ?? null,
            positionAgeMs: this.lastAcceptedPosition
                ? Math.max(0, now - this.lastAcceptedPosition.timestamp)
                : null,
            updatedAt: new Date(now).toISOString(),
        };
    }

    private createUpdate(
        now: number,
        events: GuidanceUpdate['events'],
        acceptedPosition: boolean,
        rejectedPosition?: GuidancePosition
    ): GuidanceUpdate {
        const snapshot = this.createSnapshot(now);
        if (rejectedPosition) {
            snapshot.accuracyMeters = rejectedPosition.accuracyMeters;
            snapshot.positionAgeMs = Math.max(
                0,
                now - rejectedPosition.timestamp
            );
        }
        return { snapshot, events, acceptedPosition };
    }
}

export const guidanceMath = {
    haversineMeters,
    bearingDegrees,
};
