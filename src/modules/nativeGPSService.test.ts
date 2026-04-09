import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPlugin } = vi.hoisted(() => ({
    mockPlugin: {
        startCourse: vi.fn().mockResolvedValue({ courseId: 'test-course-123' }),
        stopCourse: vi.fn().mockResolvedValue({}),
        getPoints: vi.fn().mockResolvedValue({ points: [] }),
        getCurrentCourse: vi.fn().mockResolvedValue({ courseId: 'test-course-123', isRunning: true }),
        requestBatteryOptimizationExemption: vi.fn().mockResolvedValue({ granted: true }),
        addListener: vi.fn(),
        removeAllListeners: vi.fn()
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
        if (!onNewPointsCall) return;
        
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

    it('should filter out points with sudden altitude jumps (>200m)', async () => {
        // Must start course to register listeners
        await nativeGPSService.startCourse();

        const onNewPointsCall = mockPlugin.addListener.mock.calls.find((call: any) => call[0] === 'onNewPoints');
        expect(onNewPointsCall).toBeDefined();
        const callback = onNewPointsCall[1];
        
        const now = Date.now();
        const p1 = { lat: 46.5, lon: 7.5, alt: 1000, timestamp: now, accuracy: 5, id: 1 };
        const p2 = { lat: 46.5, lon: 7.5, alt: 1300, timestamp: now + 5000, accuracy: 5, id: 2 }; // Jump +300m -> Reject
        const p3 = { lat: 46.5, lon: 7.5, alt: 1050, timestamp: now + 10000, accuracy: 5, id: 3 }; // Jump +50m -> Accept

        mockPlugin.getPoints.mockResolvedValueOnce({ points: [p1] });
        await callback({ courseId: 'test-course-123', pointCount: 1 });
        expect(state.recordedPoints.length).toBe(1);
        expect(state.recordedPoints[0].alt).toBe(1000);

        mockPlugin.getPoints.mockResolvedValueOnce({ points: [p1, p2] });
        await callback({ courseId: 'test-course-123', pointCount: 2 });
        expect(state.recordedPoints.length).toBe(1); // p2 rejected

        mockPlugin.getPoints.mockResolvedValueOnce({ points: [p1, p2, p3] });
        await callback({ courseId: 'test-course-123', pointCount: 3 });
        expect(state.recordedPoints.length).toBe(2); // p3 accepted (delta relative to p1)
        expect(state.recordedPoints[1].alt).toBe(1050);
    });
});
