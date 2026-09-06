import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
    mockCapacitor,
    mockGeolocation,
    mockNativeGPSService,
    mockForegroundService,
    mockFilesystem,
    mockTrackService,
} = vi.hoisted(() => ({
    mockCapacitor: { isNativePlatform: vi.fn(() => true) },
    mockGeolocation: { checkPermissions: vi.fn(), requestPermissions: vi.fn() },
    mockNativeGPSService: {
        startCourse: vi.fn(),
        stopCourse: vi.fn(),
        getCurrentCourse: vi.fn(),
        requestBatteryOptimizationExemption: vi.fn(),
        saveTextToDownloads: vi.fn(),
        acknowledgeFinalizedCourse: vi.fn(),
        getAllPoints: vi.fn(),
    },
    mockForegroundService: {
        startRecordingService: vi.fn(),
        stopRecordingService: vi.fn(),
        clearInterruptedRecording: vi.fn(),
    },
    mockFilesystem: { writeFile: vi.fn(), mkdir: vi.fn() },
    mockTrackService: {
        archiveRecording: vi.fn(),
        archiveRecoveredRecording: vi.fn(),
        archiveWebRecording: vi.fn(),
    },
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
vi.mock('./tracks/trackService', () => ({ trackService: mockTrackService }));
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
        state.currentCourseId = '';
        state.isPro = true;
        mockCapacitor.isNativePlatform.mockReturnValue(true);
        mockNativeGPSService.getCurrentCourse.mockResolvedValue({
            courseId: '123',
        });
        mockNativeGPSService.startCourse.mockResolvedValue({});
        mockNativeGPSService.stopCourse.mockResolvedValue({
            courseId: '',
            points: [],
        });
        mockNativeGPSService.acknowledgeFinalizedCourse.mockResolvedValue(
            undefined
        );
        mockTrackService.archiveWebRecording.mockResolvedValue({});
        mockTrackService.archiveRecording.mockResolvedValue({});
        mockTrackService.archiveRecoveredRecording.mockResolvedValue({});
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

    it('archives le REC Room avec courseId avant de nettoyer la session native', async () => {
        state.currentCourseId = 'course-durable';
        state.recordedPoints = [
            { lat: 45, lon: 6, alt: 1000, timestamp: 1_000 },
            { lat: 45.1, lon: 6.1, alt: 1100, timestamp: 2_000 },
        ];
        const rawPoints = [
            {
                id: 1,
                lat: 45,
                lon: 6,
                alt: 1000,
                timestamp: 1_000,
                accuracy: 4,
            },
            {
                id: 2,
                lat: 45.1,
                lon: 6.1,
                alt: 1100,
                timestamp: 2_000,
                accuracy: 5,
            },
        ];
        mockNativeGPSService.stopCourse.mockResolvedValue({
            courseId: 'course-durable',
            points: rawPoints,
        });

        await recordingService.stopRecording('REC durable');

        expect(mockTrackService.archiveRecording).toHaveBeenCalledWith(
            'REC durable',
            'course-durable',
            rawPoints
        );
        expect(
            mockTrackService.archiveRecording.mock.invocationCallOrder[0]
        ).toBeLessThan(
            mockNativeGPSService.acknowledgeFinalizedCourse.mock
                .invocationCallOrder[0]
        );
    });

    it.each([false, true])(
        'exports the finalized native points including an intermediate and last fix (notification=%s)',
        async (notification) => {
            const points = [1000, 2000, 3000, 4000].map((timestamp, id) => ({
                id: id + 1,
                lat: 45 + id * 0.001,
                lon: 6,
                alt: 1000 + id,
                timestamp,
                accuracy: 4,
            }));
            state.isRecording = true;
            state.currentCourseId = 'finalized';
            state.recordedPoints = [points[0], points[2]];
            mockNativeGPSService.stopCourse.mockResolvedValue({
                courseId: 'finalized',
                points,
            });
            mockNativeGPSService.getAllPoints.mockResolvedValue(points);
            await recordingService.stopRecording('Finalized', {
                nativeAlreadyStopped: notification,
            });
            expect(recordingService.getLastStopOutcome()).toBe('saved');
            const xml =
                mockNativeGPSService.saveTextToDownloads.mock.calls[0][1];
            const doc = new DOMParser().parseFromString(xml, 'application/xml');
            expect(
                [...doc.querySelectorAll('trkpt')].map((p) => ({
                    lat: Number(p.getAttribute('lat')),
                    time: Date.parse(p.querySelector('time')!.textContent!),
                }))
            ).toEqual(points.map((p) => ({ lat: p.lat, time: p.timestamp })));
            expect(mockTrackService.archiveRecording).toHaveBeenCalledWith(
                'Finalized',
                'finalized',
                points
            );
        }
    );

    it('saves a native REC even if the WebView had received only one point at STOP', async () => {
        const points = [1000, 2000, 3000].map((timestamp, id) => ({
            id: id + 1,
            lat: 45 + id * 0.001,
            lon: 6,
            alt: 1000,
            timestamp,
            accuracy: 4,
        }));
        state.isRecording = true;
        state.currentCourseId = 'late-batch';
        state.recordedPoints = [points[0]];
        mockNativeGPSService.stopCourse.mockResolvedValue({
            courseId: 'late-batch',
            points,
        });
        await recordingService.stopRecording('Late batch');
        expect(recordingService.getLastStopOutcome()).toBe('saved');
        expect(mockTrackService.archiveRecording).toHaveBeenCalledWith(
            'Late batch',
            'late-batch',
            points
        );
        expect(
            mockTrackService.archiveRecording.mock.invocationCallOrder[0]
        ).toBeLessThan(
            mockNativeGPSService.acknowledgeFinalizedCourse.mock
                .invocationCallOrder[0]
        );
    });

    it('préserve points et marqueur natif si le stockage durable échoue', async () => {
        state.currentCourseId = 'course-quota';
        state.recordedPoints = [
            { lat: 45, lon: 6, alt: 1000, timestamp: 1_000 },
            { lat: 45.1, lon: 6.1, alt: 1100, timestamp: 2_000 },
        ];
        mockNativeGPSService.stopCourse.mockResolvedValue({
            courseId: 'course-quota',
            points: [],
        });
        mockTrackService.archiveRecoveredRecording.mockRejectedValue(
            new DOMException('full', 'QuotaExceededError')
        );

        await expect(
            recordingService.stopRecording('REC à récupérer')
        ).resolves.toBe('');
        expect(recordingService.getLastStopOutcome()).toBe('failed');
        expect(state.recordedPoints).toHaveLength(2);
        expect(
            mockNativeGPSService.acknowledgeFinalizedCourse
        ).not.toHaveBeenCalled();
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

    it('can stop another recording after discarding the previous one', async () => {
        const points = [
            { lat: 45, lon: 6, alt: 1000, timestamp: 1000 },
            { lat: 45.1, lon: 6.1, alt: 1100, timestamp: 2000 },
        ];
        // A fresh instance keeps this regression independent of prior tests.
        const { RecordingService } = await import('./recordingService');
        const service = new RecordingService();
        state.isRecording = true;
        state.recordedPoints = [...points];
        await service.stopRecording(undefined, {
            resolveName: async () => null,
        });
        state.isRecording = true;
        state.recordedPoints = [...points];
        await service.stopRecording('Second REC');
        expect(mockNativeGPSService.stopCourse).toHaveBeenCalledTimes(2);
        expect(state.isRecording).toBe(false);
        expect(service.getLastStopOutcome()).toBe('saved');
    });
});
