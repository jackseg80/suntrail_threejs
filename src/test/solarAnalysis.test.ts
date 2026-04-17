/**
 * solarAnalysis.test.ts — Tests unitaires pour l'analyse solaire enrichie (v5.12)
 *
 * Teste runSolarProbe() avec des coordonnées suisses (lat: 46.8, lon: 8.2)
 * et vérifie toutes les nouvelles données retournées.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock terrain (activeTiles) — empty map, no elevation data
vi.mock('../modules/terrain', () => ({
    activeTiles: new Map(),
}));

// Mock state with Swiss coordinates
vi.mock('../modules/state', () => ({
    state: {
        simDate: new Date('2024-06-21T12:00:00Z'),
        originTile: { x: 2126, y: 1462, z: 12 },
        RELIEF_EXAGGERATION: 1.0,
        hasLastClicked: false,
        lastClickedCoords: { x: 0, z: 0, alt: 0 },
        controls: null,
        isPro: false,
        isFlyingTo: false,
    },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Computes world coords from Swiss lat/lon (46.8, 8.2) relative to the mock originTile.
 * This mirrors lngLatToWorld() from geo.ts.
 */
function swissWorldCoords(): { x: number; z: number } {
    const EARTH_CIRC = 40075016.68;
    const lat = 46.8;
    const lon = 8.2;
    const originTile = { x: 2126, y: 1462, z: 12 };

    const xNorm = (lon + 180) / 360;
    const yNorm =
        (1 -
            Math.log(
                Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180),
            ) /
                Math.PI) /
        2;

    const originUnit = 1.0 / Math.pow(2, originTile.z);
    const oxNorm = (originTile.x + 0.5) * originUnit;
    const oyNorm = (originTile.y + 0.5) * originUnit;

    return {
        x: (xNorm - oxNorm) * EARTH_CIRC,
        z: (yNorm - oyNorm) * EARTH_CIRC,
    };
}

// ── Import module under test (after mocks are registered) ─────────────────────

let runSolarProbe: typeof import('../modules/analysis').runSolarProbe;
let getMoonPhaseName: typeof import('../modules/analysis').getMoonPhaseName;

beforeAll(async () => {
    const mod = await import('../modules/analysis');
    runSolarProbe = mod.runSolarProbe;
    getMoonPhaseName = mod.getMoonPhaseName;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runSolarProbe — Swiss coordinates (lat:46.8, lon:8.2)', () => {
    const { x, z } = swissWorldCoords();
    const altitude = 500; // meters

    it('1. retourne un objet non-null', () => {
        const result = runSolarProbe(x, z, altitude);
        expect(result).not.toBeNull();
    });

    it('2. sunrise et sunset sont des dates valides', () => {
        const result = runSolarProbe(x, z, altitude)!;
        expect(result.sunrise).toBeInstanceOf(Date);
        expect(result.sunset).toBeInstanceOf(Date);
        expect(isNaN(result.sunrise!.getTime())).toBe(false);
        expect(isNaN(result.sunset!.getTime())).toBe(false);
    });

    it('3. sunrise < solarNoon < sunset', () => {
        const result = runSolarProbe(x, z, altitude)!;
        expect(result.sunrise).not.toBeNull();
        expect(result.solarNoon).not.toBeNull();
        expect(result.sunset).not.toBeNull();
        expect(result.sunrise!.getTime()).toBeLessThan(result.solarNoon!.getTime());
        expect(result.solarNoon!.getTime()).toBeLessThan(result.sunset!.getTime());
    });

    it('4. dayDurationMinutes ≈ sunset − sunrise en minutes (±30 min)', () => {
        const result = runSolarProbe(x, z, altitude)!;
        const expectedMinutes = Math.round(
            (result.sunset!.getTime() - result.sunrise!.getTime()) / 60000,
        );
        expect(Math.abs(result.dayDurationMinutes - expectedMinutes)).toBeLessThanOrEqual(30);
    });

    it('5. elevationCurve a exactement 144 éléments', () => {
        const result = runSolarProbe(x, z, altitude)!;
        expect(result.elevationCurve).toHaveLength(144);
    });

    it('6. elevationCurve — tous les éléments sont des nombres', () => {
        const result = runSolarProbe(x, z, altitude)!;
        result.elevationCurve.forEach((val) => {
            expect(typeof val).toBe('number');
            expect(isNaN(val)).toBe(false);
        });
    });

    it('7. currentElevationDeg est entre -90 et 90', () => {
        const result = runSolarProbe(x, z, altitude)!;
        expect(result.currentElevationDeg).toBeGreaterThanOrEqual(-90);
        expect(result.currentElevationDeg).toBeLessThanOrEqual(90);
    });

    it('8. currentAzimuthDeg est entre 0 et 360', () => {
        const result = runSolarProbe(x, z, altitude)!;
        expect(result.currentAzimuthDeg).toBeGreaterThanOrEqual(0);
        expect(result.currentAzimuthDeg).toBeLessThan(360);
    });

    it('9. moonPhase est entre 0 et 1', () => {
        const result = runSolarProbe(x, z, altitude)!;
        expect(result.moonPhase).toBeGreaterThanOrEqual(0);
        expect(result.moonPhase).toBeLessThanOrEqual(1);
    });

    it('10. totalSunlightMinutes est entre 0 et 1440', () => {
        const result = runSolarProbe(x, z, altitude)!;
        expect(result.totalSunlightMinutes).toBeGreaterThanOrEqual(0);
        expect(result.totalSunlightMinutes).toBeLessThanOrEqual(1440);
    });

    it('11. goldenHourMorningStart < goldenHourMorningEnd si les deux existent', () => {
        const result = runSolarProbe(x, z, altitude)!;
        if (result.goldenHourMorningStart && result.goldenHourMorningEnd) {
            expect(result.goldenHourMorningStart.getTime()).toBeLessThan(
                result.goldenHourMorningEnd.getTime(),
            );
        }
    });

    it('12. timeline a exactement 48 éléments', () => {
        const result = runSolarProbe(x, z, altitude)!;
        expect(result.timeline).toHaveLength(48);
    });

    it('13. maxElevationDeg est cohérent avec elevationCurve', () => {
        const result = runSolarProbe(x, z, altitude)!;
        expect(result.maxElevationDeg).toBeGreaterThanOrEqual(-90);
        expect(result.maxElevationDeg).toBeLessThanOrEqual(90);
        const maxFromCurve = Math.max(...result.elevationCurve);
        expect(result.maxElevationDeg).toBeCloseTo(maxFromCurve, 5);
    });
});

describe('getMoonPhaseName', () => {
    it('phase 0 → new', () => {
        expect(getMoonPhaseName(0)).toBe('new');
    });

    it('phase 0.5 → full', () => {
        expect(getMoonPhaseName(0.5)).toBe('full');
    });

    it('phase 0.99 → new', () => {
        expect(getMoonPhaseName(0.99)).toBe('new');
    });

    it('phase 0.25 → first_quarter', () => {
        expect(getMoonPhaseName(0.25)).toBe('first_quarter');
    });
});
