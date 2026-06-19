import { describe, it, expect } from 'vitest';
import { calculateTrackStats, calculateEstimatedTime } from './geoStats';
import type { LocationPoint } from './geo';

describe('geoStats - Munter Method (v5.29.40)', () => {
    it('should estimate time correctly (4km/h base)', () => {
        // 4 km plat = 1h (60 min)
        expect(calculateEstimatedTime(4, 0)).toBe(60);
        // 8 km plat = 2h (120 min)
        expect(calculateEstimatedTime(8, 0)).toBe(120);
    });

    it('should include D+ in estimation (400m D+ = 1h)', () => {
        // 0 km horizontal + 400m D+ = 1h effort (60 min)
        expect(calculateEstimatedTime(0.001, 400)).toBe(60);
    });

    it('should combine distance and D+ (Tour du lac de Champex example)', () => {
        // Ex: 5km + 300m D+
        // Effort = 5 + (300/100) = 8 effort-km
        // Time = 8 / 4 = 2h (120 min)
        expect(calculateEstimatedTime(5, 300)).toBe(120);
    });

    it('should return 0 for zero distance', () => {
        expect(calculateEstimatedTime(0, 1000)).toBe(0);
    });
});

describe('geoStats - Hysteresis Algorithm', () => {
    it('should calculate distance correctly', () => {
        const points = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 1000, timestamp: 20000 },
        ];

        const stats = calculateTrackStats(points);
        expect(stats.distance).toBeGreaterThan(0);
        expect(stats.dPlus).toBe(0);
        expect(stats.dMinus).toBe(0);
    });

    it('should record D+ when variation exceeds threshold (5m)', () => {
        const points = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 1000, timestamp: 20000 },
            { lat: 46.5002, lon: 7.5002, alt: 1000, timestamp: 30000 },
            { lat: 46.5003, lon: 7.5003, alt: 1010, timestamp: 40000 }, // Saut brusque de 10m
            { lat: 46.5004, lon: 7.5004, alt: 1010, timestamp: 50000 },
            { lat: 46.5005, lon: 7.5005, alt: 1010, timestamp: 60000 },
        ];

        const stats = calculateTrackStats(points);
        // Avec lissage 5-pts, le saut de 10m sera lissé sur plusieurs points
        // mais le total cumulé doit dépasser le seuil de 5m.
        expect(stats.dPlus).toBeGreaterThan(5);
    });

    it('should record D- when variation exceeds threshold (5m)', () => {
        const points = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 1000, timestamp: 20000 },
            { lat: 46.5002, lon: 7.5002, alt: 1000, timestamp: 30000 },
            { lat: 46.5003, lon: 7.5003, alt: 990, timestamp: 40000 }, // Descente brusque 10m
            { lat: 46.5004, lon: 7.5004, alt: 990, timestamp: 50000 },
            { lat: 46.5005, lon: 7.5005, alt: 990, timestamp: 60000 },
        ];

        const stats = calculateTrackStats(points);
        expect(stats.dMinus).toBeGreaterThan(5);
    });

    it('should reset reference altitude after a valid variation', () => {
        const points = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 1000, timestamp: 20000 },
            { lat: 46.5002, lon: 7.5002, alt: 1000, timestamp: 30000 },
            { lat: 46.5003, lon: 7.5003, alt: 1020, timestamp: 40000 }, // +20m
            { lat: 46.5004, lon: 7.5004, alt: 1020, timestamp: 50000 },
            { lat: 46.5005, lon: 7.5005, alt: 1020, timestamp: 60000 },
            { lat: 46.5006, lon: 7.5006, alt: 1020, timestamp: 70000 },
            { lat: 46.5007, lon: 7.5007, alt: 1040, timestamp: 80000 }, // +20m encore
            { lat: 46.5008, lon: 7.5008, alt: 1040, timestamp: 90000 },
            { lat: 46.5009, lon: 7.5009, alt: 1040, timestamp: 100000 },
        ];

        const stats = calculateTrackStats(points);
        expect(stats.dPlus).toBeGreaterThan(30);
    });

    it('should handle complex climbing/descending sequences', () => {
        const points = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 1000, timestamp: 20000 },
            { lat: 46.5002, lon: 7.5002, alt: 1000, timestamp: 30000 },
            { lat: 46.5003, lon: 7.5003, alt: 1030, timestamp: 40000 }, // +30m
            { lat: 46.5004, lon: 7.5004, alt: 1030, timestamp: 50000 },
            { lat: 46.5005, lon: 7.5005, alt: 1030, timestamp: 60000 },
            { lat: 46.5006, lon: 7.5006, alt: 1000, timestamp: 70000 }, // -30m
            { lat: 46.5007, lon: 7.5007, alt: 1000, timestamp: 80000 },
            { lat: 46.5008, lon: 7.5008, alt: 1000, timestamp: 90000 },
        ];

        const stats = calculateTrackStats(points);
        expect(stats.dPlus).toBeGreaterThan(15);
        expect(stats.dMinus).toBeGreaterThan(15);
    });
});

describe('geoStats - skipCleaning (v5.76.0)', () => {
    function makePoints(
        pts: Array<{ lat: number; lon: number; alt: number; timestamp: number }>
    ): LocationPoint[] {
        return pts.map((p) => ({ ...p }));
    }

    it('should produce same distance with skipCleaning=true for pre-cleaned points', () => {
        const points = makePoints([
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 1005, timestamp: 20000 },
            { lat: 46.5002, lon: 7.5002, alt: 1010, timestamp: 30000 },
            { lat: 46.5003, lon: 7.5003, alt: 980, timestamp: 40000 },
            { lat: 46.5004, lon: 7.5004, alt: 990, timestamp: 50000 },
        ]);

        const statsFull = calculateTrackStats(points, 5, false);
        const statsSkip = calculateTrackStats(points, 5, true);

        expect(statsSkip.distance).toBeCloseTo(statsFull.distance, 3);
    });

    it('should deduplicate by timestamp with skipCleaning=true', () => {
        const points = makePoints([
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 1005, timestamp: 20000 },
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 }, // Duplicate
            { lat: 46.5002, lon: 7.5002, alt: 1010, timestamp: 30000 },
        ]);

        const stats = calculateTrackStats(points, 5, true);

        expect(stats.distance).toBeGreaterThan(0);
    });

    it('should return zero stats for less than 2 points', () => {
        const stats = calculateTrackStats(
            [{ lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 }],
            5,
            true
        );

        expect(stats.distance).toBe(0);
        expect(stats.dPlus).toBe(0);
        expect(stats.dMinus).toBe(0);
    });

    it('should handle D+/D- correctly with skipCleaning=true', () => {
        const points = makePoints([
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 1000, timestamp: 20000 },
            { lat: 46.5002, lon: 7.5002, alt: 1030, timestamp: 30000 },
            { lat: 46.5003, lon: 7.5003, alt: 1030, timestamp: 40000 },
            { lat: 46.5004, lon: 7.5004, alt: 1000, timestamp: 50000 },
            { lat: 46.5005, lon: 7.5005, alt: 1000, timestamp: 60000 },
        ]);

        const stats = calculateTrackStats(points, 5, true);

        expect(stats.dPlus).toBeGreaterThan(15);
        expect(stats.dMinus).toBeGreaterThan(15);
    });
});
