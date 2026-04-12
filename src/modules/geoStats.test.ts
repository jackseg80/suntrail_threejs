import { describe, it, expect } from 'vitest';
import { calculateTrackStats } from './geoStats';

describe('geoStats - Hysteresis Algorithm', () => {
    
    it('should calculate distance correctly', () => {
        const points = [
            { lat: 46.5000, lon: 7.5000, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 1000, timestamp: 20000 },
        ];
        
        const stats = calculateTrackStats(points);
        expect(stats.distance).toBeGreaterThan(0);
        expect(stats.dPlus).toBe(0);
        expect(stats.dMinus).toBe(0);
    });

    it('should record D+ when variation exceeds threshold (3m)', () => {
        const points = [
            { lat: 46.5000, lon: 7.5000, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 1002, timestamp: 20000 },
            { lat: 46.5002, lon: 7.5002, alt: 1005, timestamp: 30000 }, // +5m total
            { lat: 46.5003, lon: 7.5003, alt: 1010, timestamp: 40000 },
        ];
        
        const stats = calculateTrackStats(points);
        // Smoothing (3-pt avg) will affect these values
        // Pt 0: 1000
        // Pt 1: (1000+1002+1005)/3 = 1002.33
        // Pt 2: (1002+1005+1010)/3 = 1005.66
        // Pt 3: 1010
        // Total D+ should be ~10m
        expect(stats.dPlus).toBeGreaterThan(5);
    });

    it('should record D- when variation exceeds threshold (3m)', () => {
        const points = [
            { lat: 46.5000, lon: 7.5000, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 995,  timestamp: 20000 },
            { lat: 46.5002, lon: 7.5002, alt: 990,  timestamp: 30000 },
        ];
        
        const stats = calculateTrackStats(points);
        expect(stats.dMinus).toBeGreaterThan(5);
    });

    it('should reset reference altitude after a valid variation', () => {
        const points = [
            { lat: 46.5000, lon: 7.5000, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 1005, timestamp: 20000 }, // +5m
            { lat: 46.5002, lon: 7.5002, alt: 1006, timestamp: 30000 }, // +1m (ignored if no smoothing, but smoothing spreads it)
            { lat: 46.5003, lon: 7.5003, alt: 1010, timestamp: 40000 }, // +4m
        ];

        const stats = calculateTrackStats(points);
        expect(stats.dPlus).toBeGreaterThan(5);
    });

    it('should handle complex climbing/descending sequences', () => {
        const points = [
            { lat: 46.5000, lon: 7.5000, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 1010, timestamp: 20000 }, // +10
            { lat: 46.5002, lon: 7.5002, alt: 1008, timestamp: 30000 }, // -2 (ignored if threshold=3)
            { lat: 46.5003, lon: 7.5003, alt: 1015, timestamp: 40000 }, // +5 total 15
            { lat: 46.5004, lon: 7.5004, alt: 1005, timestamp: 50000 }, // -10 (should be detected as D-)
        ];

        const stats = calculateTrackStats(points);
        expect(stats.dPlus).toBeGreaterThan(10);
        expect(stats.dMinus).toBeGreaterThan(3);
    });
});
