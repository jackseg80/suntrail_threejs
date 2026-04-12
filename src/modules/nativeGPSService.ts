/**
 * nativeGPSService.ts — Interface avec le GPS natif Android (v5.24)
 * 
 * Ce service est le SEUL point de contact pour l'enregistrement GPS natif.
 * Le JS ne fait plus d'enregistrement autonome — il écoute uniquement les événements
 * émis par le natif via RecordingNative.
 * 
 * Single Source of Truth : le natif Android (FusedLocationProviderClient) est
 * l'unique source d'enregistrement des points GPS.
 */

import { registerPlugin, Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { state } from './state';
import { updateRecordedTrackMesh } from './terrain';
import { haversineDistance } from './utils';
import { cleanGPSTrack } from './gpsDeduplication';

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
    requestBatteryOptimizationExemption(): Promise<{ granted: boolean }>;
    addListener(event: string, callback: (event: any) => void): void;
    removeAllListeners(): void;
}

// ── Plugin natif (no-op sur web) ───────────────────────────────────────────────
const RecordingNative = Capacitor.isNativePlatform()
    ? registerPlugin<RecordingPlugin>('Recording')
    : null;

// ── Service ───────────────────────────────────────────────────────────────────

const STORAGE_KEY_POINTS = 'suntrail_recorded_points';
const STORAGE_KEY_COURSE_ID = 'suntrail_current_course_id';

class NativeGPSService {
    private currentCourseId: string | null = null;
    private isListening = false;
    private meshUpdateTimeout: number | null = null;
    private pendingMeshUpdate = false;
    
    // Auto-pause (v5.28.1)
    private immobilityStartTime: number | null = null;

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
                // 2. Si pas de course native, tenter une recovery via Preferences (crash app sans kill service)
                const savedCourseId = await Preferences.get({ key: STORAGE_KEY_COURSE_ID });
                if (savedCourseId.value) {
                    const savedPoints = await Preferences.get({ key: STORAGE_KEY_POINTS });
                    if (savedPoints.value) {
                        console.log('[NativeGPSService] Recovery via Preferences détectée');
                        state.recordedPoints = JSON.parse(savedPoints.value);
                        state.currentCourseId = savedCourseId.value;
                        this.currentCourseId = savedCourseId.value;
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
     * Utilise cleanGPSTrack pour le tri, dédoublonnage et cohérence.
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
        if (!RecordingNative) {
            return '';
        }

        const result = await RecordingNative.startCourse({ originTile });
        this.currentCourseId = result.courseId;
        state.isPaused = false;
        this.immobilityStartTime = null;
        
        // Persister l'ID de course pour recovery
        await Preferences.set({ key: STORAGE_KEY_COURSE_ID, value: result.courseId });
        await Preferences.remove({ key: STORAGE_KEY_POINTS });

        this.setupListeners();
        return this.currentCourseId;
    }

    /**
     * Arrête la course en cours avec flush final unifié.
     */
    async stopCourse(): Promise<void> {
        if (!RecordingNative) return;

        // Récupérer les derniers points avant de couper (Single Source of Truth)
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
        
        // Nettoyer le stockage temporaire après un arrêt propre
        await Preferences.remove({ key: STORAGE_KEY_COURSE_ID });
        await Preferences.remove({ key: STORAGE_KEY_POINTS });

        // Flush final du mesh pour afficher tous les points
        this.flushMeshUpdate();
    }
    
    /**
     * Détection Auto-pause (v5.28.1)
     * Basé sur une vitesse < 0.8 km/h pendant 30 secondes.
     * @returns true si le point doit être ignoré (en pause)
     */
    private checkAutoPause(newPoint: NativeGPSPoint): boolean {
        if (state.recordedPoints.length === 0) return false;
        
        const lastPoint = state.recordedPoints[state.recordedPoints.length - 1];
        const distKm = haversineDistance(lastPoint.lat, lastPoint.lon, newPoint.lat, newPoint.lon);
        const timeHours = (newPoint.timestamp - lastPoint.timestamp) / 3600000;
        
        // Si mouvement détecté (> 0.8 km/h)
        if (timeHours > 0 && (distKm / timeHours) > 0.8) {
            this.immobilityStartTime = null;
            if (state.isPaused) {
                state.isPaused = false;
                console.log('[NativeGPS] Auto-resume détecté');
            }
            return false;
        }

        // Si quasi-immobile
        if (!this.immobilityStartTime) {
            this.immobilityStartTime = newPoint.timestamp;
        }
        
        // Déclenchement de la pause après 30s d'immobilité
        if (newPoint.timestamp - this.immobilityStartTime > 30000) {
            if (!state.isPaused) {
                state.isPaused = true;
                console.log('[NativeGPS] Auto-pause activée');
            }
            return true;
        }
        
        return state.isPaused;
    }

    /**
     * Sauvegarde locale des points pour recovery (v5.28.1)
     */
    private async persistPoints(): Promise<void> {
        try {
            await Preferences.set({
                key: STORAGE_KEY_POINTS,
                value: JSON.stringify(state.recordedPoints)
            });
        } catch (e) {
            console.warn('[NativeGPSService] Failed to persist points:', e);
        }
    }

    /**
     * Force la mise à jour du mesh 3D (appelé à l'arrêt ou manuellement).
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
     * Récupère TOUS les points d'une course (pour recovery).
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
     * Récupère la course actuellement active (si existente).
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
     * Demande l'exemption des optimisations batterie (Android uniquement).
     */
    async requestBatteryOptimizationExemption(): Promise<boolean> {
        if (!RecordingNative) return true;
        try {
            const result = await RecordingNative.requestBatteryOptimizationExemption();
            return result.granted;
        } catch (e) {
            console.warn('[NativeGPSService] requestBatteryOptimizationExemption failed:', e);
            return false;
        }
    }

    /**
     * Configure les listeners pour les événements GPS natifs.
     */
    setupListeners(): void {
        if (!RecordingNative || this.isListening) {
            return;
        }
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

            const lastTimestamp = state.recordedPoints.length > 0
                ? state.recordedPoints[state.recordedPoints.length - 1].timestamp
                : 0;

            try {
                const newPoints = await this.getAllPoints(event.courseId, lastTimestamp);
                
                if (newPoints.length > 0) {
                    // v5.28.5: Utilisation systématique de la source de vérité pour le filtrage
                    // On fusionne les anciens et nouveaux points pour un nettoyage global (notamment pour la moyenne mobile)
                    const allPoints = [...state.recordedPoints, ...newPoints];
                    const cleanedAll = cleanGPSTrack(allPoints);
                    
                    // On ne garde que les points qui sont réellement nouveaux (pour éviter de reboucler sur des points déjà traités)
                    const existingTimestamps = new Set(state.recordedPoints.map(p => p.timestamp));
                    const uniqueNewPoints = cleanedAll.filter(p => !existingTimestamps.has(p.timestamp));

                    if (uniqueNewPoints.length > 0) {
                        state.recordedPoints = [...state.recordedPoints, ...uniqueNewPoints];
                        
                        // Persistance (v5.28.1)
                        this.persistPoints();

                        // Mettre à jour le mesh 3D
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
                console.error('[NativeGPSService] Failed to fetch new points:', e);
            }
        });

        RecordingNative.addListener('onLocationUpdate', (event: { lat: number; lon: number; alt: number; accuracy: number }) => {
            state.userLocation = { lat: event.lat, lon: event.lon, alt: event.alt };
            state.userLocationAccuracy = event.accuracy ?? null;
        });
    }

    /**
     * Supprime les listeners (lors de l'arrêt de course).
     */
    private removeListeners(): void {
        if (!RecordingNative) return;
        RecordingNative.removeAllListeners();
        this.isListening = false;
    }
}

export const nativeGPSService = new NativeGPSService();
