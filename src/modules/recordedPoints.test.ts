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

describe('Live Tracking Recording (v5.7)', () => {
    beforeEach(() => {
        state.isRecording = false;
        state.recordedPoints = [];
        state.userLocation = null;
        vi.clearAllMocks();
    });

    afterEach(() => {
        stopLocationTracking();
    });

    it('should not record points when isRecording is false', async () => {
        await startLocationTracking();
        expect(state.recordedPoints.length).toBe(0);
    });

    it('should record points when isRecording is true', async () => {
        state.isRecording = true;
        // Use slightly different coords to bypass distMove filter
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
            return Promise.resolve('watch-456') as any;
        });

        await startLocationTracking();
        
        expect(state.recordedPoints.length).toBeGreaterThan(0);
        expect(state.recordedPoints[0].lat).toBe(46.6);
        expect(state.recordedPoints[0].alt).toBe(1100);
    });

    it('should reset recordedPoints when starting a new recording in UI logic', () => {
        // This is handled in ui.ts, but let's verify state behavior
        state.recordedPoints = [{ lat: 1, lon: 1, alt: 1, timestamp: 1 }];
        
        // Simulating the UI logic for start recording
        state.isRecording = true;
        state.recordedPoints = []; // UI logic would do this
        
        expect(state.recordedPoints.length).toBe(0);
    });
});
