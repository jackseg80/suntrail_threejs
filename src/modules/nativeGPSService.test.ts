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

    it('should correctly filter GPS points (Altitude, (0,0), and Jumps)', async () => {
        await nativeGPSService.startCourse();
        const onNewPointsCall = mockPlugin.addListener.mock.calls.find((call: any) => call[0] === 'onNewPoints');
        expect(onNewPointsCall).toBeDefined();
        const callback = onNewPointsCall[1];

        const now = Date.now();
        
        // --- 1. Altitude Jump ---
        const p1 = { lat: 46.5, lon: 7.5, alt: 1000, timestamp: now, accuracy: 5, id: 1 };
        const p2 = { lat: 46.5, lon: 7.5, alt: 1300, timestamp: now + 5000, accuracy: 5, id: 2 }; // Jump +300m -> Reject
        const p3 = { lat: 46.5001, lon: 7.5001, alt: 1050, timestamp: now + 10000, accuracy: 5, id: 3 }; // Jump +50m AND move ~15m -> Accept

        state.recordedPoints = [];
        mockPlugin.getPoints.mockResolvedValueOnce({ points: [p1] });
        await callback({ courseId: 'test-course-123', pointCount: 1 });
        expect(state.recordedPoints.length).toBe(1);

        mockPlugin.getPoints.mockResolvedValueOnce({ points: [p1, p2] });
        await callback({ courseId: 'test-course-123', pointCount: 2 });
        expect(state.recordedPoints.length).toBe(1); // p2 rejected

        mockPlugin.getPoints.mockResolvedValueOnce({ points: [p1, p2, p3] });
        await callback({ courseId: 'test-course-123', pointCount: 3 });
        expect(state.recordedPoints.length).toBe(2); 

        // --- 2. (0,0) and Horizontal Jump ---
        const pZero = { lat: 0, lon: 0, alt: 1050, timestamp: now + 15000, accuracy: 5, id: 4 }; // (0,0) -> Reject
        const pJump = { lat: 47.5, lon: 8.5, alt: 1050, timestamp: now + 16000, accuracy: 5, id: 5 }; // ~130km jump in 1s (since pZero is rejected, delta is relative to p3 which is at now+10000 -> 6s delta) -> Reject
        const pValid = { lat: 46.5002, lon: 7.5002, alt: 1050, timestamp: now + 25000, accuracy: 5, id: 6 }; // Valid -> Accept

        mockPlugin.getPoints.mockResolvedValueOnce({ points: [p1, p2, p3, pZero] });
        await callback({ courseId: 'test-course-123', pointCount: 4 });
        expect(state.recordedPoints.length).toBe(2);

        mockPlugin.getPoints.mockResolvedValueOnce({ points: [p1, p2, p3, pZero, pJump] });
        await callback({ courseId: 'test-course-123', pointCount: 5 });
        expect(state.recordedPoints.length).toBe(2); // Jump rejected (130km in 6s is too much)

        // Test absolute safety (500km) even if timeDelta is large
        const pExtreme = { lat: 55.0, lon: 20.0, alt: 1050, timestamp: now + 100000, accuracy: 5, id: 7 }; // ~1500km jump
        mockPlugin.getPoints.mockResolvedValueOnce({ points: [p1, p2, p3, pZero, pJump, pExtreme] });
        await callback({ courseId: 'test-course-123', pointCount: 6 });
        expect(state.recordedPoints.length).toBe(2); // Extreme rejected

        mockPlugin.getPoints.mockResolvedValueOnce({ points: [p1, p2, p3, pZero, pJump, pExtreme, pValid] });
        await callback({ courseId: 'test-course-123', pointCount: 7 });
        expect(state.recordedPoints.length).toBe(3); // Valid accepted

        // --- 3. Auto-Pause (v5.28.0) ---
        // Reset recorded points to avoid noise from previous steps
        state.recordedPoints = [{ lat: 46.5002, lon: 7.5002, alt: 1050, timestamp: now + 25000 }];
        const pStill = { lat: 46.500201, lon: 7.500201, alt: 1050, timestamp: now + 30000, accuracy: 5, id: 8 }; // Only 10cm move
        mockPlugin.getPoints.mockResolvedValueOnce({ points: [pStill] });
        await callback({ courseId: 'test-course-123', pointCount: 1 });
        expect(state.recordedPoints.length).toBe(1); // pStill rejected
        expect(state.isAutoPaused).toBe(true);

        const pMoving = { lat: 46.5003, lon: 7.5003, alt: 1050, timestamp: now + 35000, accuracy: 5, id: 9 }; // > 10m move
        mockPlugin.getPoints.mockResolvedValueOnce({ points: [pStill, pMoving] });
        await callback({ courseId: 'test-course-123', pointCount: 2 });
        expect(state.recordedPoints.length).toBe(2); // pMoving accepted
        expect(state.isAutoPaused).toBe(false);
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

