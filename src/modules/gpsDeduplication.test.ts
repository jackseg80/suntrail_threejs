import { describe, it, expect } from 'vitest';
import { cleanGPSTrack } from './gpsDeduplication';

describe('GPS Deduplication (v5.28.2)', () => {

    it('should remove duplicate points with same timestamp', () => {
        const points = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.51, lon: 7.51, alt: 1005, timestamp: 2000 },
            { lat: 46.52, lon: 7.52, alt: 1010, timestamp: 3000 },
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 }, // Duplicate
        ];
        
        const uniquePoints = cleanGPSTrack(points);
        
        expect(uniquePoints.length).toBe(3);
        expect(uniquePoints[0].timestamp).toBe(1000);
        expect(uniquePoints[1].timestamp).toBe(2000);
        expect(uniquePoints[2].timestamp).toBe(3000);
    });

    it('should keep first occurrence and reject subsequent same timestamps', () => {
        const points = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.99, lon: 7.99, alt: 9999, timestamp: 1000 }, // Same timestamp
        ];
        
        const uniquePoints = cleanGPSTrack(points);
        
        expect(uniquePoints.length).toBe(1);
        expect(uniquePoints[0].lat).toBe(46.5);
    });

    it('should handle empty points array', () => {
        expect(cleanGPSTrack([]).length).toBe(0);
    });

    it('should handle single point', () => {
        const points = [{ lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 }];
        const uniquePoints = cleanGPSTrack(points);
        expect(uniquePoints.length).toBe(1);
        expect(uniquePoints[0].timestamp).toBe(1000);
    });

    it('should reject altitude outliers', () => {
        const points = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.5, lon: 7.5, alt: 2000, timestamp: 2000 }, // Altitude jump +1000m (> 500m)
            { lat: 46.5, lon: 7.5, alt: 1005, timestamp: 3000 }, // Back to normal
        ];
        
        const cleaned = cleanGPSTrack(points);
        expect(cleaned.length).toBe(2);
        expect(cleaned[1].alt).toBe(1005);
    });

    it('should reject absolute altitude range outliers', () => {
        const points = [
            { lat: 46.5, lon: 7.5, alt: -1000, timestamp: 1000 }, // Too low
            { lat: 46.5, lon: 7.5, alt: 10000, timestamp: 2000 }, // Too high
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 3000 },  // OK
        ];
        
        const cleaned = cleanGPSTrack(points);
        expect(cleaned.length).toBe(1);
        expect(cleaned[0].timestamp).toBe(3000);
    });
});
