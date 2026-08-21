import { calculateTrackStats } from '../geoStats';
import type { LocationPoint } from '../geo';
import type { GuidanceSnapshot } from '../guidance/guidanceTypes';

export type OutingDashboardPhase =
    'rest' | 'route' | 'guidance' | 'recording' | 'combined' | 'completed';

export interface OutingRouteSummary {
    id: string;
    name: string;
    distanceKm: number;
    ascentMeters: number;
    descentMeters: number;
}

export interface RecordingSummary {
    name: string;
    durationSeconds: number;
    distanceKm: number;
    averagePaceSecondsPerKm: number | null;
    ascentMeters: number;
    descentMeters: number;
    altitudeMeters: number | null;
    gpsAccuracyMeters: number | null;
    pointCount: number;
}

export interface OutingDashboardInput {
    now: number;
    isRecording: boolean;
    recordingStartTime: number | null;
    recordedPoints: LocationPoint[];
    activeRoute: OutingRouteSummary | null;
    guidanceSnapshot: GuidanceSnapshot | null;
    userAltitudeMeters: number | null;
    gpsAccuracyMeters: number | null;
    completedRecording: RecordingSummary | null;
}

export interface OutingDashboardModel {
    phase: OutingDashboardPhase;
    route: OutingRouteSummary | null;
    guidance: GuidanceSnapshot | null;
    recording: RecordingSummary | null;
    completedRecording: RecordingSummary | null;
}

export function buildRecordingSummary(
    points: LocationPoint[],
    options: {
        name?: string;
        now: number;
        recordingStartTime: number | null;
        userAltitudeMeters: number | null;
        gpsAccuracyMeters: number | null;
    }
): RecordingSummary {
    const stats = calculateTrackStats(points);
    const firstTimestamp = points[0]?.timestamp ?? options.now;
    const startedAt = options.recordingStartTime ?? firstTimestamp;
    const durationSeconds = Math.max(
        0,
        Math.floor((options.now - startedAt) / 1000)
    );
    const averagePaceSecondsPerKm =
        stats.distance > 0 && durationSeconds > 0
            ? durationSeconds / stats.distance
            : null;

    return {
        name: options.name ?? '',
        durationSeconds,
        distanceKm: stats.distance,
        averagePaceSecondsPerKm,
        ascentMeters: stats.dPlus,
        descentMeters: stats.dMinus,
        altitudeMeters:
            points.at(-1)?.alt ?? options.userAltitudeMeters ?? null,
        gpsAccuracyMeters: options.gpsAccuracyMeters,
        pointCount: points.length,
    };
}

export function buildOutingDashboard(
    input: OutingDashboardInput
): OutingDashboardModel {
    const guidance =
        input.guidanceSnapshot?.status === 'idle'
            ? null
            : input.guidanceSnapshot;
    const recording = input.isRecording
        ? buildRecordingSummary(input.recordedPoints, {
              now: input.now,
              recordingStartTime: input.recordingStartTime,
              userAltitudeMeters: input.userAltitudeMeters,
              gpsAccuracyMeters: input.gpsAccuracyMeters,
          })
        : null;

    let phase: OutingDashboardPhase;
    if (recording && guidance) phase = 'combined';
    else if (recording) phase = 'recording';
    else if (guidance) phase = 'guidance';
    else if (input.completedRecording) phase = 'completed';
    else if (input.activeRoute) phase = 'route';
    else phase = 'rest';

    return {
        phase,
        route: input.activeRoute,
        guidance,
        recording,
        completedRecording: input.completedRecording,
    };
}
