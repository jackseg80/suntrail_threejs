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
import gpxParser from 'gpxparser';
import { startRecordingService, stopRecordingService } from './foregroundService';
import { nativeGPSService } from './nativeGPSService';
import { addGPXLayer } from './terrain';
import { requestGPSDisclosure } from './gpsDisclosure';
import { getPlaceName } from './geocodingService';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Geolocation } from '@capacitor/geolocation';

export class RecordingService {
    
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
                perms = await Geolocation.requestPermissions({ permissions: ['location'] });
            }
            if (perms.location !== 'granted') {
                state.isRecording = false;
                showToast(i18n.t('gps.toast.permissionDenied'));
                return false;
            }

            // Request battery optimization exemption
            await nativeGPSService.requestBatteryOptimizationExemption();
        }

        showToast(i18n.t('track.toast.recStarted'));
        if (!isProActive()) {
            setTimeout(() => showToast(i18n.t('track.toast.freeLimit')), 1500);
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
            return true;
        } catch (e) {
            console.error('[RecordingService] Failed to start:', e);
            state.isRecording = false;
            showToast('⚠️ Erreur au démarrage de l\'enregistrement');
            return false;
        }
    }

    /**
     * Stops the current recording.
     * @param customName Optional name provided by user
     * @returns The name used for saving
     */
    async stopRecording(customName?: string): Promise<string> {
        try {
            await nativeGPSService.stopCourse();
            await stopRecordingService();
            
            let nameToUse = customName || "";
            if (!nameToUse && state.recordedPoints.length >= 2) {
                nameToUse = await this.generateSuggestedName();
            }

            if (state.recordedPoints.length >= 2) {
                await this.saveCurrentRecording(nameToUse);
                showToast(i18n.t('track.toast.recStopped'));
                state.recordedPoints = [];
            } else {
                showToast(i18n.t('track.toast.tooShort'));
                state.recordedPoints = [];
            }

            state.isRecording = false;
            return nameToUse;
        } catch (e) {
            console.error('[RecordingService] Erreur lors du STOP:', e);
            showToast('⚠️ Erreur lors de l\'arrêt');
            state.isRecording = false;
            return "";
        }
    }

    public async generateSuggestedName(): Promise<string> {
        if (state.recordedPoints.length < 2) return "";
        const startPt = state.recordedPoints[0];
        const place = await getPlaceName(startPt.lat, startPt.lon);
        const dateStr = new Date().toISOString().slice(0, 10);
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
        
        return place 
            ? `SunTrail_${place}_${dateStr}_${timeStr}`
            : `SunTrail_${dateStr}_${timeStr}`;
    }

    /**
     * Saves the current recordedPoints to internal layers and file system.
     */
    async saveCurrentRecording(name: string): Promise<boolean> {
        if (state.recordedPoints.length < 2) return false;
        
        try {
            const savedInternal = await this.saveToInternalLayer(name);
            await this.saveToFile(name);
            return savedInternal;
        } catch (e) {
            console.error('[RecordingService] Save failed:', e);
            return false;
        }
    }

    private async saveToInternalLayer(name: string): Promise<boolean> {
        const gpxString = this.buildGPXString(name);
        const parser = new gpxParser();
        parser.parse(gpxString);
        if (!parser.tracks?.length) return false;
        
        addGPXLayer(parser, name);
        void haptic('success');
        return true;
    }

    async saveToFile(customName: string, content?: string): Promise<string | null> {
        if (!content && state.recordedPoints.length < 2) return null;
        
        const gpx = content || this.buildGPXString(customName);
        const sanitizedName = customName.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_');
        const filename = `${sanitizedName}-${Date.now()}.gpx`;

        if (Capacitor.isNativePlatform()) {
            try {
                const directory = isProActive() ? Directory.Documents : Directory.Cache;
                
                await Filesystem.writeFile({
                    path: filename,
                    data: gpx,
                    directory: directory,
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
        
        const uniquePoints = [...new Map(state.recordedPoints.map(p => [p.timestamp, p])).values()];
        uniquePoints.forEach(p => {
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
