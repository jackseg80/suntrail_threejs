import { describe, expect, it } from 'vitest';
import { analyzeORSDifficulty, createOSRMDifficulty } from './routeDifficulty';

describe('technical difficulty matrix', () => {
    it('accepts complete ORS SAC coverage', () => {
        const result = analyzeORSDifficulty(
            {
                traildifficulty: {
                    values: [[0, 10, 3]],
                    summary: [{ value: 3, distance: 2000, amount: 100 }],
                },
                steepness: {
                    summary: [{ value: 2, amount: 100 }],
                },
                surface: {
                    summary: [{ value: 2, amount: 100 }],
                },
                waytypes: {
                    summary: [{ value: 4, amount: 100 }],
                },
            },
            11
        );

        expect(result.difficulty).toMatchObject({
            status: 'known',
            sacLevel: 3,
            coveragePercent: 100,
            source: 'ors',
        });
        expect(result.coverage).toEqual({
            trailDifficulty: 100,
            steepness: 100,
            surface: 100,
            wayType: 100,
        });
    });

    it('reports partial ORS coverage without filling unknown sections', () => {
        const result = analyzeORSDifficulty(
            {
                traildifficulty: {
                    summary: [
                        { value: 0, amount: 60 },
                        { value: 2, amount: 40 },
                    ],
                },
                steepness: { summary: [{ value: 0, amount: 100 }] },
            },
            11
        );

        expect(result.difficulty).toMatchObject({
            status: 'partial',
            sacLevel: 2,
            coveragePercent: 40,
            reason: 'partial',
        });
        expect(result.coverage.steepness).toBe(100);
    });

    it('treats ORS without SAC tags as a valid unknown result', () => {
        const result = analyzeORSDifficulty(
            {
                traildifficulty: {
                    summary: [{ value: 0, amount: 100 }],
                },
                surface: { summary: [{ value: 2, amount: 75 }] },
            },
            11
        );

        expect(result.difficulty).toMatchObject({
            status: 'unknown',
            sacLevel: null,
            coveragePercent: 0,
            reason: 'missing-data',
        });
        expect(result.coverage.surface).toBe(75);
    });

    it('treats OSRM as unknown while leaving the other metrics available', () => {
        expect(createOSRMDifficulty()).toEqual({
            difficulty: {
                status: 'unknown',
                source: 'osrm',
                sacLevel: null,
                coveragePercent: 0,
                reason: 'osrm-fallback',
            },
            coverage: {
                trailDifficulty: 0,
                steepness: 0,
                surface: 0,
                wayType: 0,
            },
        });
    });
});
