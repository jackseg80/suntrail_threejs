import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { findStrongExposureSegments, type RouteSolarPoint } from './solarRoute';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('./state', () => ({
    state: {
        simDate: new Date('2024-06-21T12:00:00Z'),
        originTile: { x: 2126, y: 1462, z: 12 },
        RELIEF_EXAGGERATION: 1.0,
        routeWaypoints: [] as any[],
        gpxLayers: [] as any[],
        activeGPXLayerId: null as string | null,
        scene: null as THREE.Scene | null,
    },
    isProActive: vi.fn(() => false),
}));

vi.mock('./landcover', () => ({
    isLatLonInForest: vi.fn(() => false),
}));

vi.mock('./analysis', () => ({
    isAtShadow: vi.fn(() => false),
    drapeToTerrain: vi.fn((pts: any[]) =>
        pts.map(
            (_: any, i: number) => new THREE.Vector3(i * 1000, 500, i * 200)
        )
    ),
    getAltitudeAt: vi.fn(() => 500),
    GPX_SURFACE_OFFSET: 12,
}));

vi.mock('./geo', () => ({
    worldToLngLat: vi.fn((_x: number, _z: number) => ({ lat: 46.8, lon: 8.2 })),
    lngLatToWorld: vi.fn(),
    haversineDistance: vi.fn(
        (_lat1: number, _lon1: number, _lat2: number, _lon2: number) => 0.1
    ),
    EARTH_CIRCUMFERENCE: 40075016.68,
}));

vi.mock('./sun', () => ({
    getSunDirection: vi.fn(() => new THREE.Vector3(0, 1, 0)),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePoints(count: number, spacingKm = 0.1): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
        points.push(new THREE.Vector3(i * spacingKm * 1000, 200 + i * 10, 0));
    }
    return points;
}

// ── Import module under test ──────────────────────────────────────────────────

let sampleRoutePoints: typeof import('./solarRoute').sampleRoutePoints;
let buildRouteHash: typeof import('./solarRoute').buildRouteHash;
let makeCacheKey: typeof import('./solarRoute').makeCacheKey;
let buildAnalysis: typeof import('./solarRoute').buildAnalysis;
let invalidateRouteCache: typeof import('./solarRoute').invalidateRouteCache;
let getCurrentRouteSolarAnalysis: typeof import('./solarRoute').getCurrentRouteSolarAnalysis;
let setSolarRouteMode: typeof import('./solarRoute').setSolarRouteMode;
let getSolarRouteMode: typeof import('./solarRoute').getSolarRouteMode;
let setAvgSpeedKmh: typeof import('./solarRoute').setAvgSpeedKmh;
let getAvgSpeedKmh: typeof import('./solarRoute').getAvgSpeedKmh;
let clearSolarRouteAnalysis: typeof import('./solarRoute').clearSolarRouteAnalysis;
let getOptimalDepartureData: typeof import('./solarRoute').getOptimalDepartureData;

beforeEach(async () => {
    vi.useFakeTimers();
    const mod = await import('./solarRoute');
    sampleRoutePoints = mod.sampleRoutePoints;
    buildRouteHash = mod.buildRouteHash;
    makeCacheKey = mod.makeCacheKey;
    buildAnalysis = mod.buildAnalysis;
    invalidateRouteCache = mod.invalidateRouteCache;
    getCurrentRouteSolarAnalysis = mod.getCurrentRouteSolarAnalysis;
    setSolarRouteMode = mod.setSolarRouteMode;
    getSolarRouteMode = mod.getSolarRouteMode;
    setAvgSpeedKmh = mod.setAvgSpeedKmh;
    getAvgSpeedKmh = mod.getAvgSpeedKmh;
    clearSolarRouteAnalysis = mod.clearSolarRouteAnalysis;
    getOptimalDepartureData = mod.getOptimalDepartureData;
    // Reset state
    invalidateRouteCache();
    clearSolarRouteAnalysis();
    setSolarRouteMode('hikerTimeline');
    setAvgSpeedKmh(4);
});

afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
});

// ── Tests: sampleRoutePoints ──────────────────────────────────────────────────

describe('sampleRoutePoints', () => {
    it('returns empty array for empty input', () => {
        expect(sampleRoutePoints([])).toEqual([]);
    });

    it('returns all points for short routes (≤ MAX_POINTS)', () => {
        const pts = makePoints(5);
        const result = sampleRoutePoints(pts);
        expect(result.length).toBeLessThanOrEqual(5);
    });

    it('handles long routes without crashing', () => {
        const pts = makePoints(500);
        const result = sampleRoutePoints(pts);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toBe(pts[0]);
        expect(result[result.length - 1]).toBe(pts[pts.length - 1]);
    });

    it('preserves first and last point', () => {
        const pts = makePoints(300);
        const result = sampleRoutePoints(pts);
        expect(result[0]).toBe(pts[0]);
        expect(result[result.length - 1]).toBe(pts[pts.length - 1]);
    });

    it('produces roughly uniform spacing', () => {
        const pts = makePoints(400, 0.05);
        const result = sampleRoutePoints(pts);
        const deltas: number[] = [];
        for (let i = 1; i < result.length; i++) {
            const d = result[i].x - result[i - 1].x;
            deltas.push(Math.abs(d));
        }
        const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        for (const d of deltas) {
            expect(Math.abs(d - avgDelta)).toBeLessThan(avgDelta * 0.5);
        }
    });
});

// ── Tests: buildRouteHash ────────────────────────────────────────────────────

describe('buildRouteHash', () => {
    it('returns empty string for less than 2 points', () => {
        expect(buildRouteHash([])).toBe('');
        expect(buildRouteHash([new THREE.Vector3(0, 0, 0)])).toBe('');
    });

    it('returns stable hash for same points', () => {
        const pts = makePoints(10);
        const h1 = buildRouteHash(pts);
        const h2 = buildRouteHash(pts);
        expect(h1).toBe(h2);
    });

    it('returns different hash for different routes', () => {
        const pts1 = makePoints(10);
        const pts2 = makePoints(15);
        expect(buildRouteHash(pts1)).not.toBe(buildRouteHash(pts2));
    });
});

// ── Tests: makeCacheKey ──────────────────────────────────────────────────────

describe('makeCacheKey', () => {
    it('includes hash, date, slot, mode, speed', () => {
        const key = makeCacheKey(
            'abc',
            new Date('2024-06-21T12:30:00Z'),
            'snapshot',
            4
        );
        expect(key).toContain('abc');
        expect(key).toContain('2024-06-21');
        expect(key).toContain('snapshot');
        expect(key).toContain('40');
    });

    it('chagnes with different mode', () => {
        const k1 = makeCacheKey(
            'abc',
            new Date('2024-06-21T12:00:00Z'),
            'snapshot',
            4
        );
        const k2 = makeCacheKey(
            'abc',
            new Date('2024-06-21T12:00:00Z'),
            'hikerTimeline',
            4
        );
        expect(k1).not.toBe(k2);
    });

    it('bundles timestamps into 30-min slots', () => {
        const k1 = makeCacheKey(
            'abc',
            new Date('2024-06-21T12:05:00Z'),
            'snapshot',
            4
        );
        const k2 = makeCacheKey(
            'abc',
            new Date('2024-06-21T12:25:00Z'),
            'snapshot',
            4
        );
        expect(k1).toBe(k2);
    });

    it('changes slots after 30 minutes', () => {
        const k1 = makeCacheKey(
            'abc',
            new Date('2024-06-21T12:00:00Z'),
            'snapshot',
            4
        );
        const k2 = makeCacheKey(
            'abc',
            new Date('2024-06-21T12:35:00Z'),
            'snapshot',
            4
        );
        expect(k1).not.toBe(k2);
    });
});

// ── Tests: buildAnalysis ────────────────────────────────────────────────────

describe('buildAnalysis', () => {
    it('returns zero stats for empty points', () => {
        const result = buildAnalysis([], 'snapshot', false);
        expect(result.totalKm).toBe(0);
        expect(result.sunExposedKm).toBe(0);
        expect(result.shadowKm).toBe(0);
        expect(result.nightKm).toBe(0);
        expect(result.sunPct).toBe(0);
        expect(result.nightPct).toBe(0);
        expect(result.shadowSegments).toEqual([]);
        expect(result.terrainAvailable).toBe(false);
    });

    it('counts sun-exposed km correctly', () => {
        const points = [
            {
                worldPos: new THREE.Vector3(0, 0, 0),
                distKm: 0,
                evalDate: new Date(),
                inShadow: false,
                isNight: false,
                inForest: false,
            },
            {
                worldPos: new THREE.Vector3(1, 0, 0),
                distKm: 1,
                evalDate: new Date(),
                inShadow: false,
                isNight: false,
                inForest: false,
            },
            {
                worldPos: new THREE.Vector3(2, 0, 0),
                distKm: 2,
                evalDate: new Date(),
                inShadow: false,
                isNight: false,
                inForest: false,
            },
        ];
        const result = buildAnalysis(points, 'snapshot', true);
        expect(result.totalKm).toBe(2);
        expect(result.sunExposedKm).toBe(2);
        expect(result.shadowKm).toBe(0);
        expect(result.nightKm).toBe(0);
        expect(result.sunPct).toBe(100);
        expect(result.nightPct).toBe(0);
    });

    it('counts shadow km correctly', () => {
        const points = [
            {
                worldPos: new THREE.Vector3(0, 0, 0),
                distKm: 0,
                evalDate: new Date(),
                inShadow: true,
                isNight: false,
                inForest: false,
            },
            {
                worldPos: new THREE.Vector3(1, 0, 0),
                distKm: 3,
                evalDate: new Date(),
                inShadow: true,
                isNight: false,
                inForest: false,
            },
            {
                worldPos: new THREE.Vector3(2, 0, 0),
                distKm: 5,
                evalDate: new Date(),
                inShadow: false,
                isNight: false,
                inForest: false,
            },
        ];
        const result = buildAnalysis(points, 'snapshot', true);
        expect(result.totalKm).toBe(5);
        expect(result.shadowKm).toBe(3);
        expect(result.sunExposedKm).toBe(2);
    });

    it('calculates sunPct over total km (night segments included in denominator)', () => {
        // 2 km de nuit + 1 km de jour au soleil = 33% du total, pas 100%
        const points = [
            {
                worldPos: new THREE.Vector3(0, 0, 0),
                distKm: 0,
                evalDate: new Date(),
                inShadow: false,
                isNight: true,
                inForest: false,
            },
            {
                worldPos: new THREE.Vector3(1, 0, 0),
                distKm: 2,
                evalDate: new Date(),
                inShadow: false,
                isNight: true,
                inForest: false,
            },
            {
                worldPos: new THREE.Vector3(2, 0, 0),
                distKm: 3,
                evalDate: new Date(),
                inShadow: false,
                isNight: false,
                inForest: false,
            },
        ];
        const result = buildAnalysis(points, 'snapshot', true);
        expect(result.totalKm).toBe(3);
        expect(result.sunExposedKm).toBe(1);
        // 1 km soleil / 3 km total = 33%
        expect(result.sunPct).toBe(33);
    });

    it('returns 100% when fully sunny (no night)', () => {
        const points = [
            {
                worldPos: new THREE.Vector3(0, 0, 0),
                distKm: 0,
                evalDate: new Date(),
                inShadow: false,
                isNight: false,
                inForest: false,
            },
            {
                worldPos: new THREE.Vector3(1, 0, 0),
                distKm: 5,
                evalDate: new Date(),
                inShadow: false,
                isNight: false,
                inForest: false,
            },
        ];
        const result = buildAnalysis(points, 'snapshot', true);
        expect(result.sunPct).toBe(100);
    });

    it('returns 0% when fully in night', () => {
        const points = [
            {
                worldPos: new THREE.Vector3(0, 0, 0),
                distKm: 0,
                evalDate: new Date(),
                inShadow: false,
                isNight: true,
                inForest: false,
            },
            {
                worldPos: new THREE.Vector3(1, 0, 0),
                distKm: 5,
                evalDate: new Date(),
                inShadow: false,
                isNight: true,
                inForest: false,
            },
        ];
        const result = buildAnalysis(points, 'snapshot', true);
        expect(result.sunPct).toBe(0);
        expect(result.sunExposedKm).toBe(0);
        expect(result.nightKm).toBe(5);
        expect(result.nightPct).toBe(100);
        expect(result.shadowKm).toBe(0);
    });

    it('detects continuous shadow segments', () => {
        const points = [
            {
                worldPos: new THREE.Vector3(0, 0, 0),
                distKm: 0,
                evalDate: new Date(),
                inShadow: false,
                isNight: false,
                inForest: false,
            },
            {
                worldPos: new THREE.Vector3(1, 0, 0),
                distKm: 1,
                evalDate: new Date(),
                inShadow: true,
                isNight: false,
                inForest: false,
            },
            {
                worldPos: new THREE.Vector3(2, 0, 0),
                distKm: 3,
                evalDate: new Date(),
                inShadow: true,
                isNight: false,
                inForest: false,
            },
            {
                worldPos: new THREE.Vector3(3, 0, 0),
                distKm: 5,
                evalDate: new Date(),
                inShadow: false,
                isNight: false,
                inForest: false,
            },
        ];
        const result = buildAnalysis(points, 'snapshot', true);
        expect(result.shadowSegments).toHaveLength(1);
        expect(result.shadowSegments[0]).toEqual({
            startKm: 0,
            endKm: 3,
            lengthKm: 3,
        });
    });

    it('preserves mode in result', () => {
        const result = buildAnalysis([], 'hikerTimeline', false);
        expect(result.mode).toBe('hikerTimeline');
    });

    it('counts forest km separately from sun-exposed km', () => {
        const points = [
            {
                worldPos: new THREE.Vector3(0, 0, 0),
                distKm: 0,
                evalDate: new Date(),
                inShadow: false,
                isNight: false,
                inForest: false,
            },
            {
                worldPos: new THREE.Vector3(1, 0, 0),
                distKm: 2,
                evalDate: new Date(),
                inShadow: false,
                isNight: false,
                inForest: true,
            },
            {
                worldPos: new THREE.Vector3(2, 0, 0),
                distKm: 4,
                evalDate: new Date(),
                inShadow: false,
                isNight: false,
                inForest: false,
            },
        ];
        const result = buildAnalysis(points, 'snapshot', true);
        expect(result.forestKm).toBe(2);
        expect(result.sunExposedKm).toBe(2);
        expect(result.totalKm).toBe(4);
        expect(result.sunPct).toBe(50);
    });

    it('does not count forest km in sunExposedKm', () => {
        const points = [
            {
                worldPos: new THREE.Vector3(0, 0, 0),
                distKm: 0,
                evalDate: new Date(),
                inShadow: false,
                isNight: false,
                inForest: true,
            },
            {
                worldPos: new THREE.Vector3(1, 0, 0),
                distKm: 5,
                evalDate: new Date(),
                inShadow: false,
                isNight: false,
                inForest: true,
            },
        ];
        const result = buildAnalysis(points, 'snapshot', true);
        expect(result.forestKm).toBe(5);
        expect(result.sunExposedKm).toBe(0);
        expect(result.sunPct).toBe(0);
    });

    it('counts night km and computes nightPct', () => {
        // 3 km soleil + 2 km nuit = 5 km total, 40% nuit
        const points = [
            {
                worldPos: new THREE.Vector3(0, 0, 0),
                distKm: 0,
                evalDate: new Date(),
                inShadow: false,
                isNight: false,
                inForest: false,
            },
            {
                worldPos: new THREE.Vector3(1, 0, 0),
                distKm: 3,
                evalDate: new Date(),
                inShadow: false,
                isNight: false,
                inForest: false,
            },
            {
                worldPos: new THREE.Vector3(2, 0, 0),
                distKm: 5,
                evalDate: new Date(),
                inShadow: false,
                isNight: true,
                inForest: false,
            },
        ];
        const result = buildAnalysis(points, 'snapshot', true);
        expect(result.totalKm).toBe(5);
        expect(result.sunExposedKm).toBe(3);
        expect(result.nightKm).toBe(2);
        expect(result.nightPct).toBe(40);
        expect(result.sunPct).toBe(60);
    });
});

// ── Tests: cache management ──────────────────────────────────────────────────

describe('cache invalidation', () => {
    it('getCurrentRouteSolarAnalysis returns null initially', () => {
        expect(getCurrentRouteSolarAnalysis()).toBeNull();
    });

    it('getOptimalDepartureData returns null initially', () => {
        expect(getOptimalDepartureData()).toBeNull();
    });
});

// ── Tests: mode and speed setters ────────────────────────────────────────────

describe('setSolarRouteMode', () => {
    it('returns current mode when unchanged', () => {
        setSolarRouteMode('snapshot');
        expect(getSolarRouteMode()).toBe('snapshot');
        setSolarRouteMode('snapshot');
        expect(getSolarRouteMode()).toBe('snapshot');
    });

    it('changes mode', () => {
        setSolarRouteMode('snapshot');
        expect(getSolarRouteMode()).toBe('snapshot');
        setSolarRouteMode('hikerTimeline');
        expect(getSolarRouteMode()).toBe('hikerTimeline');
    });
});

describe('setAvgSpeedKmh', () => {
    it('returns default speed', () => {
        expect(getAvgSpeedKmh()).toBe(4);
    });

    it('updates speed', () => {
        setAvgSpeedKmh(6);
        expect(getAvgSpeedKmh()).toBe(6);
        setAvgSpeedKmh(3);
        expect(getAvgSpeedKmh()).toBe(3);
    });
});

// ── Tests: clearSolarRouteAnalysis ───────────────────────────────────────────

describe('clearSolarRouteAnalysis', () => {
    it('clears analysis and optimal data', () => {
        clearSolarRouteAnalysis();
        expect(getCurrentRouteSolarAnalysis()).toBeNull();
        expect(getOptimalDepartureData()).toBeNull();
    });
});

// ── Tests: findStrongExposureSegments ────────────────────────────────────────

function makePoint(
    overrides: Partial<RouteSolarPoint> & { distKm: number; hour: number }
): RouteSolarPoint {
    return {
        worldPos: new THREE.Vector3(0, 0, 0),
        distKm: overrides.distKm,
        evalDate: new Date(2024, 5, 21, overrides.hour, 0, 0), // heure locale
        inShadow: overrides.inShadow ?? false,
        isNight: overrides.isNight ?? false,
        inForest: overrides.inForest ?? false,
    };
}

describe('findStrongExposureSegments', () => {
    it('retourne vide pour un tableau vide', () => {
        expect(findStrongExposureSegments([])).toEqual([]);
    });

    it('retourne un segment quand 90+ min de plein soleil 10h-16h', () => {
        const points = [
            makePoint({ distKm: 0, hour: 10 }),
            makePoint({ distKm: 1, hour: 11 }),
            makePoint({ distKm: 2, hour: 12 }), // 120 min = 2h ≥ 90 min
        ];
        const segs = findStrongExposureSegments(points);
        expect(segs).toHaveLength(1);
        expect(segs[0].startKm).toBe(0);
        expect(segs[0].endKm).toBe(2);
        expect(segs[0].durationMin).toBe(120);
    });

    it('ignore les segments < 90 min', () => {
        const points = [
            makePoint({ distKm: 0, hour: 10 }),
            makePoint({ distKm: 0.5, hour: 11 }), // 60 min < 90
        ];
        expect(findStrongExposureSegments(points)).toEqual([]);
    });

    it('exclut les points de nuit', () => {
        const points = [
            makePoint({ distKm: 0, hour: 11, isNight: true }),
            makePoint({ distKm: 1, hour: 12, isNight: true }), // ≥ 90 min mais nuit
        ];
        expect(findStrongExposureSegments(points)).toEqual([]);
    });

    it("exclut les points dans l'ombre", () => {
        const points = [
            makePoint({ distKm: 0, hour: 11, inShadow: true }),
            makePoint({ distKm: 1, hour: 12, inShadow: true }),
        ];
        expect(findStrongExposureSegments(points)).toEqual([]);
    });

    it('exclut les points en forêt', () => {
        const points = [
            makePoint({ distKm: 0, hour: 11, inForest: true }),
            makePoint({ distKm: 1, hour: 12, inForest: true }),
        ];
        expect(findStrongExposureSegments(points)).toEqual([]);
    });

    it('exclut les heures avant 10h et après 16h', () => {
        const early = [
            makePoint({ distKm: 0, hour: 9 }),
            makePoint({ distKm: 1, hour: 10 }), // 60 min
        ];
        expect(findStrongExposureSegments(early)).toEqual([]);

        const late = [
            makePoint({ distKm: 0, hour: 15 }),
            makePoint({ distKm: 1, hour: 16 }), // heure=16 non incluse (h < 16)
        ];
        expect(findStrongExposureSegments(late)).toEqual([]);
    });

    it("détecte plusieurs segments séparés par une zone d'ombre", () => {
        const points = [
            makePoint({ distKm: 0, hour: 10 }),
            makePoint({ distKm: 1, hour: 11 }),
            makePoint({ distKm: 2, hour: 12 }), // fin segment 1 (120 min)
            makePoint({ distKm: 3, hour: 13, inShadow: true }), // zone d'ombre
            makePoint({ distKm: 4, hour: 14 }),
            makePoint({ distKm: 5, hour: 15 }),
            makePoint({ distKm: 6, hour: 16 }), // heure=16 non incluse, ferme segment 2 (120 min)
        ];
        const segs = findStrongExposureSegments(points);
        expect(segs).toHaveLength(2);
        expect(segs[0].startKm).toBe(0);
        expect(segs[0].endKm).toBe(3); // fermé au point d'ombre (km=3)
        expect(segs[1].startKm).toBe(4);
        expect(segs[1].endKm).toBe(6);
    });

    it('termine le segment au dernier point si toujours ensoleillé', () => {
        const points = [
            makePoint({ distKm: 0, hour: 10 }),
            makePoint({ distKm: 1, hour: 11 }),
            makePoint({ distKm: 2, hour: 12 }), // dernier point, ≥ 90 min
        ];
        expect(findStrongExposureSegments(points)).toHaveLength(1);
    });
});
