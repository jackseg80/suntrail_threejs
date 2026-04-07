import { describe, it, expect, beforeEach } from 'vitest';
import { state } from './state';

// Mock pour le test de buildGPXString
// Nous testons la logique de dédoublonnage directement

describe('GPX Export - Deduplication (v5.25.1)', () => {
    beforeEach(() => {
        state.recordedPoints = [];
    });

    it('should remove duplicate points with same timestamp', () => {
        const points = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.51, lon: 7.51, alt: 1005, timestamp: 2000 },
            { lat: 46.52, lon: 7.52, alt: 1010, timestamp: 3000 },
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 }, // Duplicate
            { lat: 46.51, lon: 7.51, alt: 1005, timestamp: 2000 }, // Duplicate
        ];
        
        // Simulate buildGPXString deduplication logic
        const uniquePoints = [...new Map(points.map((p: typeof points[0]) => [p.timestamp, p])).values()];
        
        expect(uniquePoints.length).toBe(3);
        expect(uniquePoints[0].timestamp).toBe(1000);
        expect(uniquePoints[1].timestamp).toBe(2000);
        expect(uniquePoints[2].timestamp).toBe(3000);
    });

    it('should keep last occurrence when duplicates exist (Map behavior)', () => {
        const points = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.99, lon: 7.99, alt: 9999, timestamp: 1000 }, // Same timestamp, different coords
        ];
        
        const uniquePoints = [...new Map(points.map((p: typeof points[0]) => [p.timestamp, p])).values()];
        
        expect(uniquePoints.length).toBe(1);
        // Map keeps the last inserted value
        expect(uniquePoints[0].lat).toBe(46.99);
        expect(uniquePoints[0].lon).toBe(7.99);
    });

    it('should handle empty points array', () => {
        const points: any[] = [];
        const uniquePoints = [...new Map(points.map((p: typeof points[0]) => [p.timestamp, p])).values()];
        expect(uniquePoints.length).toBe(0);
    });

    it('should handle single point', () => {
        const points = [{ lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 }];
        const uniquePoints = [...new Map(points.map((p: typeof points[0]) => [p.timestamp, p])).values()];
        expect(uniquePoints.length).toBe(1);
        expect(uniquePoints[0].timestamp).toBe(1000);
    });

    it('should handle many duplicates', () => {
        const points = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
        ];
        
        const uniquePoints = [...new Map(points.map((p: typeof points[0]) => [p.timestamp, p])).values()];
        expect(uniquePoints.length).toBe(1);
    });

    it('should preserve chronological order of unique points', () => {
        const points = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.51, lon: 7.51, alt: 1005, timestamp: 2000 },
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 }, // Duplicate of first
            { lat: 46.52, lon: 7.52, alt: 1010, timestamp: 3000 },
            { lat: 46.51, lon: 7.51, alt: 1005, timestamp: 2000 }, // Duplicate of second
        ];
        
        const uniquePoints = [...new Map(points.map((p: typeof points[0]) => [p.timestamp, p])).values()];
        
        // Map preserves insertion order of first occurrence of each unique key
        // but keeps the last value inserted for each key
        expect(uniquePoints.length).toBe(3);
        expect(uniquePoints[0].timestamp).toBe(1000); // First unique key seen
        expect(uniquePoints[1].timestamp).toBe(2000); // Second unique key seen  
        expect(uniquePoints[2].timestamp).toBe(3000); // Third unique key seen
    });
});

describe('nativeGPSService - Point Deduplication', () => {
    beforeEach(() => {
        state.recordedPoints = [];
    });

    it('should filter out points with existing timestamps', () => {
        // Simuler state avec des points existants
        state.recordedPoints = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.51, lon: 7.51, alt: 1005, timestamp: 2000 },
        ];

        // Simuler nouveaux points reçus du natif (certains sont des doublons)
        const newPoints = [
            { id: 1, lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000, accuracy: 10 }, // Duplicate
            { id: 2, lat: 46.51, lon: 7.51, alt: 1005, timestamp: 2000, accuracy: 10 }, // Duplicate
            { id: 3, lat: 46.52, lon: 7.52, alt: 1010, timestamp: 3000, accuracy: 10 }, // New
        ];

        // Simuler la logique de filtrage dans nativeGPSService
        const existingTimestamps = new Set(state.recordedPoints.map(p => p.timestamp));
        const uniqueNewPoints = newPoints.filter((p: any) => !existingTimestamps.has(p.timestamp));

        expect(uniqueNewPoints.length).toBe(1);
        expect(uniqueNewPoints[0].timestamp).toBe(3000);
    });

    it('should handle batch with all duplicates', () => {
        state.recordedPoints = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.51, lon: 7.51, alt: 1005, timestamp: 2000 },
        ];

        const newPoints = [
            { id: 1, lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000, accuracy: 10 },
            { id: 2, lat: 46.51, lon: 7.51, alt: 1005, timestamp: 2000, accuracy: 10 },
        ];

        const existingTimestamps = new Set(state.recordedPoints.map(p => p.timestamp));
        const uniqueNewPoints = newPoints.filter((p: any) => !existingTimestamps.has(p.timestamp));

        expect(uniqueNewPoints.length).toBe(0);
    });

    it('should handle empty state and add all new points', () => {
        state.recordedPoints = [];

        const newPoints = [
            { id: 1, lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000, accuracy: 10 },
            { id: 2, lat: 46.51, lon: 7.51, alt: 1005, timestamp: 2000, accuracy: 10 },
        ];

        const existingTimestamps = new Set(state.recordedPoints.map(p => p.timestamp));
        const uniqueNewPoints = newPoints.filter((p: any) => !existingTimestamps.has(p.timestamp));

        expect(uniqueNewPoints.length).toBe(2);
    });

    it('should correctly merge unique points into state', () => {
        state.recordedPoints = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
        ];

        const uniqueNewPoints = [
            { lat: 46.51, lon: 7.51, alt: 1005, timestamp: 2000 },
        ];

        // Simuler la fusion
        state.recordedPoints = [...state.recordedPoints, ...uniqueNewPoints];

        expect(state.recordedPoints.length).toBe(2);
        expect(state.recordedPoints[0].timestamp).toBe(1000);
        expect(state.recordedPoints[1].timestamp).toBe(2000);
    });
});

describe('Recovery Scenario - Duplicate Prevention', () => {
    beforeEach(() => {
        state.recordedPoints = [];
    });

    it('should prevent duplicates after recovery (main.ts scenario)', () => {
        // Simuler le scénario de recovery :
        // 1. Points existants après recovery
        const recoveredPoints = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.51, lon: 7.51, alt: 1005, timestamp: 2000 },
            { lat: 46.52, lon: 7.52, alt: 1010, timestamp: 3000 },
        ];
        state.recordedPoints = recoveredPoints;

        // 2. Nouveaux événements onNewPoints avec des points déjà récupérés
        const onNewPointsEvent = [
            { id: 1, lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000, accuracy: 10 }, // Déjà dans state
            { id: 2, lat: 46.51, lon: 7.51, alt: 1005, timestamp: 2000, accuracy: 10 }, // Déjà dans state
            { id: 3, lat: 46.53, lon: 7.53, alt: 1015, timestamp: 4000, accuracy: 10 }, // Nouveau
        ];

        // 3. Appliquer le filtre (logique nativeGPSService)
        const existingTimestamps = new Set(state.recordedPoints.map(p => p.timestamp));
        const uniqueNewPoints = onNewPointsEvent.filter((p: any) => !existingTimestamps.has(p.timestamp));

        // 4. Fusionner
        const convertedPoints = uniqueNewPoints.map(p => ({
            lat: p.lat,
            lon: p.lon,
            alt: p.alt,
            timestamp: p.timestamp
        }));
        state.recordedPoints = [...state.recordedPoints, ...convertedPoints];

        // Vérification
        expect(state.recordedPoints.length).toBe(4); // 3 recovery + 1 nouveau
        expect(state.recordedPoints[3].timestamp).toBe(4000);

        // Vérifier qu'il n'y a pas de doublons
        const timestamps = state.recordedPoints.map(p => p.timestamp);
        const uniqueTimestamps = [...new Set(timestamps)];
        expect(timestamps.length).toBe(uniqueTimestamps.length);
    });

    it('should handle multiple recovery events without duplicates', () => {
        // Premier recovery
        state.recordedPoints = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
        ];

        // Plusieurs événements onNewPoints avec le même point
        const events = [
            { id: 1, lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000, accuracy: 10 },
            { id: 2, lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000, accuracy: 10 },
        ];

        events.forEach(event => {
            const existingTimestamps = new Set(state.recordedPoints.map(p => p.timestamp));
            const uniqueNewPoints = [event].filter((p: any) => !existingTimestamps.has(p.timestamp));
            
            if (uniqueNewPoints.length > 0) {
                const converted = uniqueNewPoints.map(p => ({
                    lat: p.lat,
                    lon: p.lon,
                    alt: p.alt,
                    timestamp: p.timestamp
                }));
                state.recordedPoints = [...state.recordedPoints, ...converted];
            }
        });

        expect(state.recordedPoints.length).toBe(1);
    });
});
