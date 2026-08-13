import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks for Capacitor
const { mockPreferences, mockRecordingNative } = vi.hoisted(() => ({
    mockPreferences: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
    },
    mockRecordingNative: {
        getCurrentCourse: vi.fn(),
        startCourse: vi.fn(),
        stopCourse: vi.fn(),
        getPoints: vi.fn(),
        requestBatteryOptimizationExemption: vi.fn(),
        updateNotificationStats: vi.fn(),
        addListener: vi.fn(() => Promise.resolve({ remove: () => {} })),
        removeAllListeners: vi.fn(),
    },
}));

vi.mock('@capacitor/preferences', () => ({ Preferences: mockPreferences }));
vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true },
    registerPlugin: () => mockRecordingNative,
}));

// Mock RecordingService to avoid circular dependency
vi.mock('./recordingService', () => ({
    recordingService: { stopRecording: vi.fn() },
}));

import { state } from './state';
import { nativeGPSService } from './nativeGPSService';
import type { NativeGPSPoint } from './nativeGPSService';

describe('NativeGPSService (v5.29.38)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.clearAllTimers();
        state.recordedPoints = [];
        state.isRecording = false;
        mockPreferences.get.mockResolvedValue({ value: null });
        mockRecordingNative.getCurrentCourse.mockResolvedValue({
            isRunning: false,
        });
        (nativeGPSService as any)._syncing = false;
        (nativeGPSService as any).pointPersistPending = false;
        (nativeGPSService as any).pointPersistTimeout = null;
        (nativeGPSService as any).pointPersistFlush = null;
    });

    it('should initialize correctly and recover active course', async () => {
        mockRecordingNative.getCurrentCourse.mockResolvedValue({
            isRunning: true,
            courseId: 'active-123',
            originTile: { x: 1, y: 2, z: 13 },
        });
        mockRecordingNative.getPoints.mockResolvedValue({ points: [] });

        await nativeGPSService.init();

        expect(state.isRecording).toBe(true);
        expect(state.currentCourseId).toBe('active-123');
        expect(state.originTile).toEqual({ x: 1, y: 2, z: 13 });
    });

    it('should start a new course', async () => {
        mockRecordingNative.startCourse.mockResolvedValue({
            courseId: 'new-456',
        });

        const courseId = await nativeGPSService.startCourse({
            x: 10,
            y: 20,
            z: 13,
        });

        expect(courseId).toBe('new-456');
        expect(state.isRecording).toBe(true);
        expect(mockPreferences.set).toHaveBeenCalled();
    });

    it('stops notification updates before stopping the native course', async () => {
        const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
        (nativeGPSService as any).currentCourseId = null;
        (nativeGPSService as any).statsUpdateInterval = 123;
        state.currentCourseId = 'active-123';
        state.isRecording = true;

        await nativeGPSService.stopCourse();

        expect(clearIntervalSpy).toHaveBeenCalledWith(123);
        expect(mockRecordingNative.stopCourse).toHaveBeenCalledTimes(1);
        expect(state.currentCourseId).toBe('');
        expect(state.isRecording).toBe(false);
        clearIntervalSpy.mockRestore();
    });

    it('should filter points with sudden altitude jumps', () => {
        const points = [
            {
                id: 1,
                lat: 45,
                lon: 6,
                alt: 1000,
                timestamp: 10000,
                accuracy: 5,
            },
            {
                id: 2,
                lat: 45,
                lon: 6,
                alt: 1500,
                timestamp: 12000,
                accuracy: 5,
            }, // Jump +500m in 2s
        ];

        // Access private method via casting for testing
        const filtered = (nativeGPSService as any).filterPointsConsistency(
            points
        );

        expect(filtered.length).toBe(1);
        expect(filtered[0].alt).toBe(1000);
    });
});

describe('NativeGPSService syncPoints (v5.76.0)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.clearAllTimers();
        state.recordedPoints = [];
        state.isRecording = false;
        (nativeGPSService as any)._syncing = false;
        (nativeGPSService as any).currentCourseId = 'test-course';
        (nativeGPSService as any).pointPersistPending = false;
        (nativeGPSService as any).pointPersistTimeout = null;
        (nativeGPSService as any).pointPersistFlush = null;
        mockPreferences.get.mockResolvedValue({ value: null });
    });

    function makeNativePoints(
        pts: Array<{ lat: number; lon: number; alt: number; timestamp: number }>
    ): NativeGPSPoint[] {
        return pts.map((p, i) => ({ id: i + 1, accuracy: 5, ...p }));
    }

    it('should only clean new points, not the full dataset', async () => {
        state.recordedPoints = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 1005, timestamp: 20000 },
            { lat: 46.5002, lon: 7.5002, alt: 1010, timestamp: 30000 },
        ];

        mockRecordingNative.getPoints.mockResolvedValue({
            points: makeNativePoints([
                { lat: 46.5003, lon: 7.5003, alt: 1015, timestamp: 40000 },
                { lat: 46.5004, lon: 7.5004, alt: 1020, timestamp: 50000 },
            ]),
        });

        await (nativeGPSService as any).syncPoints();

        expect(state.recordedPoints.length).toBe(5);
        expect(state.recordedPoints[4].timestamp).toBe(50000);
    });

    it('should block concurrent syncPoints calls', async () => {
        state.recordedPoints = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
        ];

        let resolveFirst: (v: any) => void;
        const firstCall = new Promise<any>((r) => {
            resolveFirst = r;
        });
        mockRecordingNative.getPoints.mockReturnValueOnce(firstCall);

        const sync1 = (nativeGPSService as any).syncPoints();
        const sync2 = (nativeGPSService as any).syncPoints();

        resolveFirst!({ points: [] });

        await sync1;
        await sync2;

        // getPoints should have been called only once (sync2 skipped)
        expect(mockRecordingNative.getPoints).toHaveBeenCalledTimes(1);
    });

    it('should normalize NativeGPSPoint to LocationPoint', () => {
        const newPoints = makeNativePoints([
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 1010, timestamp: 20000 },
        ]);

        const cleaned = (nativeGPSService as any).cleanNewPoints(newPoints);

        expect(cleaned.length).toBeGreaterThan(0);
        for (const p of cleaned) {
            expect(p).toHaveProperty('lat');
            expect(p).toHaveProperty('lon');
            expect(p).toHaveProperty('alt');
            expect(p).toHaveProperty('timestamp');
            expect(p).not.toHaveProperty('id');
            expect(p).not.toHaveProperty('accuracy');
        }
    });

    it('debounces the Preferences recovery snapshot', async () => {
        vi.useFakeTimers();
        state.recordedPoints = Array.from({ length: 10 }, (_, index) => ({
            lat: 46.5 + index * 0.0001,
            lon: 7.5 + index * 0.0001,
            alt: 1000 + index,
            timestamp: (index + 1) * 10_000,
        }));
        mockRecordingNative.getPoints.mockResolvedValue({
            points: makeNativePoints([
                {
                    lat: 46.5011,
                    lon: 7.5011,
                    alt: 1011,
                    timestamp: 110_000,
                },
            ]),
        });

        await nativeGPSService.syncPoints();
        expect(mockPreferences.set).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(15_000);
        expect(mockPreferences.set).toHaveBeenCalledOnce();
        expect(mockPreferences.set).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'suntrail_recorded_points' })
        );
        vi.useRealTimers();
    });

    it('should handle boundary between existing and new points', () => {
        state.recordedPoints = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 1005, timestamp: 20000 },
        ];

        const newPoints = makeNativePoints([
            { lat: 46.5002, lon: 7.5002, alt: 1500, timestamp: 21000 },
            { lat: 46.5003, lon: 7.5003, alt: 1010, timestamp: 30000 },
        ]);

        const cleaned = (nativeGPSService as any).cleanNewPoints(newPoints);

        const timestamps = cleaned.map((p: any) => p.timestamp);
        expect(timestamps).not.toContain(21000);
        expect(timestamps).toContain(30000);
    });
});
