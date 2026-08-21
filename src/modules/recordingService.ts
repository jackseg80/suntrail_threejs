/**
 * recordingService.ts — Centralized GPS recording logic (v5.29.36)
 *
 * Extracts business logic from TrackSheet.ts to enable unit testing.
 * Orchestrates nativeGPSService, foregroundService and GPX generation.
 */

import { state, isProActive } from './state';
import { showToast } from './toast';
import { startLocationTracking } from './location';
import { haptic } from './haptics';
import { i18n } from '../i18n/I18nService';
import {
    startRecordingService,
    stopRecordingService,
} from './foregroundService';
import { nativeGPSService } from './nativeGPSService';
import { STORAGE_KEYS } from '../constants/storage';
import { addGPXLayer, updateRecordedTrackMesh } from './gpxLayers';
import { requestGPSDisclosure } from './gpsDisclosure';
import { getPlaceName } from './geocodingService';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Geolocation } from '@capacitor/geolocation';
import { eventBus } from './eventBus';
import { buildRecordingSummary } from './outing/outingDashboard';
import { normalizeTrackName, toGPXFilename } from './trackName';

export class RecordingService {
    private _isSaving = false;

    /**
     * Toggles recording state and orchestrates necessary services.
     */
    async toggleRecording(): Promise<boolean> {
        state.isRecording = !state.isRecording;

        if (state.isRecording) {
            return await this.startRecording();
        } else {
            const name = await this.stopRecording();
            return !!name;
        }
    }

    private async startRecording(): Promise<boolean> {
        // Prominent Disclosure GPS (Play Store requirement)
        const allowed = await requestGPSDisclosure();
        if (!allowed) {
            state.isRecording = false;
            return false;
        }

        // Check/Request OS permissions
        if (Capacitor.isNativePlatform()) {
            let perms = await Geolocation.checkPermissions();
            if (perms.location !== 'granted') {
                perms = await Geolocation.requestPermissions({
                    permissions: ['location'],
                });
            }
            if (perms.location !== 'granted') {
                state.isRecording = false;
                showToast(i18n.t('gps.toast.permissionDenied'));
                return false;
            }
        }

        showToast(i18n.t('track.toast.recStarted'));

        // Demander l'exemption batterie une seule fois (opt-in, dialogue Android)
        // Évite que Samsung/Xiaomi/OPPO tuent RecordingService pendant les longues randos
        if (Capacitor.isNativePlatform()) {
            const asked = localStorage.getItem(STORAGE_KEYS.BATTERY_EXEMPTION);
            if (!asked) {
                localStorage.setItem(STORAGE_KEYS.BATTERY_EXEMPTION, '1');
                void nativeGPSService.requestBatteryOptimizationExemption();
            }
        }

        // Start native services
        try {
            await nativeGPSService.startCourse(state.originTile);
            const nativeCourse = await nativeGPSService.getCurrentCourse();
            if (nativeCourse?.courseId) {
                state.currentCourseId = nativeCourse.courseId;
            }

            await startRecordingService(state.originTile);
            if (!state.isFollowingUser) await startLocationTracking();

            state.recordedPoints = [];
            updateRecordedTrackMesh();
            return true;
        } catch (e) {
            console.error('[RecordingService] Failed to start:', e);
            state.isRecording = false;
            showToast("⚠️ Erreur au démarrage de l'enregistrement");
            return false;
        }
    }

    /**
     * Stops the current recording.
     * @param customName Optional name provided by user
     * @returns The name used for saving
     */
    async stopRecording(
        customName?: string,
        options?: {
            nativeAlreadyStopped?: boolean;
            resolveName?: (suggestedName: string) => Promise<string | null>;
        }
    ): Promise<string> {
        if (this._isSaving) return '';
        this._isSaving = true;
        try {
            const completedPoints = [...state.recordedPoints];
            const completedAt = Date.now();
            const recordingStartTime = state.recordingStartTime;
            const userAltitudeMeters = state.userLocation?.alt ?? null;
            const gpsAccuracyMeters = state.userLocationAccuracy;
            // The UI must stop looking active immediately. Native STOP from
            // the notification has already done this work.
            state.isRecording = false;
            if (!options?.nativeAlreadyStopped) {
                await nativeGPSService.stopCourse();
                await stopRecordingService();
            }

            let nameToUse = customName ? normalizeTrackName(customName) : '';
            if (!nameToUse && completedPoints.length >= 2) {
                const suggestedName =
                    await this.generateSuggestedName(completedPoints);
                const resolvedName = options?.resolveName
                    ? await options.resolveName(suggestedName)
                    : suggestedName;
                if (resolvedName === null) {
                    // REC is stopped either way. A user cancellation must not
                    // leave points around to be proposed a second time.
                    state.recordedPoints = [];
                    updateRecordedTrackMesh();
                    showToast(i18n.t('track.toast.recDiscarded'));
                    return '';
                }
                nameToUse = normalizeTrackName(resolvedName, suggestedName);
            }

            if (completedPoints.length >= 2) {
                const saved = await this.saveCurrentRecording(nameToUse);
                if (!saved) throw new Error('Recording could not be saved');
                eventBus.emit(
                    'recordingCompleted',
                    buildRecordingSummary(completedPoints, {
                        name: nameToUse,
                        now: completedAt,
                        recordingStartTime,
                        userAltitudeMeters,
                        gpsAccuracyMeters,
                    })
                );
                showToast(i18n.t('track.toast.recSaved'));
                state.recordedPoints = [];
                updateRecordedTrackMesh();
            } else {
                showToast(i18n.t('track.toast.tooShort'));
                state.recordedPoints = [];
                updateRecordedTrackMesh();
            }

            this._isSaving = false;
            return nameToUse;
        } catch (e) {
            console.error('[RecordingService] Erreur lors du STOP:', e);
            showToast("⚠️ Erreur lors de l'arrêt");
            state.isRecording = false;
            this._isSaving = false;
            return '';
        }
    }

    public async generateSuggestedName(
        points = state.recordedPoints
    ): Promise<string> {
        if (points.length < 2) return '';
        const startPt = points[0];
        const place = await getPlaceName(startPt.lat, startPt.lon);
        const now = new Date();
        const dateStr = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
        ].join('-');
        const timeStr = `${String(now.getHours()).padStart(2, '0')}h${String(
            now.getMinutes()
        ).padStart(2, '0')}`;

        return normalizeTrackName(
            place
                ? `${place} · ${dateStr} ${timeStr} · SunTrail`
                : `${dateStr} ${timeStr} · SunTrail`
        );
    }

    /**
     * Saves the current recordedPoints to internal layers and file system.
     */
    async saveCurrentRecording(name: string): Promise<boolean> {
        if (state.recordedPoints.length < 2) return false;

        try {
            const savedInternal = await this.saveToInternalLayer(name);
            if (isProActive()) await this.saveToFile(name);
            return savedInternal;
        } catch (e) {
            console.error('[RecordingService] Save failed:', e);
            return false;
        }
    }

    private async saveToInternalLayer(name: string): Promise<boolean> {
        const gpxString = this.buildGPXString(name);
        const { default: gpxParser } = await import('gpxparser');
        const parser = new gpxParser();
        parser.parse(gpxString);
        if (!parser.tracks?.length) return false;

        addGPXLayer(parser, name, { source: 'rec' });
        void haptic('success');
        return true;
    }

    async saveToFile(
        customName: string,
        content?: string
    ): Promise<string | null> {
        // L'export fichier est un droit Pro. Ce garde précède toute génération
        // de Blob et toute écriture dans Téléchargements, Documents ou Cache.
        if (!isProActive()) return null;
        if (!content && state.recordedPoints.length < 2) return null;

        const gpx = content || this.buildGPXString(customName);
        const filename = toGPXFilename(customName);

        if (Capacitor.isNativePlatform()) {
            const downloaded = await nativeGPSService.saveTextToDownloads(
                filename,
                gpx
            );
            if (downloaded) return downloaded;

            // Android 9 et erreurs MediaStore gardent le comportement historique
            // plutôt que de perdre l'export demandé.
            try {
                await Filesystem.writeFile({
                    path: filename,
                    data: gpx,
                    directory: Directory.Documents,
                    encoding: Encoding.UTF8,
                });

                return filename;
            } catch (e) {
                console.error('[RecordingService] saveToFile failed:', e);
                return null;
            }
        } else {
            // Web Download
            const blob = new Blob([gpx], { type: 'application/gpx+xml' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
            return filename;
        }
    }

    public buildGPXString(trackName: string): string {
        let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SunTrail 3D" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${trackName}</name>
    <trkseg>`;

        const uniquePoints = [
            ...new Map(
                state.recordedPoints.map((p) => [p.timestamp, p])
            ).values(),
        ];
        uniquePoints.forEach((p) => {
            gpx += `
      <trkpt lat="${p.lat}" lon="${p.lon}">
        <ele>${p.alt.toFixed(1)}</ele>
        <time>${new Date(p.timestamp).toISOString()}</time>
      </trkpt>`;
        });
        gpx += `
    </trkseg>
  </trk>
</gpx>`;
        return gpx;
    }
}

export const recordingService = new RecordingService();
