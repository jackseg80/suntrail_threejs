import { describe, it, expect } from 'vitest';
import { haversineDistance } from './utils';
import { calculateTrackStats, LocationPoint } from './geoStats';

describe('Geo Precision & Haversine Accuracy', () => {
    
    it('should calculate Paris-Lyon distance correctly (reference ~391.1 km)', () => {
        // Coordonnées approximatives
        const paris = { lat: 48.8566, lon: 2.3522 };
        const lyon = { lat: 45.7640, lon: 4.8357 };
        
        const dist = haversineDistance(paris.lat, paris.lon, lyon.lat, lyon.lon);
        
        // La formule Haversine devrait donner environ 391.1 km
        // On accepte une marge d'erreur de 0.5% (dépend du rayon terrestre utilisé)
        expect(dist).toBeGreaterThan(390);
        expect(dist).toBeLessThan(393);
    });

    it('should calculate short distances accurately (100m segment)', () => {
        // Segment de ~100m à la latitude 46°N
        const p1 = { lat: 46.0000, lon: 7.0000 };
        const p2 = { lat: 46.0009, lon: 7.0000 }; // ~0.0009 deg lat approx 100m
        
        const distKm = haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);
        const distM = distKm * 1000;
        
        expect(distM).toBeGreaterThan(99);
        expect(distM).toBeLessThan(101);
    });
});

describe('Hysteresis Algorithm - Edge Cases (with smoothing v5.28.5)', () => {
    
    it('should trigger D+ at exactly 2.0 meters (using explicit threshold=2)', () => {
        // We need 4 points for smoothing to not touch extremes or have predictable effect
        const points: LocationPoint[] = [
            { lat: 46.0000, lon: 7.0000, alt: 1000, timestamp: 10000 },
            { lat: 46.0001, lon: 7.0001, alt: 1000, timestamp: 20000 },
            { lat: 46.0002, lon: 7.0002, alt: 1002, timestamp: 30000 },
            { lat: 46.0003, lon: 7.0003, alt: 1002, timestamp: 40000 }
        ];
        
        const stats = calculateTrackStats(points, 2);
        // Smoothing:
        // P1: (1000+1000+1002)/3 = 1000.66
        // P2: (1000+1002+1002)/3 = 1001.33
        // Total range 1000 to 1002 is still 2.0m because extremes are untouched
        expect(stats.dPlus).toBeGreaterThanOrEqual(2.0);
    });

    it('should NOT trigger D+ at 1.99 meters', () => {
        const points: LocationPoint[] = [
            { lat: 46, lon: 7, alt: 1000, timestamp: 10000 },
            { lat: 46.0001, lon: 7, alt: 1000, timestamp: 20000 },
            { lat: 46.0002, lon: 7, alt: 1001.99, timestamp: 30000 },
            { lat: 46.0003, lon: 7, alt: 1001.99, timestamp: 40000 }
        ];
        
        const stats = calculateTrackStats(points, 2);
        expect(stats.dPlus).toBe(0);
    });

    it('should correctly accumulate D+ with significant variations', () => {
        const points: LocationPoint[] = [
            { lat: 46.0000, lon: 7.0000, alt: 1000, timestamp: 10000 },
            { lat: 46.0001, lon: 7.0001, alt: 1000, timestamp: 20000 },
            { lat: 46.0002, lon: 7.0002, alt: 1010, timestamp: 30000 },
            { lat: 46.0003, lon: 7.0003, alt: 1010, timestamp: 40000 }
        ];
        
        const stats = calculateTrackStats(points, 2);
        expect(stats.dPlus).toBe(10.0);
    });
});
