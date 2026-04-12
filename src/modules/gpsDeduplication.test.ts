import { describe, it, expect } from 'vitest';
import { cleanGPSTrack } from './gpsDeduplication';

describe('GPS Deduplication (v5.28.5)', () => {

    it('should remove duplicate points with same timestamp', () => {
        const points = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 1005, timestamp: 20000 }, // Realistic move
            { lat: 46.5002, lon: 7.5002, alt: 1010, timestamp: 30000 },
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 }, // Duplicate
        ];
        
        const uniquePoints = cleanGPSTrack(points);
        
        expect(uniquePoints.length).toBe(3);
        expect(uniquePoints[0].timestamp).toBe(10000);
        expect(uniquePoints[1].timestamp).toBe(20000);
        expect(uniquePoints[2].timestamp).toBe(30000);
    });

    it('should apply 3-point moving average to altitude', () => {
        const points = [
            { lat: 46.5000, lon: 7.5000, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 1010, timestamp: 20000 },
            { lat: 46.5002, lon: 7.5002, alt: 1005, timestamp: 30000 },
            { lat: 46.5003, lon: 7.5003, alt: 1015, timestamp: 40000 },
        ];
        
        const smoothed = cleanGPSTrack(points);
        
        expect(smoothed.length).toBe(4);
        // First and last points should be untouched
        expect(smoothed[0].alt).toBe(1000);
        expect(smoothed[3].alt).toBe(1015);
        
        // Point 1: (1000 + 1010 + 1005) / 3 = 1005
        expect(smoothed[1].alt).toBeCloseTo(1005, 1);
        
        // Point 2: (1010 + 1005 + 1015) / 3 = 1010
        expect(smoothed[2].alt).toBeCloseTo(1010, 1);
    });

    it('should reject altitude outliers (jumps)', () => {
        const points = [
            { lat: 46.5000, lon: 7.5000, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 1300, timestamp: 11000 }, // +300m in 1s -> Rejected
            { lat: 46.5002, lon: 7.5002, alt: 1005, timestamp: 20000 }, // OK
        ];
        
        const cleaned = cleanGPSTrack(points);
        // Point at 11000 should be removed, but with smoothing it might be tricky
        // Actually since we only have 2 points left after filtering, smoothing might not run or be trivial
        expect(cleaned.length).toBe(2);
        expect(cleaned[0].timestamp).toBe(10000);
        expect(cleaned[1].timestamp).toBe(20000);
    });

    it('should reject extreme speed outliers', () => {
        const points = [
            { lat: 46.5000, lon: 7.5000, alt: 1000, timestamp: 10000 },
            { lat: 47.5000, lon: 8.5000, alt: 1000, timestamp: 11000 }, // ~150km in 1s -> Rejected
            { lat: 46.5001, lon: 7.5001, alt: 1000, timestamp: 20000 }, // OK
        ];
        
        const cleaned = cleanGPSTrack(points);
        expect(cleaned.length).toBe(2);
        expect(cleaned[1].timestamp).toBe(20000);
    });

    it('should handle invalid (0,0) coordinates', () => {
        const points = [
            { lat: 0, lon: 0, alt: 1000, timestamp: 10000 },
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 20000 },
        ];
        const cleaned = cleanGPSTrack(points);
        expect(cleaned.length).toBe(1);
        expect(cleaned[0].lat).toBe(46.5);
    });
});
