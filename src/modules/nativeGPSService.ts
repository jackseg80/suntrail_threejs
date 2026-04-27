/**
 * nativeGPSService.ts — Interface avec le GPS natif Android (v5.31.2)
 * 
 * Ce service est le SEUL point de contact pour l'enregistrement GPS natif.
 * Le JS ne fait plus d'enregistrement autonome — il écoute uniquement les événements
 * émis par le natif via RecordingNative.
 */

import { registerPlugin, Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { state } from './state';
import { LocationPoint } from './geo';
import { updateRecordedTrackMesh } from './gpxLayers';
import { cleanGPSTrack } from './gpsDeduplication';
import { calculateTrackStats } from './geoStats';
import { recordingService } from './recordingService';

// ... (Types remain the same)

// ── Types ──────────────────────────────────────────────────────────────────────

export interface NativeGPSPoint {
    id: number;
    lat: number;
    lon: number;
    alt: number;
    timestamp: number;  // Timestamp GPS (pas Date.now())
    accuracy: number;
}

interface RecordingPlugin {
    startCourse(options?: { originTile?: { x: number; y: number; z: number } }): Promise<{ courseId: string }>;
    stopCourse(): Promise<void>;
    getPoints(options: { courseId: string; since: number }): Promise<{ points: NativeGPSPoint[] }>;
    getCurrentCourse(): Promise<{ courseId: string; isRunning: boolean; originTile?: { x: number; y: number; z: number } }>;
    updateNotificationStats(options: { distance: number; elevation: number; elevationMinus?: number }): Promise<void>;
    addListener(event: string, callback: (event: any) => void): Promise<any>;
    removeAllListeners(): Promise<void>;
}

// ── Plugin natif (no-op sur web) ───────────────────────────────────────────────
const RecordingNative = Capacitor.isNativePlatform()
    ? registerPlugin<RecordingPlugin>('Recording')
    : null;

// ── Service ───────────────────────────────────────────────────────────────────

const STORAGE_KEY_POINTS = 'suntrail_recorded_points';
const STORAGE_KEY_COURSE_ID = 'suntrail_current_course_id';
const STORAGE_KEY_START_TIME = 'suntrail_recording_start_time'; // v5.29.1

class NativeGPSService {
    private currentCourseId: string | null = null;
    private isListening = false;
    private meshUpdateTimeout: number | null = null;
    private pendingMeshUpdate = false;
    private statsUpdateInterval: number | null = null;

    /**
     * Initialisation et récupération au démarrage (v5.28.1)
     */
    async init(): Promise<void> {
        if (!RecordingNative) return;

        try {
            // 1. Tenter de récupérer la course native encore active
            const nativeCourse = await this.getCurrentCourse();
            
            if (nativeCourse && nativeCourse.isRunning) {
                console.log('[NativeGPSService] Course active détectée au démarrage:', nativeCourse.courseId);
                this.currentCourseId = nativeCourse.courseId;
                state.currentCourseId = nativeCourse.courseId;
                state.isRecording = true;
                
                // v5.29.1 : Restaurer le temps de départ
                const savedStartTime = await Preferences.get({ key: STORAGE_KEY_START_TIME });
                if (savedStartTime.value) {
                    state.recordingStartTime = parseInt(savedStartTime.value, 10);
                }

                if (nativeCourse.originTile) {
                    state.originTile = nativeCourse.originTile;
                }

                // Récupération avec unification du filtrage
                const points = await this.getAllPoints(nativeCourse.courseId, 0);
                if (points.length > 0) {
                    state.recordedPoints = this.filterPointsConsistency(points);
                    updateRecordedTrackMesh();
                }
                
                this.setupListeners();
            } else {
                // 2. Si pas de course native, tenter une recovery via Preferences
                const savedCourseId = await Preferences.get({ key: STORAGE_KEY_COURSE_ID });
                if (savedCourseId.value) {
                    const savedPoints = await Preferences.get({ key: STORAGE_KEY_POINTS });
                    if (savedPoints.value) {
                        const points = JSON.parse(savedPoints.value) as LocationPoint[];
                        
                        // v5.29.6 : Expiration 48h pour éviter de polluer l'UI avec de vieux tracés abandonnés
                        const now = Date.now();
                        const lastPt = points.length > 0 ? points[points.length - 1] : null;
                        if (lastPt && (now - lastPt.timestamp > 48 * 3600 * 1000)) {
                            if (state.DEBUG_MODE) console.log('[NativeGPSService] Vieux points expirés (>48h), purge.');
                            await Preferences.remove({ key: STORAGE_KEY_POINTS });
                            await Preferences.remove({ key: STORAGE_KEY_COURSE_ID });
                            await Preferences.remove({ key: STORAGE_KEY_START_TIME });
                            return;
                        }

                        if (state.DEBUG_MODE) console.log('[NativeGPSService] Recovery via Preferences détectée');
                        state.recordedPoints = points;
                        state.currentCourseId = savedCourseId.value;
                        this.currentCourseId = savedCourseId.value;
                        
                        // v5.29.1 : Restaurer le temps de départ même en mode recovery crash
                        const savedStartTime = await Preferences.get({ key: STORAGE_KEY_START_TIME });
                        if (savedStartTime.value) {
                            state.recordingStartTime = parseInt(savedStartTime.value, 10);
                        }
                        
                        updateRecordedTrackMesh();
                    }
                }
            }
        } catch (e) {
            console.error('[NativeGPSService] Init failure:', e);
        }
    }

    /**
     * Filtrage lourd unifié (v5.28.1)
     */
    private filterPointsConsistency(points: NativeGPSPoint[]): any[] {
        return cleanGPSTrack(points).map(p => ({
            lat: p.lat,
            lon: p.lon,
            alt: p.alt,
            timestamp: p.timestamp
        }));
    }

    /**
     * Démarre une course (enregistrement GPS natif).
     */
    async startCourse(originTile?: { x: number; y: number; z: number }): Promise<string> {
        if (!RecordingNative) return '';

        const result = await RecordingNative.startCourse({ originTile });
        this.currentCourseId = result.courseId;
        state.isPaused = false;
        state.isRecording = true;
        
        // v5.29.1 : Persister le temps de départ
        const startTime = Date.now();
        state.recordingStartTime = startTime;
        await Preferences.set({ key: STORAGE_KEY_START_TIME, value: startTime.toString() });
        
        await Preferences.set({ key: STORAGE_KEY_COURSE_ID, value: result.courseId });
        await Preferences.remove({ key: STORAGE_KEY_POINTS });

        this.setupListeners();
        return this.currentCourseId;
    }

    /**
     * Arrête la course en cours.
     */
    async stopCourse(): Promise<void> {
        if (!RecordingNative) return;

        if (this.currentCourseId) {
            const lastTimestamp = state.recordedPoints.length > 0 
                ? state.recordedPoints[state.recordedPoints.length - 1].timestamp 
                : 0;
            const finalPoints = await this.getAllPoints(this.currentCourseId, lastTimestamp);
            if (finalPoints.length > 0) {
                const filtered = this.filterPointsConsistency(finalPoints);
                const existingTimestamps = new Set(state.recordedPoints.map(p => p.timestamp));
                const uniqueNew = filtered.filter(p => !existingTimestamps.has(p.timestamp));
                state.recordedPoints = [...state.recordedPoints, ...uniqueNew];
            }
        }

        await RecordingNative.stopCourse();
        this.removeListeners();
        this.currentCourseId = null;
        state.isPaused = false;
        state.isRecording = false;
        state.recordingStartTime = null; // Reset
        
        // v5.29.1 : Nettoyage
        await Preferences.remove({ key: STORAGE_KEY_START_TIME });
        await Preferences.remove({ key: STORAGE_KEY_COURSE_ID });
        await Preferences.remove({ key: STORAGE_KEY_POINTS });

        this.flushMeshUpdate();
    }

    /**
     * Sauvegarde locale des points pour recovery.
     */
    private async persistPoints(): Promise<void> {
        try {
            // v5.29.6 : Cap à 10 000 points pour la persistance locale (sécurité localStorage)
            // 10k points @ 5s interval = ~14h de rando non-stop. Plus que suffisant pour un crash-recovery.
            const pointsToSave = state.recordedPoints.slice(-10000);
            
            await Preferences.set({
                key: STORAGE_KEY_POINTS,
                value: JSON.stringify(pointsToSave)
            });
        } catch (e) {
            console.warn('[NativeGPSService] Failed to persist points:', e);
        }
    }

    /**
     * Force la mise à jour du mesh 3D.
     */
    flushMeshUpdate(): void {
        if (this.meshUpdateTimeout) {
            clearTimeout(this.meshUpdateTimeout);
            this.meshUpdateTimeout = null;
        }
        if (this.pendingMeshUpdate) {
            updateRecordedTrackMesh();
            this.pendingMeshUpdate = false;
        }
    }

    /**
     * Récupère TOUS les points d'une course.
     */
    async getAllPoints(courseId: string, since: number = 0): Promise<NativeGPSPoint[]> {
        if (!RecordingNative) return [];
        try {
            const result = await RecordingNative.getPoints({ courseId, since });
            return result.points || [];
        } catch (e) {
            console.warn('[NativeGPSService] getAllPoints failed:', e);
            return [];
        }
    }

    /**
     * Récupère la course actuellement active.
     */
    async getCurrentCourse(): Promise<{ courseId: string; isRunning: boolean; originTile?: { x: number; y: number; z: number } } | null> {
        if (!RecordingNative) return null;
        try {
            return await RecordingNative.getCurrentCourse();
        } catch (e) {
            console.warn('[NativeGPSService] getCurrentCourse failed:', e);
            return null;
        }
    }

    /**
     * Configure les listeners.
     */
    setupListeners(): void {
        if (!RecordingNative || this.isListening) return;
        this.isListening = true;

        RecordingNative.addListener('onNewPoints', async (event: { courseId: string; pointCount: number }) => {
            if (!event.courseId) return;

            if (!this.currentCourseId && event.courseId) {
                this.currentCourseId = event.courseId;
                state.currentCourseId = event.courseId;
                state.isRecording = true;
                Preferences.set({ key: STORAGE_KEY_COURSE_ID, value: event.courseId });
            }

            if (event.pointCount === 0) return;
            await this.syncPoints();
        });

        RecordingNative.addListener('onLocationUpdate', (event: { lat: number; lon: number; alt: number; accuracy: number }) => {
            state.userLocation = { lat: event.lat, lon: event.lon, alt: event.alt };
            state.userLocationAccuracy = event.accuracy ?? null;
        });

        // v5.29.38 : Listener pour arrêt via notification Android
        RecordingNative.addListener('onServiceStopped', () => {
            if (state.DEBUG_MODE) console.log('[NativeGPSService] Service stopped from notification');
            if (state.isRecording) {
                recordingService.stopRecording();
            }
        });

        // Intervalle de mise à jour des stats dans la notification (toutes les 10s)
        this.statsUpdateInterval = window.setInterval(() => {
            if (state.isRecording && state.recordedPoints.length >= 2) {
                const stats = calculateTrackStats(state.recordedPoints);
                RecordingNative.updateNotificationStats({
                    distance: stats.distance,
                    elevation: stats.dPlus,
                    elevationMinus: stats.dMinus
                });
            }
        }, 10000);
    }

    /**
     * Synchronise les points enregistrés par le service natif (v5.34.9).
     * Centralise le filtrage cleanGPSTrack pour éviter les artefacts de "champignons".
     */
    async syncPoints(): Promise<void> {
        if (!this.currentCourseId || !RecordingNative) return;

        const lastTimestamp = state.recordedPoints.length > 0
            ? state.recordedPoints[state.recordedPoints.length - 1].timestamp
            : 0;

        try {
            const newPoints = await this.getAllPoints(this.currentCourseId, lastTimestamp);
            if (newPoints.length > 0) {
                // v5.28.1 : Unification du filtrage pour éviter les (0,0) injectés
                const allPoints = [...state.recordedPoints, ...newPoints];
                const cleanedAll = cleanGPSTrack(allPoints);

                const existingTimestamps = new Set(state.recordedPoints.map(p => p.timestamp));
                const uniqueNewPoints = cleanedAll.filter(p => !existingTimestamps.has(p.timestamp));

                if (uniqueNewPoints.length > 0) {
                    state.recordedPoints = [...state.recordedPoints, ...uniqueNewPoints];
                    this.persistPoints();

                    const totalPoints = state.recordedPoints.length;
                    if (totalPoints < 10) {
                        updateRecordedTrackMesh();
                    } else {
                        this.pendingMeshUpdate = true;
                        if (!this.meshUpdateTimeout) {
                            this.meshUpdateTimeout = window.setTimeout(() => {
                                if (this.pendingMeshUpdate) {
                                    updateRecordedTrackMesh();
                                    this.pendingMeshUpdate = false;
                                }
                                this.meshUpdateTimeout = null;
                            }, 500);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[NativeGPSService] Sync failure:', e);
        }
    }

    /**
     * Supprime les listeners.
     */
    private removeListeners(): void {
        if (this.statsUpdateInterval) {
            clearInterval(this.statsUpdateInterval);
            this.statsUpdateInterval = null;
        }
        if (!RecordingNative) return;
        RecordingNative.removeAllListeners();
        this.isListening = false;
    }
}

export const nativeGPSService = new NativeGPSService();
