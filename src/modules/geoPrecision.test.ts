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

describe('Hysteresis Algorithm - Edge Cases', () => {
    
    it('should trigger D+ at exactly 2.0 meters', () => {
        const points: LocationPoint[] = [
            { lat: 46, lon: 7, alt: 1000, timestamp: 1000 },
            { lat: 46.0001, lon: 7.0001, alt: 1002, timestamp: 2000 }
        ];
        
        const stats = calculateTrackStats(points, 2);
        expect(stats.dPlus).toBe(2);
    });

    it('should NOT trigger D+ at 1.99 meters', () => {
        const points: LocationPoint[] = [
            { lat: 46, lon: 7, alt: 1000, timestamp: 1000 },
            { lat: 46.0001, lon: 7.0001, alt: 1001.99, timestamp: 2000 }
        ];
        
        const stats = calculateTrackStats(points, 2);
        expect(stats.dPlus).toBe(0);
    });

    it('should correctly accumulate D+ after resetting reference', () => {
        const points: LocationPoint[] = [
            { lat: 46, lon: 7, alt: 1000, timestamp: 1000 },
            { lat: 46.0001, lon: 7.0001, alt: 1002.5, timestamp: 2000 }, // +2.5m (D+=2.5, Ref=1002.5)
            { lat: 46.0002, lon: 7.0002, alt: 1001.0, timestamp: 3000 }, // -1.5m (Diff=-1.5, <2m, Ref=1002.5)
            { lat: 46.0003, lon: 7.0003, alt: 1005.0, timestamp: 4000 }  // +2.5m from ref 1002.5 (D+=2.5, Ref=1005)
        ];
        
        const stats = calculateTrackStats(points, 2);
        expect(stats.dPlus).toBe(5.0);
    });

    it('should handle jitter/noise correctly (mountain trail simulation)', () => {
        const points: LocationPoint[] = [
            { lat: 46, lon: 7, alt: 1500, timestamp: 1000 },
            { lat: 46.0001, lon: 7, alt: 1501, timestamp: 2000 }, // +1 (Ref 1500)
            { lat: 46.0002, lon: 7, alt: 1499, timestamp: 3000 }, // -1 (Ref 1500)
            { lat: 46.0003, lon: 7, alt: 1502.1, timestamp: 4000 }, // +2.1 (Ref 1502.1, D+=2.1)
            { lat: 46.0004, lon: 7, alt: 1501.5, timestamp: 5000 }, // -0.6 (Ref 1502.1)
            { lat: 46.0005, lon: 7, alt: 1499.9, timestamp: 6000 }  // -2.2 (Ref 1499.9, D-=2.2)
        ];
        
        const stats = calculateTrackStats(points, 2);
        expect(stats.dPlus).toBeCloseTo(2.1, 5);
        expect(stats.dMinus).toBeCloseTo(2.2, 5);
    });
});
