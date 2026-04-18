import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks for Capacitor
const { mockPreferences, mockRecordingNative } = vi.hoisted(() => ({
    mockPreferences: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn()
    },
    mockRecordingNative: {
        getCurrentCourse: vi.fn(),
        startCourse: vi.fn(),
        stopCourse: vi.fn(),
        getPoints: vi.fn(),
        requestBatteryOptimizationExemption: vi.fn(),
        updateNotificationStats: vi.fn(),
        addListener: vi.fn(() => Promise.resolve({ remove: () => {} })),
        removeAllListeners: vi.fn()
    }
}));

vi.mock('@capacitor/preferences', () => ({ Preferences: mockPreferences }));
vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true },
    registerPlugin: () => mockRecordingNative
}));

// Mock RecordingService to avoid circular dependency
vi.mock('./recordingService', () => ({
    recordingService: { stopRecording: vi.fn() }
}));

import { state } from './state';
import { nativeGPSService } from './nativeGPSService';

describe('NativeGPSService (v5.29.38)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.recordedPoints = [];
        state.isRecording = false;
        mockPreferences.get.mockResolvedValue({ value: null });
        mockRecordingNative.getCurrentCourse.mockResolvedValue({ isRunning: false });
    });

    it('should initialize correctly and recover active course', async () => {
        mockRecordingNative.getCurrentCourse.mockResolvedValue({ 
            isRunning: true, 
            courseId: 'active-123',
            originTile: { x: 1, y: 2, z: 13 }
        });
        mockRecordingNative.getPoints.mockResolvedValue({ points: [] });

        await nativeGPSService.init();

        expect(state.isRecording).toBe(true);
        expect(state.currentCourseId).toBe('active-123');
        expect(state.originTile).toEqual({ x: 1, y: 2, z: 13 });
    });

    it('should start a new course', async () => {
        mockRecordingNative.startCourse.mockResolvedValue({ courseId: 'new-456' });

        const courseId = await nativeGPSService.startCourse({ x: 10, y: 20, z: 13 });

        expect(courseId).toBe('new-456');
        expect(state.isRecording).toBe(true);
        expect(mockPreferences.set).toHaveBeenCalled();
    });

    it('should filter points with sudden altitude jumps', () => {
        const points = [
            { id: 1, lat: 45, lon: 6, alt: 1000, timestamp: 10000, accuracy: 5 },
            { id: 2, lat: 45, lon: 6, alt: 1500, timestamp: 12000, accuracy: 5 } // Jump +500m in 2s
        ];

        // Access private method via casting for testing
        const filtered = (nativeGPSService as any).filterPointsConsistency(points);
        
        expect(filtered.length).toBe(1);
        expect(filtered[0].alt).toBe(1000);
    });
});
