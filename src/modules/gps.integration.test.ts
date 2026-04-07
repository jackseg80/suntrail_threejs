import { describe, it, expect } from 'vitest';
import { cleanGPSTrack } from './gpsDeduplication';
import { LocationPoint } from './state';

describe('GPS Integration - Track Cleaning', () => {
    it('should handle a perfect track without modifications', () => {
        const points: LocationPoint[] = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
            { lat: 46.501, lon: 7.501, alt: 1005, timestamp: 20000 },
            { lat: 46.502, lon: 7.502, alt: 1010, timestamp: 30000 },
        ];
        
        const cleaned = cleanGPSTrack(points);
        expect(cleaned.length).toBe(3);
    });

    it('should remove exact duplicate timestamps', () => {
        const points: LocationPoint[] = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 }, // Duplicate
            { lat: 46.501, lon: 7.501, alt: 1005, timestamp: 20000 },
        ];
        
        const cleaned = cleanGPSTrack(points);
        expect(cleaned.length).toBe(2);
        expect(cleaned[0].timestamp).toBe(10000);
        expect(cleaned[1].timestamp).toBe(20000);
    });

    it('should remove points that are too close (static noise)', () => {
        const points: LocationPoint[] = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
            { lat: 46.500001, lon: 7.500001, alt: 1000, timestamp: 15000 }, // ~0.1m away, 5s later
            { lat: 46.501, lon: 7.501, alt: 1005, timestamp: 30000 },
        ];
        
        const cleaned = cleanGPSTrack(points);
        expect(cleaned.length).toBe(2);
        expect(cleaned[0].timestamp).toBe(10000);
        expect(cleaned[1].timestamp).toBe(30000);
    });

    it('should remove abnormal jumps (GPS outliers)', () => {
        const points: LocationPoint[] = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
            { lat: 47.5, lon: 8.5, alt: 1000, timestamp: 20000 }, // Huge jump (10s to travel ~100km)
            { lat: 46.501, lon: 7.501, alt: 1005, timestamp: 30000 },
        ];
        
        const cleaned = cleanGPSTrack(points);
        expect(cleaned.length).toBe(2);
        expect(cleaned[0].lat).toBe(46.5);
        expect(cleaned[1].lat).toBe(46.501);
    });

    it('should handle recovery after a jump', () => {
        const points: LocationPoint[] = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
            { lat: 47.5, lon: 8.5, alt: 1000, timestamp: 20000 }, // Outlier
            { lat: 46.501, lon: 7.501, alt: 1005, timestamp: 100000 }, // Back on track (long time later)
            { lat: 46.502, lon: 7.502, alt: 1010, timestamp: 200000 },
        ];
        
        const cleaned = cleanGPSTrack(points);
        expect(cleaned.length).toBe(3);
        expect(cleaned[1].lat).toBe(46.501);
    });

    it('should sort points by timestamp if they arrive out of order', () => {
        const points: LocationPoint[] = [
            { lat: 46.501, lon: 7.501, alt: 1005, timestamp: 20000 },
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
        ];
        
        const cleaned = cleanGPSTrack(points);
        expect(cleaned.length).toBe(2);
        expect(cleaned[0].timestamp).toBe(10000);
        expect(cleaned[1].timestamp).toBe(20000);
    });
});
