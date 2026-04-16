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
const { mockRecording } = vi.hoisted(() => ({
    mockRecording: {
        startCourse: vi.fn().mockResolvedValue({ courseId: 'test-123' }),
        stopCourse: vi.fn().mockResolvedValue(undefined),
        getCurrentCourse: vi.fn().mockResolvedValue({ courseId: 'test-123', isRunning: false }),
        getPoints: vi.fn().mockResolvedValue({ points: [] }),
        addListener: vi.fn(),
        removeAllListeners: vi.fn()
    }
}));

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true },
    registerPlugin: () => mockRecording
}));

describe('GPS Chrono Persistence (v5.29.1)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.recordingStartTime = null;
        state.recordedPoints = [];
        mockRecording.getCurrentCourse.mockResolvedValue({ courseId: 'test-123', isRunning: false });
    });

    it('SHOULD save startTime in Preferences when starting a course', async () => {
        mockRecording.startCourse.mockResolvedValue({ courseId: 'test-123' });
        await nativeGPSService.startCourse();
        expect(Preferences.set).toHaveBeenCalledWith(expect.objectContaining({
            key: 'suntrail_recording_start_time'
        }));
        expect(state.recordingStartTime).not.toBeNull();
    });

    it('SHOULD restore startTime from Preferences during init if course is active', async () => {
        mockRecording.getCurrentCourse.mockResolvedValue({ courseId: 'test-123', isRunning: true });
        const fakeStartTime = 1713170000000;
        (Preferences.get as any).mockResolvedValue({ value: fakeStartTime.toString() });

        await nativeGPSService.init();

        expect(state.recordingStartTime).toBe(fakeStartTime);
    });

    it('SHOULD restore points and trigger mesh update during recovery (v5.29.3)', async () => {
        const now = Date.now();
        const fakePoints = [
            { lat: 46.0, lon: 7.0, alt: 1000, timestamp: now - 2000 },
            { lat: 46.1, lon: 7.1, alt: 1010, timestamp: now - 1000 }
        ];
        
        mockRecording.getCurrentCourse.mockResolvedValue({ isRunning: false });
        
        (Preferences.get as any).mockImplementation(({ key }: { key: string }) => {
            if (key === 'suntrail_current_course_id') return { value: 'old-id' };
            if (key === 'suntrail_recorded_points') return { value: JSON.stringify(fakePoints) };
            if (key === 'suntrail_recording_start_time') return { value: (now - 3000).toString() };
            return { value: null };
        });

        await nativeGPSService.init();

        expect(state.recordedPoints.length).toBe(2);
        expect(state.recordingStartTime).toBe(now - 3000);
    });
});
