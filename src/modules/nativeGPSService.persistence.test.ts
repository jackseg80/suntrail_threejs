import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nativeGPSService } from './nativeGPSService';
import { state } from './state';
import { Preferences } from '@capacitor/preferences';

// Mock Capacitor Preferences
vi.mock('@capacitor/preferences', () => ({
    Preferences: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn()
    }
}));

// Mock Recording Native
vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true },
    registerPlugin: () => ({
        startCourse: vi.fn().mockResolvedValue({ courseId: 'test-123' }),
        getCurrentCourse: vi.fn().mockResolvedValue({ courseId: 'test-123', isRunning: true }),
        getPoints: vi.fn().mockResolvedValue({ points: [] }),
        addListener: vi.fn(),
        removeAllListeners: vi.fn()
    })
}));

describe('GPS Chrono Persistence (v5.29.1)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.recordingStartTime = null;
    });

    it('SHOULD save startTime in Preferences when starting a course', async () => {
        await nativeGPSService.startCourse();
        expect(Preferences.set).toHaveBeenCalledWith(expect.objectContaining({
            key: 'suntrail_recording_start_time'
        }));
        expect(state.recordingStartTime).not.toBeNull();
    });

    it('SHOULD restore startTime from Preferences during init if course is active', async () => {
        const fakeStartTime = 1713170000000;
        (Preferences.get as any).mockResolvedValue({ value: fakeStartTime.toString() });

        await nativeGPSService.init();

        expect(state.recordingStartTime).toBe(fakeStartTime);
    });
});
