import { describe, expect, it } from 'vitest';
import {
    buildOutingDashboard,
    buildRecordingSummary,
    type RecordingSummary,
} from './outingDashboard';
import type { GuidanceSnapshot } from '../guidance/guidanceTypes';

const guidance: GuidanceSnapshot = {
    routeId: 'route-1',
    status: 'onRoute',
    progressMeters: 500,
    remainingMeters: 1_500,
    crossTrackMeters: 8,
    eta: '2026-08-20T12:00:00.000Z',
    bearing: 90,
    nextCue: {
        id: 'cue-1',
        kind: 'right',
        progressMeters: 600,
        label: 'Tourner à droite',
        source: 'ors',
        confidence: 'routed',
    },
    distanceToNextCueMeters: 100,
    accuracyMeters: 5,
    positionAgeMs: 1_000,
    updatedAt: '2026-08-20T10:00:00.000Z',
};

const completed: RecordingSummary = {
    name: 'Sortie test',
    durationSeconds: 1_800,
    distanceKm: 2,
    averagePaceSecondsPerKm: 900,
    ascentMeters: 120,
    descentMeters: 80,
    altitudeMeters: 1_500,
    gpsAccuracyMeters: 7,
    pointCount: 3,
};

const base = {
    now: 10_000,
    isRecording: false,
    recordingStartTime: null,
    recordedPoints: [],
    activeRoute: null,
    guidanceSnapshot: null,
    userAltitudeMeters: null,
    gpsAccuracyMeters: null,
    completedRecording: null,
};

describe('outingDashboard', () => {
    it('détermine les six états sans coupler REC et Guidance', () => {
        expect(buildOutingDashboard(base).phase).toBe('rest');
        expect(
            buildOutingDashboard({
                ...base,
                activeRoute: {
                    id: 'route-1',
                    name: 'Route',
                    distanceKm: 2,
                    ascentMeters: 100,
                    descentMeters: 90,
                },
            }).phase
        ).toBe('route');
        expect(
            buildOutingDashboard({ ...base, guidanceSnapshot: guidance }).phase
        ).toBe('guidance');
        expect(buildOutingDashboard({ ...base, isRecording: true }).phase).toBe(
            'recording'
        );
        expect(
            buildOutingDashboard({
                ...base,
                isRecording: true,
                guidanceSnapshot: guidance,
            }).phase
        ).toBe('combined');
        expect(
            buildOutingDashboard({
                ...base,
                completedRecording: completed,
            }).phase
        ).toBe('completed');
    });

    it('donne la priorité au REC sur une route consultée', () => {
        const model = buildOutingDashboard({
            ...base,
            isRecording: true,
            activeRoute: {
                id: 'route-1',
                name: 'Référence',
                distanceKm: 99,
                ascentMeters: 999,
                descentMeters: 999,
            },
            recordedPoints: [
                { lat: 46, lon: 7, alt: 1_000, timestamp: 1_000 },
                { lat: 46.01, lon: 7.01, alt: 1_100, timestamp: 4_000 },
            ],
        });

        expect(model.phase).toBe('recording');
        expect(model.recording?.distanceKm).toBeLessThan(99);
        expect(model.route?.name).toBe('Référence');
    });

    it('calcule durée réelle, allure, altitude, D+ et D− depuis recordedPoints', () => {
        const summary = buildRecordingSummary(
            [
                { lat: 46, lon: 7, alt: 1_000, timestamp: 1_000 },
                { lat: 46.01, lon: 7.01, alt: 1_020, timestamp: 31_000 },
                { lat: 46.02, lon: 7.02, alt: 1_010, timestamp: 61_000 },
            ],
            {
                now: 61_000,
                recordingStartTime: 1_000,
                userAltitudeMeters: 900,
                gpsAccuracyMeters: 6,
            }
        );

        expect(summary.durationSeconds).toBe(60);
        expect(summary.distanceKm).toBeGreaterThan(2);
        expect(summary.averagePaceSecondsPerKm).toBeGreaterThan(0);
        expect(summary.ascentMeters).toBe(20);
        expect(summary.descentMeters).toBe(10);
        expect(summary.altitudeMeters).toBe(1_010);
        expect(summary.gpsAccuracyMeters).toBe(6);
    });
});
