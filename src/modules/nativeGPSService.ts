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

class NativeGPSService {
    private currentCourseId: string | null = null;
    private isListening = false;
    private meshUpdateTimeout: number | null = null;
    private pendingMeshUpdate = false;
    private readonly PERSISTENCE_KEY = 'suntrail_current_track_points';
    private saveTimeout: number | null = null;

    /**
     * Sauvegarde les points en cours dans les préférences (v5.28.0)
     */
    private persistPoints(): void {
        if (this.saveTimeout) return;
        
        this.saveTimeout = window.setTimeout(async () => {
            try {
                await Preferences.set({
                    key: this.PERSISTENCE_KEY,
                    value: JSON.stringify(state.recordedPoints)
                });
            } catch (e) {
                console.warn('[NativeGPSService] Persistence failed:', e);
            }
            this.saveTimeout = null;
        }, 3000); // Sauvegarde toutes les 3s max
    }

    /**
     * Charge les points sauvegardés (v5.28.0)
     */
    async loadPersistedPoints(): Promise<void> {
        try {
            const { value } = await Preferences.get({ key: this.PERSISTENCE_KEY });
            if (value) {
                const points = JSON.parse(value);
                if (Array.isArray(points) && points.length > 0) {
                    state.recordedPoints = points;
                    updateRecordedTrackMesh();
                }
            }
        } catch (e) {
            console.warn('[NativeGPSService] Failed to load persisted points:', e);
        }
    }

    /**
     * Efface les points sauvegardés (v5.28.0)
     */
    private async clearPersistedPoints(): Promise<void> {
        try {
            await Preferences.remove({ key: this.PERSISTENCE_KEY });
        } catch (e) {
            // ignore
        }
    }

    /**
     * Démarre une course (enregistrement GPS natif).
     * @param originTile - Tuile d'origine pour cohérence des coordonnées
     * Retourne le courseId pour tracking.
     */
    async startCourse(originTile?: { x: number; y: number; z: number }): Promise<string> {
        if (!RecordingNative) {
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
        
        // v5.28.0: Nettoyer la persistance
        await this.clearPersistedPoints();

        // Flush final du mesh pour afficher tous les points
        this.flushMeshUpdate();
    }
    
    /**
     * Applique immédiatement la mise à jour du mesh si en attente
     */
    private flushMeshUpdate(): void {
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
     * Demande une mise à jour du mesh avec debounce
     */
    private requestMeshUpdate(): void {
        this.pendingMeshUpdate = true;
        if (!this.meshUpdateTimeout) {
            this.meshUpdateTimeout = window.setTimeout(() => {
                this.flushMeshUpdate();
            }, 1000);
        }
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
     * Ces listeners mettent à jour state (points + position) automatiquement.
     * 
     * Note: Cette méthode est publique pour permettre la recovery au démarrage -
     * quand le service natif est encore actif, on doit pouvoir ré-attacher les listeners.
     */
    setupListeners(): void {
        if (!RecordingNative || this.isListening) {
            return;
        }
        this.isListening = true;

        // Nouveaux points enregistrés par le natif
        RecordingNative.addListener('onNewPoints', async (event: { courseId: string; pointCount: number; isAutoPaused?: boolean }) => {
            
            if (!event.courseId) {
                return;
            }

            // v5.28.1: Le statut Auto-Pause est désormais piloté par le natif
            if (event.isAutoPaused !== undefined) {
                state.isAutoPaused = event.isAutoPaused;
            }
            
            // Mettre à jour le courseId si nécessaire
            if (!this.currentCourseId && event.courseId) {
                this.currentCourseId = event.courseId;
                state.currentCourseId = event.courseId;
                state.isRecording = true;
            }
            
            if (event.pointCount === 0) {
                // Juste le courseId initial (pas de points encore)
                return;
            }

            // Récupérer les nouveaux points depuis le dernier timestamp connu
            const lastTimestamp = state.recordedPoints.length > 0
                ? state.recordedPoints[state.recordedPoints.length - 1].timestamp
                : 0;

            try {
                const newPoints = await this.getAllPoints(event.courseId, lastTimestamp);
                
                if (newPoints.length > 0) {
                    // v5.27.5: Tri chronologique des nouveaux points (sécurité buffer natif)
                    newPoints.sort((a, b) => a.timestamp - b.timestamp);

                    // Filtrer les doublons exacts (même timestamp)
                    const existingTimestamps = new Set(state.recordedPoints.map(p => p.timestamp));
                    
                    // v5.28.1: Le filtrage (0,0), Altitude et Jumps est désormais fait en NATIF.
                    // On ne garde ici qu'une sécurité de tri et de dédoublonnage pour le rendu.
                    const uniqueNewPoints = newPoints.filter(p => !existingTimestamps.has(p.timestamp));
                    
                    if (uniqueNewPoints.length > 0) {
                        // Convertir NativeGPSPoint en LocationPoint
                        const convertedPoints = uniqueNewPoints.map(p => ({
                            lat: p.lat,
                            lon: p.lon,
                            alt: p.alt,
                            timestamp: p.timestamp
                        }));
                        state.recordedPoints = [...state.recordedPoints, ...convertedPoints];
                        
                        // v5.28.0: Persistance temps-réel
                        this.persistPoints();

                        // Mettre à jour le mesh 3D
                        // Stratégie: immédiat pour les premiers points, debounce pour les suivants
                        const totalPoints = state.recordedPoints.length;
                        if (totalPoints < 10) {
                            updateRecordedTrackMesh();
                        } else {
                            this.requestMeshUpdate();
                        }
                    }
                }
            } catch (e) {
                console.error('[NativeGPSService] Failed to fetch new points:', e);
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
