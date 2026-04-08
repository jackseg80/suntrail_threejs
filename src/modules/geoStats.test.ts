import { describe, it, expect } from 'vitest';
import { calculateTrackStats } from './geoStats';

describe('geoStats - Hysteresis Algorithm', () => {
    it('should ignore micro-variations below 2 meters', () => {
        const points = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.5001, lon: 7.5001, alt: 1001, timestamp: 2000 },   // +1m
            { lat: 46.5002, lon: 7.5002, alt: 999.5, timestamp: 3000 }, // -1.5m from ref
            { lat: 46.5003, lon: 7.5003, alt: 1001.5, timestamp: 4000 } // +1.5m from ref
        ];

        const stats = calculateTrackStats(points);
        expect(stats.dPlus).toBe(0);
        expect(stats.dMinus).toBe(0);
    });

    it('should record D+ when variation exceeds +2 meters', () => {
        const points = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.5001, lon: 7.5001, alt: 1002.5, timestamp: 2000 } // +2.5m
        ];

        const stats = calculateTrackStats(points);
        expect(stats.dPlus).toBe(2.5);
        expect(stats.dMinus).toBe(0);
    });

    it('should record D- when variation exceeds -2 meters', () => {
        const points = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.5001, lon: 7.5001, alt: 997.5, timestamp: 2000 } // -2.5m
        ];

        const stats = calculateTrackStats(points);
        expect(stats.dPlus).toBe(0);
        expect(stats.dMinus).toBe(2.5);
    });

    it('should reset reference altitude after a valid variation', () => {
        const points = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.5001, lon: 7.5001, alt: 1002.5, timestamp: 2000 }, // +2.5m (D+=2.5, ref=1002.5)
            { lat: 46.5002, lon: 7.5002, alt: 1003.5, timestamp: 3000 }, // +1m (ref=1002.5, no change)
            { lat: 46.5003, lon: 7.5003, alt: 1005.0, timestamp: 4000 }  // +2.5m from last ref (D+=2.5, ref=1005)
        ];

        const stats = calculateTrackStats(points);
        expect(stats.dPlus).toBe(5.0);
    });

    it('should handle complex climbing/descending sequences', () => {
        const points = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.5001, lon: 7.5001, alt: 1010, timestamp: 2000 }, // D+ 10, Ref 1010
            { lat: 46.5002, lon: 7.5002, alt: 1009, timestamp: 3000 }, // No change
            { lat: 46.5003, lon: 7.5003, alt: 1007, timestamp: 4000 }, // D- 3, Ref 1007
            { lat: 46.5004, lon: 7.5004, alt: 1008, timestamp: 5000 }, // No change
            { lat: 46.5005, lon: 7.5005, alt: 1010, timestamp: 6000 }  // D+ 3, Ref 1010
        ];

        const stats = calculateTrackStats(points);
        expect(stats.dPlus).toBe(13);
        expect(stats.dMinus).toBe(3);
    });
});
