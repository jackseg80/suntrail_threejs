import { describe, it, expect, vi, beforeEach } from 'vitest';

const { 
    mockCapacitor, 
    mockGeolocation, 
    mockNativeGPSService, 
    mockForegroundService, 
    mockFilesystem 
} = vi.hoisted(() => ({
    mockCapacitor: { isNativePlatform: vi.fn(() => true) },
    mockGeolocation: { checkPermissions: vi.fn(), requestPermissions: vi.fn() },
    mockNativeGPSService: { startCourse: vi.fn(), stopCourse: vi.fn(), getCurrentCourse: vi.fn(), requestBatteryOptimizationExemption: vi.fn() },
    mockForegroundService: { startRecordingService: vi.fn(), stopRecordingService: vi.fn(), clearInterruptedRecording: vi.fn() },
    mockFilesystem: { writeFile: vi.fn(), mkdir: vi.fn() }
}));

vi.mock('@capacitor/core', () => ({ Capacitor: mockCapacitor }));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: mockGeolocation }));
vi.mock('@capacitor/filesystem', () => ({ 
    Filesystem: mockFilesystem, 
    Directory: { Documents: 'DOCS', Cache: 'CACHE' }, 
    Encoding: { UTF8: 'utf8' } 
}));
vi.mock('./nativeGPSService', () => ({ nativeGPSService: mockNativeGPSService }));
vi.mock('./foregroundService', () => ({
    startRecordingService: mockForegroundService.startRecordingService,
    stopRecordingService: mockForegroundService.stopRecordingService,
    clearInterruptedRecording: mockForegroundService.clearInterruptedRecording
}));

vi.mock('./gpsDisclosure', () => ({ requestGPSDisclosure: vi.fn(() => Promise.resolve(true)) }));
vi.mock('./geocodingService', () => ({ getPlaceName: vi.fn(() => Promise.resolve('Chamonix')) }));
vi.mock('./toast', () => ({ showToast: vi.fn() }));
vi.mock('./haptics', () => ({ haptic: vi.fn() }));
vi.mock('./terrain', () => ({ addGPXLayer: vi.fn(), updateRecordedTrackMesh: vi.fn(), updateVisibleTiles: vi.fn() }));
vi.mock('./location', () => ({ startLocationTracking: vi.fn(), isWatchActive: vi.fn() }));

import { state } from './state';
import { recordingService } from './recordingService';
import { requestGPSDisclosure } from './gpsDisclosure';

describe('RecordingService (v5.29.36)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.isRecording = false;
        state.recordedPoints = [];
        state.isPro = true;
        mockCapacitor.isNativePlatform.mockReturnValue(true);
        mockNativeGPSService.getCurrentCourse.mockResolvedValue({ courseId: '123' });
        mockNativeGPSService.startCourse.mockResolvedValue({});
        mockForegroundService.startRecordingService.mockResolvedValue({});
    });

    it('doit démarrer l\'enregistrement si permissions OK', async () => {
        mockGeolocation.checkPermissions.mockResolvedValue({ location: 'granted' });
        const success = await recordingService.toggleRecording();
        expect(success).toBe(true);
        expect(state.isRecording).toBe(true);
    });

    it('doit demander les permissions si non accordées', async () => {
        mockGeolocation.checkPermissions.mockResolvedValue({ location: 'prompt' });
        mockGeolocation.requestPermissions.mockResolvedValue({ location: 'granted' });
        await recordingService.toggleRecording();
        expect(mockGeolocation.requestPermissions).toHaveBeenCalled();
    });

    it('doit arrêter et sauvegarder si assez de points', async () => {
        state.isRecording = true;
        state.recordedPoints = [
            { lat: 45, lon: 6, alt: 1000, timestamp: Date.now() - 1000 },
            { lat: 45.1, lon: 6.1, alt: 1100, timestamp: Date.now() }
        ];
        const nameUsed = await recordingService.stopRecording('Ma Trace');
        expect(nameUsed).toBe('Ma Trace');
        expect(state.isRecording).toBe(false);
        expect(mockFilesystem.writeFile).toHaveBeenCalled();
    });
});
