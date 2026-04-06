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
import { state } from './state';
import { updateRecordedTrackMesh } from './terrain';

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
    addListener(event: string, callback: (event: any) => void): void;
    removeAllListeners(): void;
}

// ── Plugin natif (no-op sur web) ───────────────────────────────────────────────
const RecordingNative = Capacitor.isNativePlatform()
    ? registerPlugin<RecordingPlugin>('Recording')
    : null;

// ── Service ───────────────────────────────────────────────────────────────────

class NativeGPSService {
    private currentCourseId: string | null = null;
    private isListening = false;

    /**
     * Démarre une course (enregistrement GPS natif).
     * @param originTile - Tuile d'origine pour cohérence des coordonnées
     * Retourne le courseId pour tracking.
     */
    async startCourse(originTile?: { x: number; y: number; z: number }): Promise<string> {
        if (!RecordingNative) {
            console.warn('[NativeGPSService] startCourse called on non-native platform');
            return '';
        }

        const result = await RecordingNative.startCourse({ originTile });
        this.currentCourseId = result.courseId;
        this.setupListeners();
        return this.currentCourseId;
    }

    /**
     * Arrête la course en cours.
     */
    async stopCourse(): Promise<void> {
        if (!RecordingNative) return;

        await RecordingNative.stopCourse();
        this.removeListeners();
        this.currentCourseId = null;
    }

    /**
     * Récupère TOUS les points d'une course (pour recovery).
     * @param courseId - ID de la course
     * @param since - Timestamp minimal (0 = tous les points)
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
     * Utilisé au démarrage pour la recovery.
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
     * Configure les listeners pour les événements GPS natifs.
     * Ces listeners mettent à jour state (points + position) automatiquement.
     * 
     * Note: Cette méthode est publique pour permettre la recovery au démarrage -
     * quand le service natif est encore actif, on doit pouvoir ré-attacher les listeners.
     */
    setupListeners(): void {
        if (!RecordingNative || this.isListening) return;
        this.isListening = true;

        // Nouveaux points enregistrés par le natif
        // L'événement contient courseId et pointCount, pas les points directement
        // On fait une requête pour récupérer les nouveaux points depuis le dernier timestamp
        RecordingNative.addListener('onNewPoints', async (event: { courseId: string; pointCount: number }) => {
            if (!event.courseId || event.pointCount === 0) {
                // Juste le courseId initial (pas de points encore)
                this.currentCourseId = event.courseId;
                state.currentCourseId = event.courseId;
                state.isRecording = true;
                return;
            }

            // Récupérer les nouveaux points depuis le dernier timestamp connu
            const lastTimestamp = state.recordedPoints.length > 0
                ? state.recordedPoints[state.recordedPoints.length - 1].timestamp
                : 0;

            try {
                const newPoints = await this.getAllPoints(event.courseId, lastTimestamp);
                if (newPoints.length > 0) {
                    // Convertir NativeGPSPoint en LocationPoint
                    const convertedPoints = newPoints.map(p => ({
                        lat: p.lat,
                        lon: p.lon,
                        alt: p.alt,
                        timestamp: p.timestamp
                    }));
                    state.recordedPoints = [...state.recordedPoints, ...convertedPoints];
                    updateRecordedTrackMesh();
                }
            } catch (e) {
                console.warn('[NativeGPSService] Failed to fetch new points:', e);
            }
        });

        // Mise à jour de position (pour le marker utilisateur)
        RecordingNative.addListener('onLocationUpdate', (event: { lat: number; lon: number; alt: number; accuracy: number }) => {
            state.userLocation = { lat: event.lat, lon: event.lon, alt: event.alt };
            state.userLocationAccuracy = event.accuracy ?? null;
            // Note: updateUserMarker() est appelé par location.ts via le watchPosition JS
            // qui continue de tourner pour la position UI (mais sans enregistrer)
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
