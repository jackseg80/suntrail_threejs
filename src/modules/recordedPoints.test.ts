import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { state } from './state';
import { startLocationTracking, stopLocationTracking } from './location';
import { Geolocation } from '@capacitor/geolocation';

// Mock Geolocation
const mockGeolocation = {
    watchPosition: vi.fn((_opts, cb) => {
        // Simulate a position update
        cb({
            coords: {
                latitude: 46.5,
                longitude: 7.5,
                altitude: 1000,
                accuracy: 10,
                altitudeAccuracy: 10,
                heading: 0,
                speed: 0
            },
            timestamp: Date.now()
        });
        return 'watch-123';
    }),
    clearWatch: vi.fn()
};

vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: mockGeolocation
});

// We need to mock capacitor geolocation too
vi.mock('@capacitor/geolocation', () => ({
    Geolocation: {
        watchPosition: vi.fn((_opts, cb) => {
            cb({
                coords: {
                    latitude: 46.5,
                    longitude: 7.5,
                    altitude: 1000,
                    accuracy: 10,
                    altitudeAccuracy: 10,
                    heading: 0,
                    speed: 0
                },
                timestamp: Date.now()
            }, null);
            return Promise.resolve('watch-123');
        }),
        clearWatch: vi.fn()
    }
}));

describe('Live Location Tracking (v5.25.0 - Single Source of Truth)', () => {
    beforeEach(() => {
        state.isRecording = false;
        state.recordedPoints = [];
        state.userLocation = null;
        state.recordingOriginTile = null;
        state.userLocationAccuracy = null;
        vi.clearAllMocks();
    });

    afterEach(() => {
        stopLocationTracking();
    });

    it('should update userLocation when tracking is active', async () => {
        vi.mocked(Geolocation.watchPosition).mockImplementationOnce((_opts, cb) => {
            cb({
                coords: {
                    latitude: 46.6,
                    longitude: 7.6,
                    altitude: 1100,
                    accuracy: 15,
                    altitudeAccuracy: 10,
                    heading: 0,
                    speed: 0
                },
                timestamp: Date.now()
            }, null);
            return Promise.resolve('watch-456') as any;
        });

        await startLocationTracking();
        
        expect(state.userLocation).not.toBeNull();
        expect(state.userLocation?.lat).toBe(46.6);
        expect(state.userLocation?.lon).toBe(7.6);
        expect(state.userLocationAccuracy).toBe(15);
    });

    it('should not record points in state.recordedPoints (handled by native)', async () => {
        state.isRecording = true;
        
        vi.mocked(Geolocation.watchPosition).mockImplementationOnce((_opts, cb) => {
            cb({
                coords: {
                    latitude: 46.6,
                    longitude: 7.6,
                    altitude: 1100,
                    accuracy: 10,
                    altitudeAccuracy: 10,
                    heading: 0,
                    speed: 0
                },
                timestamp: Date.now()
            }, null);
            return Promise.resolve('watch-789') as any;
        });

        await startLocationTracking();
        
        // En v5.25.0, les points ne sont plus enregistrés par le JS
        // L'enregistrement est géré uniquement par le natif Android
        expect(state.recordedPoints.length).toBe(0);
    });

    it('should update userLocationAccuracy when position updates', async () => {
        vi.mocked(Geolocation.watchPosition).mockImplementationOnce((_opts, cb) => {
            cb({
                coords: {
                    latitude: 46.6,
                    longitude: 7.6,
                    altitude: 1100,
                    accuracy: 25,
                    altitudeAccuracy: 10,
                    heading: 0,
                    speed: 0
                },
                timestamp: Date.now()
            }, null);
            return Promise.resolve('watch-abc') as any;
        });

        await startLocationTracking();
        
        expect(state.userLocationAccuracy).toBe(25);
    });
});

// Note: Les tests d'enregistrement de points ont été supprimés en v5.25.0
// car l'architecture "Single Source of Truth" déplace toute la logique 
// d'enregistrement GPS vers le natif Android (RecordingService).
// Les points sont maintenant reçus via des événements natifs (onNewPoints)
// gérés par nativeGPSService.ts
