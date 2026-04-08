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
});
