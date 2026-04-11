import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPlugin, mockPreferences } = vi.hoisted(() => ({
    mockPlugin: {
        startCourse: vi.fn().mockResolvedValue({ courseId: 'test-course-123' }),
        stopCourse: vi.fn().mockResolvedValue({}),
        getPoints: vi.fn().mockResolvedValue({ points: [] }),
        getCurrentCourse: vi.fn().mockResolvedValue({ courseId: 'test-course-123', isRunning: true }),
        requestBatteryOptimizationExemption: vi.fn().mockResolvedValue({ granted: true }),
        addListener: vi.fn(),
        removeAllListeners: vi.fn()
    },
    mockPreferences: {
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({ value: null }),
        remove: vi.fn().mockResolvedValue(undefined)
    }
}));

// Mock Capacitor before ANY import
vi.mock('@capacitor/core', () => {
    return {
        Capacitor: {
            isNativePlatform: vi.fn(() => true),
            getPlatform: vi.fn(() => 'android')
        },
        registerPlugin: vi.fn(() => mockPlugin)
    };
});

vi.mock('@capacitor/preferences', () => ({
    Preferences: mockPreferences
}));

// Mock terrain
vi.mock('./terrain', () => ({
    updateRecordedTrackMesh: vi.fn()
}));

// NOW import state and service
import { state } from './state';
import { nativeGPSService } from './nativeGPSService';

describe('NativeGPSService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.recordedPoints = [];
        state.isRecording = false;
    });

    it('should handle a complete course lifecycle', async () => {
        // 1. Start course
        const courseId = await nativeGPSService.startCourse({ x: 1, y: 2, z: 3 });
        expect(courseId).toBe('test-course-123');
        expect(mockPlugin.startCourse).toHaveBeenCalled();
        
        // 2. Simulate native points event
        const onNewPointsCall = mockPlugin.addListener.mock.calls.find((call: any) => call[0] === 'onNewPoints');
        expect(onNewPointsCall).toBeDefined();
        if (!onNewPointsCall) throw new Error('onNewPoints listener not registered');
        
        const callback = onNewPointsCall[1];
        const mockPoint = { lat: 46.5, lon: 7.5, alt: 1000, timestamp: Date.now(), accuracy: 5, id: 1 };
        mockPlugin.getPoints.mockResolvedValue({ points: [mockPoint] });

        await callback({ courseId: 'test-course-123', pointCount: 1 });

        expect(state.recordedPoints.length).toBe(1);
        expect(state.recordedPoints[0].lat).toBe(46.5);

        // 3. Stop course
        await nativeGPSService.stopCourse();
        expect(mockPlugin.stopCourse).toHaveBeenCalled();
    });

    it('should request battery optimization exemption', async () => {
        const granted = await nativeGPSService.requestBatteryOptimizationExemption();
        expect(granted).toBe(true);
        expect(mockPlugin.requestBatteryOptimizationExemption).toHaveBeenCalled();
    });

    it('should recover current course state from native', async () => {
        mockPlugin.getCurrentCourse.mockResolvedValue({
            courseId: 'recovered-123',
            isRunning: true,
            originTile: { x: 10, y: 20, z: 13 }
        });

        const course = await nativeGPSService.getCurrentCourse();
        expect(course?.courseId).toBe('recovered-123');
        expect(course?.isRunning).toBe(true);
        expect(course?.originTile).toEqual({ x: 10, y: 20, z: 13 });
    });

    it('should handle native points and auto-pause status (v5.28.1)', async () => {
        await nativeGPSService.startCourse();
        const onNewPointsCall = mockPlugin.addListener.mock.calls.find((call: any) => call[0] === 'onNewPoints');
        expect(onNewPointsCall).toBeDefined();
        if (!onNewPointsCall) throw new Error('Listener not found');
        const callback = onNewPointsCall[1];

        const now = Date.now();
        const p1 = { lat: 46.5, lon: 7.5, alt: 1000, timestamp: now, accuracy: 5, id: 1 };
        const p2 = { lat: 46.6, lon: 7.6, alt: 1100, timestamp: now + 5000, accuracy: 5, id: 2 };

        state.recordedPoints = [];
        mockPlugin.getPoints.mockResolvedValueOnce({ points: [p1] });
        // Simulate event with auto-pause OFF
        await callback({ courseId: 'test-course-123', pointCount: 1, isAutoPaused: false });
        expect(state.recordedPoints.length).toBe(1);
        expect(state.isAutoPaused).toBe(false);

        mockPlugin.getPoints.mockResolvedValueOnce({ points: [p1, p2] });
        // Simulate event with auto-pause ON (immobility detected by native)
        await callback({ courseId: 'test-course-123', pointCount: 2, isAutoPaused: true });
        expect(state.recordedPoints.length).toBe(2); 
        expect(state.isAutoPaused).toBe(true);

        // Deduplication test (still handled by JS)
        mockPlugin.getPoints.mockResolvedValueOnce({ points: [p1, p2] });
        await callback({ courseId: 'test-course-123', pointCount: 2, isAutoPaused: false });
        expect(state.recordedPoints.length).toBe(2); // No new points added
    });
        it('should persist and load track points (v5.28.0)', async () => {
        const mockPoints = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.6, lon: 7.6, alt: 1100, timestamp: 2000 }
        ];

        state.recordedPoints = mockPoints;

        // Test manual load
        mockPreferences.get.mockResolvedValueOnce({ value: JSON.stringify(mockPoints) });
        state.recordedPoints = [];
        await nativeGPSService.loadPersistedPoints();
        expect(state.recordedPoints.length).toBe(2);
        expect(state.recordedPoints[0].lat).toBe(46.5);

        // Test clear on stop
        await nativeGPSService.stopCourse();
        expect(mockPreferences.remove).toHaveBeenCalledWith({ key: 'suntrail_current_track_points' });
        });
        });

