import { describe, expect, it } from 'vitest';
import {
    createPreparedRouteFromComputation,
    emptyCoverage,
    unknownDifficulty,
    type PreparedRouteV1,
} from '../preparedRoutes/preparedRoute';
import { buildRouteReadinessReport } from './routeReadiness';

const NOW = '2026-08-13T10:00:00.000Z';

function route(overrides: Partial<PreparedRouteV1> = {}): PreparedRouteV1 {
    const base = createPreparedRouteFromComputation({
        id: 'route-readiness-1',
        name: 'Tour test',
        activityProfile: 'foot-hiking',
        waypoints: [
            { lat: 46.8, lon: 7.1 },
            { lat: 46.9, lon: 7.2 },
        ],
        computation: {
            name: 'Tour test',
            geometry: [
                { lat: 46.8, lon: 7.1, ele: 900 },
                { lat: 46.9, lon: 7.2, ele: 1200 },
            ],
            distance: 8,
            duration: 150,
            ascent: 600,
            descent: 600,
            routingSource: 'gpx',
            guidanceQuality: 'full',
            technicalDifficulty: unknownDifficulty('gpx', 'gpx-no-difficulty'),
            dataCoverage: emptyCoverage(),
        },
        plannedStartAt: null,
        plannedPaceKmh: 4,
        now: '2026-08-12T08:00:00.000Z',
    });
    return { ...base, ...overrides };
}

describe('buildRouteReadinessReport', () => {
    it('produit un noyau local identique avec une horloge fixée', () => {
        const first = buildRouteReadinessReport(route(), { now: NOW });
        const second = buildRouteReadinessReport(route(), { now: NOW });

        expect(first).toEqual(second);
        expect(first).toMatchObject({
            schemaVersion: 1,
            routeId: 'route-readiness-1',
            computedAt: NOW,
            sections: {
                route: {
                    status: 'available',
                    source: 'prepared-route-v1',
                },
                light: { status: 'unknown' },
                offline: { status: 'unknown', data: null },
                conditions: { status: 'unknown', data: null },
                device: { status: 'unknown', data: null },
            },
        });
        expect(first.sections.route.signals).toContainEqual({
            code: 'readiness.route.difficulty-unknown',
            severity: 'warning',
        });
    });

    it('ne transforme pas un départ absent ni une couverture non mesurée en état sûr', () => {
        const report = buildRouteReadinessReport(route(), { now: NOW });

        expect(report.sections.light.signals[0]?.code).toBe(
            'readiness.light.start-time-missing'
        );
        expect(report.sections.offline.signals[0]?.code).toBe(
            'readiness.offline.not-measured'
        );
    });

    it('signale une arrivée après la nuit comme critique', () => {
        const base = route();
        const report = buildRouteReadinessReport(
            route({
                plannedStartAt: '2026-08-13T16:00:00.000Z',
                stats: {
                    ...base.stats,
                    light: {
                        status: 'after-dark',
                        etaAt: '2026-08-13T20:00:00.000Z',
                        sunsetAt: '2026-08-13T18:45:00.000Z',
                        daylightMarginMinutes: -75,
                    },
                },
            }),
            { now: NOW }
        );

        expect(report.sections.light.status).toBe('available');
        expect(report.sections.light.signals).toContainEqual({
            code: 'readiness.light.after-dark',
            severity: 'critical',
        });
    });

    it('marque une preuve optionnelle périmée sans perdre ses données', () => {
        const report = buildRouteReadinessReport(route(), {
            now: NOW,
            offline: {
                kind: 'evidence',
                evidence: {
                    source: 'corridor-index-v1',
                    observedAt: '2026-08-13T08:00:00.000Z',
                    staleAfterMs: 60 * 60 * 1000,
                    data: {
                        coveragePercent: 80,
                        coveredTileCount: 80,
                        requiredTileCount: 100,
                        sizeBytes: 12_000_000,
                        corridorId: 'corridor-1',
                    },
                },
            },
        });

        expect(report.sections.offline.status).toBe('stale');
        expect(report.sections.offline.data?.coveragePercent).toBe(80);
        expect(report.sections.offline.signals).toContainEqual({
            code: 'readiness.stale',
            severity: 'warning',
        });
    });

    it('rejette une couverture incohérente au lieu de la présenter comme mesurée', () => {
        const report = buildRouteReadinessReport(route(), {
            now: NOW,
            offline: {
                kind: 'evidence',
                evidence: {
                    source: 'corridor-index-v1',
                    observedAt: NOW,
                    staleAfterMs: 60 * 60 * 1000,
                    data: {
                        coveragePercent: 100,
                        coveredTileCount: 80,
                        requiredTileCount: 100,
                        sizeBytes: 12_000_000,
                        corridorId: 'corridor-1',
                    },
                },
            },
        });

        expect(report.sections.offline).toMatchObject({
            status: 'error',
            data: null,
            signals: [
                {
                    code: 'readiness.offline.invalid-measurement',
                    severity: 'warning',
                },
            ],
        });
    });

    it('conserve une erreur d’enrichissement isolée du noyau local', () => {
        const report = buildRouteReadinessReport(route(), {
            now: NOW,
            conditions: {
                kind: 'error',
                failure: {
                    source: 'open-meteo',
                    observedAt: NOW,
                    errorCode: 'readiness.conditions.network-error',
                },
            },
        });

        expect(report.sections.route.status).toBe('available');
        expect(report.sections.conditions).toMatchObject({
            status: 'error',
            source: 'open-meteo',
            data: null,
        });
    });
});
