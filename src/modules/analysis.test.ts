import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAltitudeAt, drapeToTerrain } from './analysis';
import { state } from './state';

describe('analysis.ts', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        state.RELIEF_EXAGGERATION = 1.0;
        state.IS_2D_MODE = false;
        state.originTile = { x: 4270, y: 2891, z: 13 };
    });

    it('should return 0 altitude if no tile is loaded', () => {
        const alt = getAltitudeAt(0, 0);
        expect(alt).toBe(0);
    });

    describe('drapeToTerrain', () => {
        it('should convert and offset points correctly', () => {
            const points = [
                { lat: 46.6863, lon: 7.6617, alt: 1000 },
                { lat: 46.6870, lon: 7.6620, alt: 1010 }
            ];
            
            // On ne peut pas facilement tester les valeurs exactes sans charger des tuiles,
            // mais on vérifie que le résultat a le bon nombre de points (densification x4 par défaut)
            // segments = 1, densifySteps = 4 -> points originaux + (densifySteps-1) intermédiaires = 2 + 3 = 5 points?
            // drapeToTerrain loop adds original point + (densifySteps-1) intermediate points per segment.
            // For N points, there are N-1 segments. 
            // Total = 1 + (N-1) * densifySteps.
            // points.length = 2 -> 1 + (1)*4 = 5.
            
            const result = drapeToTerrain(points, state.originTile, 4, 30);
            expect(result.length).toBe(5);
            expect(result[0].y).toBeGreaterThanOrEqual(1000 + 30);
        });

        it('should handle points with ele instead of alt (GPX format)', () => {
            const points = [
                { lat: 46.6, lon: 7.6, ele: 500 },
                { lat: 46.7, lon: 7.7, ele: 600 }
            ];
            const result = drapeToTerrain(points, state.originTile, 0, 10);
            expect(result.length).toBe(2);
            expect(result[0].y).toBeGreaterThanOrEqual(500 + 10);
        });
    });
});
