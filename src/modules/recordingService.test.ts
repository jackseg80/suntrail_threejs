import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
    mockCapacitor,
    mockGeolocation,
    mockNativeGPSService,
    mockForegroundService,
    mockFilesystem,
} = vi.hoisted(() => ({
    mockCapacitor: { isNativePlatform: vi.fn(() => true) },
    mockGeolocation: { checkPermissions: vi.fn(), requestPermissions: vi.fn() },
    mockNativeGPSService: {
        startCourse: vi.fn(),
        stopCourse: vi.fn(),
        getCurrentCourse: vi.fn(),
        requestBatteryOptimizationExemption: vi.fn(),
        saveTextToDownloads: vi.fn(),
    },
    mockForegroundService: {
        startRecordingService: vi.fn(),
        stopRecordingService: vi.fn(),
        clearInterruptedRecording: vi.fn(),
    },
    mockFilesystem: { writeFile: vi.fn(), mkdir: vi.fn() },
}));

vi.mock('@capacitor/core', () => ({ Capacitor: mockCapacitor }));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: mockGeolocation }));
vi.mock('@capacitor/filesystem', () => ({
    Filesystem: mockFilesystem,
    Directory: { Documents: 'DOCS', Cache: 'CACHE' },
    Encoding: { UTF8: 'utf8' },
}));
vi.mock('./nativeGPSService', () => ({
    nativeGPSService: mockNativeGPSService,
}));
vi.mock('./foregroundService', () => ({
    startRecordingService: mockForegroundService.startRecordingService,
    stopRecordingService: mockForegroundService.stopRecordingService,
    clearInterruptedRecording: mockForegroundService.clearInterruptedRecording,
}));

vi.mock('./gpsDisclosure', () => ({
    requestGPSDisclosure: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('./geocodingService', () => ({
    getPlaceName: vi.fn(() => Promise.resolve('Chamonix')),
}));
vi.mock('./toast', () => ({ showToast: vi.fn() }));
vi.mock('./haptics', () => ({ haptic: vi.fn() }));
vi.mock('./terrain', () => ({
    addGPXLayer: vi.fn(),
    updateRecordedTrackMesh: vi.fn(),
    updateVisibleTiles: vi.fn(),
}));
vi.mock('./location', () => ({
    startLocationTracking: vi.fn(),
    isWatchActive: vi.fn(),
}));

import { state } from './state';
import { recordingService } from './recordingService';
import { getPlaceName } from './geocodingService';

describe('RecordingService (v5.29.36)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.isRecording = false;
        state.recordedPoints = [];
        state.isPro = true;
        mockCapacitor.isNativePlatform.mockReturnValue(true);
        mockNativeGPSService.getCurrentCourse.mockResolvedValue({
            courseId: '123',
        });
        mockNativeGPSService.startCourse.mockResolvedValue({});
        mockForegroundService.startRecordingService.mockResolvedValue({});
    });

    it("doit démarrer l'enregistrement si permissions OK", async () => {
        mockGeolocation.checkPermissions.mockResolvedValue({
            location: 'granted',
        });
        const success = await recordingService.toggleRecording();
        expect(success).toBe(true);
        expect(state.isRecording).toBe(true);
    });

    it('doit demander les permissions si non accordées', async () => {
        mockGeolocation.checkPermissions.mockResolvedValue({
            location: 'prompt',
        });
        mockGeolocation.requestPermissions.mockResolvedValue({
            location: 'granted',
        });
        await recordingService.toggleRecording();
        expect(mockGeolocation.requestPermissions).toHaveBeenCalled();
    });

    it('doit arrêter et sauvegarder si assez de points', async () => {
        state.isRecording = true;
        state.recordedPoints = [
            { lat: 45, lon: 6, alt: 1000, timestamp: Date.now() - 1000 },
            { lat: 45.1, lon: 6.1, alt: 1100, timestamp: Date.now() },
        ];
        const nameUsed = await recordingService.stopRecording('Ma Trace');
        expect(nameUsed).toBe('Ma Trace');
        expect(state.isRecording).toBe(false);
        expect(mockNativeGPSService.stopCourse).toHaveBeenCalledTimes(1);
        expect(
            mockForegroundService.stopRecordingService
        ).toHaveBeenCalledTimes(1);
        expect(mockFilesystem.writeFile).toHaveBeenCalled();
    });

    it('ne doit pas sauvegarder deux fois — verrou _isSaving', async () => {
        state.isRecording = true;
        state.recordedPoints = [
            { lat: 45, lon: 6, alt: 1000, timestamp: Date.now() - 1000 },
            { lat: 45.1, lon: 6.1, alt: 1100, timestamp: Date.now() },
        ];
        const [r1, r2] = await Promise.all([
            recordingService.stopRecording('Test'),
            recordingService.stopRecording('Double'),
        ]);
        expect(r1).toBe('Test');
        expect(r2).toBe('');
        expect(mockFilesystem.writeFile).toHaveBeenCalledTimes(1);
    });

    it("bloque l'export Free avant toute écriture/cache", async () => {
        state.isPro = false;
        state.recordedPoints = [
            { lat: 45, lon: 6, alt: 1000, timestamp: Date.now() - 1000 },
            { lat: 45.1, lon: 6.1, alt: 1100, timestamp: Date.now() },
        ];

        await expect(
            recordingService.saveToFile('Trace Free')
        ).resolves.toBeNull();
        expect(mockFilesystem.writeFile).not.toHaveBeenCalled();
    });

    it('exporte le GPX Android dans Téléchargements avant le repli Documents', async () => {
        mockNativeGPSService.saveTextToDownloads.mockResolvedValue('Trace.gpx');
        state.recordedPoints = [
            { lat: 45, lon: 6, alt: 1000, timestamp: Date.now() - 1000 },
            { lat: 45.1, lon: 6.1, alt: 1100, timestamp: Date.now() },
        ];

        await expect(recordingService.saveToFile('Trace')).resolves.toMatch(
            /\.gpx$/
        );
        expect(mockNativeGPSService.saveTextToDownloads).toHaveBeenCalledWith(
            expect.stringMatching(/^Trace-\d+\.gpx$/),
            expect.stringContaining('<gpx')
        );
        expect(mockFilesystem.writeFile).not.toHaveBeenCalled();
    });

    it('conserve la sauvegarde interne REC en Free sans exporter de fichier', async () => {
        state.isPro = false;
        state.isRecording = true;
        state.recordedPoints = [
            { lat: 45, lon: 6, alt: 1000, timestamp: Date.now() - 1000 },
            { lat: 45.1, lon: 6.1, alt: 1100, timestamp: Date.now() },
        ];

        await expect(
            recordingService.stopRecording('Ma Trace Free')
        ).resolves.toBe('Ma Trace Free');
        expect(mockFilesystem.writeFile).not.toHaveBeenCalled();
        expect(state.isRecording).toBe(false);
    });

    it('permet de ne pas enregistrer un REC déjà arrêté', async () => {
        state.isRecording = true;
        state.recordedPoints = [
            { lat: 45, lon: 6, alt: 1000, timestamp: Date.now() - 1000 },
            { lat: 45.1, lon: 6.1, alt: 1100, timestamp: Date.now() },
        ];

        await expect(
            recordingService.stopRecording(undefined, {
                resolveName: async () => null,
            })
        ).resolves.toBe('');

        expect(state.recordedPoints).toEqual([]);
        expect(mockFilesystem.writeFile).not.toHaveBeenCalled();
        expect(mockNativeGPSService.stopCourse).toHaveBeenCalledTimes(1);
    });

    it('uses a readable suggested REC name without replacing accents', async () => {
        (getPlaceName as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
            'Évian-les-Bains'
        );
        const name = await recordingService.generateSuggestedName([
            { lat: 45, lon: 6, alt: 1000, timestamp: Date.now() - 1000 },
            { lat: 45.1, lon: 6.1, alt: 1100, timestamp: Date.now() },
        ]);

        expect(name).toContain('Évian-les-Bains');
        expect(name).toMatch(
            /^Évian-les-Bains · \d{4}-\d{2}-\d{2} \d{2}h\d{2} · SunTrail$/
        );
        expect(name).not.toContain('_');
    });
});
