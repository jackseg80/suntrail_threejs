import { describe, expect, it } from 'vitest';
import {
    computeEffort,
    computeLightSummary,
    computePlannedDurationMinutes,
    convertLegacyHistoryEntry,
    createPreparedRouteFromComputation,
    createPreparedRouteFromGPXLayer,
    emptyCoverage,
    unknownDifficulty,
    validatePreparedRoute,
    type RouteComputationSnapshot,
} from './preparedRoute';

const computation: RouteComputationSnapshot = {
    name: 'A → B',
    geometry: [
        { lat: 46.5, lon: 7.5, ele: 1000 },
        { lat: 46.55, lon: 7.55, ele: 1400 },
    ],
    distance: 10,
    duration: 150,
    ascent: 600,
    descent: 200,
    routingSource: 'ors',
    guidanceQuality: 'full',
    technicalDifficulty: {
        status: 'known',
        source: 'ors',
        sacLevel: 2,
        coveragePercent: 100,
        reason: 'complete',
    },
    dataCoverage: {
        trailDifficulty: 100,
        steepness: 100,
        surface: 80,
        wayType: 100,
    },
};

describe('PreparedRouteV1', () => {
    it('creates the exact local domain without sync or cloud state', () => {
        const route = createPreparedRouteFromComputation({
            id: 'route-1',
            name: 'Tour test',
            activityProfile: 'foot-hiking',
            loopEnabled: true,
            waypoints: [
                { lat: 46.5, lon: 7.5, name: 'A' },
                { lat: 46.55, lon: 7.55, name: 'B' },
            ],
            computation,
            plannedStartAt: '2026-06-21T08:00:00.000Z',
            plannedPaceKmh: 4,
            now: '2026-08-09T10:00:00.000Z',
        });

        expect(route.schemaVersion).toBe(1);
        expect(route.geometry).toEqual(computation.geometry);
        expect(route.stats.duration).toBe(210);
        expect(route.stats.light.etaAt).toBeTruthy();
        expect(route.guidanceQuality).toBe('full');
        expect(route.loopEnabled).toBe(true);
        expect(route).not.toHaveProperty('syncState');
        expect(route).not.toHaveProperty('remoteRevision');
        expect(route).not.toHaveProperty('tombstone');
        expect(validatePreparedRoute(route)).toBe(route);
    });

    it('keeps early v5.83 records compatible by defaulting the loop to false', () => {
        const route = createPreparedRouteFromComputation({
            name: 'Compatibilité locale',
            activityProfile: 'foot-hiking',
            waypoints: [],
            computation,
            plannedStartAt: null,
            plannedPaceKmh: 4,
        });
        const { loopEnabled: _loopEnabled, ...earlyRecord } = route;
        expect(validatePreparedRoute(earlyRecord).loopEnabled).toBe(false);
    });

    it('rejects malformed or unsupported records', () => {
        expect(() => validatePreparedRoute({ schemaVersion: 2 })).toThrow(
            /schemaVersion/
        );
        expect(() =>
            validatePreparedRoute({
                ...createPreparedRouteFromComputation({
                    name: 'Invalid',
                    activityProfile: 'foot-hiking',
                    waypoints: [],
                    computation,
                    plannedStartAt: null,
                    plannedPaceKmh: 4,
                }),
                plannedPaceKmh: 0,
            })
        ).toThrow(/pace/);

        const valid = createPreparedRouteFromComputation({
            name: 'Nested validation',
            activityProfile: 'foot-hiking',
            waypoints: [],
            computation,
            plannedStartAt: null,
            plannedPaceKmh: 4,
        });
        expect(() =>
            validatePreparedRoute({
                ...valid,
                stats: {
                    ...valid.stats,
                    light: { ...valid.stats.light, etaAt: 42 },
                },
            })
        ).toThrow(/statistics/);
        expect(() =>
            validatePreparedRoute({
                ...valid,
                stats: {
                    ...valid.stats,
                    technicalDifficulty: {
                        ...valid.stats.technicalDifficulty,
                        reason: 'invented',
                    },
                },
            })
        ).toThrow(/statistics/);
    });

    it('keeps legacy conversion explicit and approximate', () => {
        const legacy = convertLegacyHistoryEntry(
            {
                id: 'legacy-1',
                name: 'Ancienne trace',
                color: '#f00',
                source: 'import',
                timestamp: 1,
                stats: {
                    distance: 8,
                    dPlus: 450,
                    dMinus: 430,
                    pointCount: 500,
                    estimatedTime: 120,
                },
                simplifiedPoints: [
                    { lat: 46.5, lon: 7.5, ele: 1000 },
                    { lat: 46.6, lon: 7.6, ele: 1450 },
                ],
                centerLat: 46.55,
                centerLon: 7.55,
                bounds: {
                    minLat: 46.5,
                    maxLat: 46.6,
                    minLon: 7.5,
                    maxLon: 7.6,
                },
            },
            { now: '2026-08-09T10:00:00.000Z' }
        );

        expect(legacy.source).toBe('legacy-conversion');
        expect(legacy.guidanceQuality).toBe('approximate');
        expect(legacy.stats.technicalDifficulty).toEqual(
            unknownDifficulty('legacy', 'legacy-simplified')
        );
        expect(legacy.geometry).toHaveLength(2);
    });

    it('keeps the complete GPX geometry and exposes useful anchors for a loop', () => {
        const points = [
            { lat: 46.5, lon: 7.5, ele: 1000 },
            { lat: 46.51, lon: 7.52, ele: 1100 },
            { lat: 46.49, lon: 7.53, ele: 1200 },
            { lat: 46.48, lon: 7.51, ele: 1050 },
            { lat: 46.5, lon: 7.5, ele: 1000 },
        ];
        const route = createPreparedRouteFromGPXLayer({
            id: 'gpx-loop',
            name: 'Boucle GPX',
            color: '#fff',
            visible: true,
            rawData: { tracks: [{ points }] },
            points: [],
            mesh: null,
            stats: {
                distance: 8,
                dPlus: 300,
                dMinus: 300,
                pointCount: points.length,
                estimatedTime: 120,
            },
        });

        expect(route.geometry).toEqual(points);
        expect(route.stats.pointCount).toBe(points.length);
        expect(route.loopEnabled).toBe(true);
        expect(route.waypoints).toHaveLength(4);
        expect(route.waypoints[0]).toEqual({
            lat: points[0].lat,
            lon: points[0].lon,
            alt: points[0].ele,
        });
        expect(route.waypoints[1]).not.toMatchObject({
            lat: points[0].lat,
            lon: points[0].lon,
        });
        expect(route.waypoints[2]).not.toMatchObject({
            lat: points[0].lat,
            lon: points[0].lon,
        });
        expect(route.waypoints[3]).toEqual({
            lat: points[points.length - 1].lat,
            lon: points[points.length - 1].lon,
            alt: points[points.length - 1].ele,
        });
        expect(route.stats.technicalDifficulty).toEqual(
            unknownDifficulty('gpx', 'gpx-no-difficulty')
        );

        const earlyGPXRoute = {
            ...route,
            loopEnabled: false,
            waypoints: [route.waypoints[0], route.waypoints[3]],
        };
        const migrated = validatePreparedRoute(earlyGPXRoute);
        expect(migrated).not.toBe(earlyGPXRoute);
        expect(migrated.loopEnabled).toBe(true);
        expect(migrated.waypoints).toHaveLength(4);
        expect(earlyGPXRoute.waypoints).toHaveLength(2);
        expect(migrated.geometry).toEqual(route.geometry);
    });
});

describe('prepared route metrics', () => {
    it('keeps effort, ETA and light independent from technical difficulty', () => {
        const duration = computePlannedDurationMinutes(12, 600, 4);
        const effort = computeEffort(12, 600, duration);
        const light = computeLightSummary(
            computation.geometry,
            '2026-06-21T08:00:00.000Z',
            duration
        );

        expect(duration).toBe(240);
        expect(effort.score).toBeGreaterThan(0);
        expect(light.etaAt).toBe('2026-06-21T12:00:00.000Z');
        expect(light.daylightMarginMinutes).not.toBeNull();
        expect(emptyCoverage()).toEqual({
            trailDifficulty: 0,
            steepness: 0,
            surface: 0,
            wayType: 0,
        });
    });
});
