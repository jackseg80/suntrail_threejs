import { describe, expect, it } from 'vitest';
import type { PreparedRouteV1 } from '../preparedRoutes/preparedRoute';
import {
    GUIDANCE_PLAN_THRESHOLDS,
    buildGuidancePlan,
    computeGeometryFingerprint,
    cuesFromORSSteps,
    cuesFromOSRMSteps,
    isGuidancePlanCurrent,
} from './guidancePlan';

function route(geometry: PreparedRouteV1['geometry']): PreparedRouteV1 {
    return {
        schemaVersion: 1,
        id: 'route-1',
        name: 'Fixture',
        source: 'gpx-import',
        activityProfile: 'foot-hiking',
        loopEnabled: false,
        waypoints: [
            { ...geometry[0], alt: geometry[0].ele, name: 'Départ' },
            {
                ...geometry.at(-1)!,
                alt: geometry.at(-1)!.ele,
                name: 'Arrivée',
            },
        ],
        geometry,
        stats: {
            distance: 1,
            ascent: 0,
            descent: 0,
            duration: 15,
            routingDuration: 15,
            pointCount: geometry.length,
            technicalDifficulty: {
                status: 'unknown',
                source: 'gpx',
                sacLevel: null,
                coveragePercent: 0,
                reason: 'gpx-no-difficulty',
            },
            dataCoverage: {
                trailDifficulty: 0,
                steepness: 0,
                surface: 0,
                wayType: 0,
            },
            effort: {
                level: 'easy',
                score: 1,
                method: 'distance-dplus-duration-v1',
            },
            light: {
                status: 'unknown',
                etaAt: null,
                sunsetAt: null,
                daylightMarginMinutes: null,
            },
        },
        bounds: {
            minLat: Math.min(...geometry.map((point) => point.lat)),
            maxLat: Math.max(...geometry.map((point) => point.lat)),
            minLon: Math.min(...geometry.map((point) => point.lon)),
            maxLon: Math.max(...geometry.map((point) => point.lon)),
        },
        plannedStartAt: null,
        plannedPaceKmh: 4,
        favorite: false,
        notes: '',
        tags: [],
        guidanceQuality: 'full',
        createdAt: '2026-08-11T00:00:00.000Z',
        updatedAt: '2026-08-11T00:00:00.000Z',
    };
}

describe('GuidancePlanV1', () => {
    const geometry = [
        { lat: 46, lon: 7, ele: 500 },
        { lat: 46, lon: 7.001, ele: 500 },
        { lat: 46.001, lon: 7.001, ele: 500 },
    ];

    it('keeps ORS instructions with canonical confidence and progress', () => {
        const cues = cuesFromORSSteps(
            [
                {
                    distance: 50,
                    type: 1,
                    instruction: 'Tournez à droite',
                    way_points: [1, 2],
                },
            ],
            geometry
        );
        expect(cues[0]).toMatchObject({
            kind: 'right',
            source: 'ors',
            confidence: 'routed',
            label: 'Tournez à droite',
        });
        expect(cues[0].progressMeters).toBeGreaterThan(70);
    });

    it('accepts OSRM steps as routed fallback', () => {
        const cues = cuesFromOSRMSteps(
            [
                {
                    distance: 50,
                    name: 'Sentier',
                    maneuver: {
                        type: 'turn',
                        modifier: 'left',
                        location: [7.001, 46],
                    },
                },
            ],
            geometry
        );
        expect(cues[0]).toMatchObject({
            kind: 'left',
            source: 'osrm',
            confidence: 'routed',
            label: 'Sentier',
        });
    });

    it('associates only named GPX points close to the track', () => {
        const prepared = route(geometry);
        const plan = buildGuidancePlan(prepared, {
            namedWaypoints: [
                { lat: 46, lon: 7.0005, name: 'Cabane' },
                { lat: 46.02, lon: 7.02, name: 'Trop loin' },
            ],
            now: '2026-08-11T00:00:00.000Z',
        });
        expect(plan.cues.some((cue) => cue.label === 'Cabane')).toBe(true);
        expect(plan.cues.some((cue) => cue.label === 'Trop loin')).toBe(false);
    });

    it('marks geometric turns as derived and suppresses hairpins', () => {
        const rightAnglePlan = buildGuidancePlan(route(geometry));
        expect(
            rightAnglePlan.cues.some(
                (cue) =>
                    cue.source === 'geometry-derived' &&
                    cue.confidence === 'derived'
            )
        ).toBe(true);
        const hairpin = route([
            { lat: 46, lon: 7, ele: 500 },
            { lat: 46, lon: 7.001, ele: 500 },
            { lat: 46.00002, lon: 7, ele: 510 },
        ]);
        expect(
            buildGuidancePlan(hairpin).cues.some(
                (cue) => cue.source === 'geometry-derived'
            )
        ).toBe(false);
        expect(GUIDANCE_PLAN_THRESHOLDS.derivedMaxAngleDegrees).toBe(120);
    });

    it('invalidates a plan after a geometry change', () => {
        const prepared = route(geometry);
        const plan = buildGuidancePlan(prepared);
        expect(isGuidancePlanCurrent(plan, prepared)).toBe(true);
        expect(
            isGuidancePlanCurrent(plan, {
                ...prepared,
                geometry: [
                    ...prepared.geometry,
                    { lat: 46.002, lon: 7.001, ele: 500 },
                ],
            })
        ).toBe(false);
        expect(computeGeometryFingerprint(geometry)).toMatch(/^fnv1a-/);
    });
});
