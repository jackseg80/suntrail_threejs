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
import { haversineDistance } from './profile';

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
        
        // Flush final du mesh pour afficher tous les points
        this.flushMeshUpdate();
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
        // L'événement contient courseId et pointCount, pas les points directement
        // On fait une requête pour récupérer les nouveaux points depuis le dernier timestamp
        RecordingNative.addListener('onNewPoints', async (event: { courseId: string; pointCount: number }) => {
            
            if (!event.courseId) {
                return;
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

                    // Filtrer les doublons (même timestamp)
                    const existingTimestamps = new Set(state.recordedPoints.map(p => p.timestamp));
                    
                    // v5.27.5: S'assurer que le dernier point de référence est bien le plus récent chronologiquement
                    const sortedExisting = [...state.recordedPoints].sort((a, b) => a.timestamp - b.timestamp);
                    let lastPoint = sortedExisting.length > 0 ? sortedExisting[sortedExisting.length - 1] : null;

                    const uniqueNewPoints = newPoints.filter(p => {
                        if (existingTimestamps.has(p.timestamp)) return false;

                        // v5.27.13: Rejet des points invalides (0,0) - Cause majeure de champignons
                        if (p.lat === 0 && p.lon === 0) return false;
                        if (Math.abs(p.lat) < 0.001 && Math.abs(p.lon) < 0.001) return false;
                        
                        // v5.26.7: Filtrage de cohérence d'altitude
                        // Rejeter les points aberrants (> 200m de saut vertical)
                        if (lastPoint !== null) {
                            const altDelta = Math.abs(p.alt - lastPoint.alt);
                            if (altDelta > 200) {
                                console.warn(`[NativeGPS] Point rejeté (saut altitude: ${Math.round(altDelta)}m):`, p);
                                return false;
                            }

                            // v5.27.13: Filtrage horizontal radical (Anti-Champignon / Spike)
                            // Si le point est à plus de 2km en moins de 10s (vitesse > 720km/h), c'est un glitch
                            // Seuil augmenté à 2km pour plus de sécurité (S23 peut être très réactif)
                            const timeDelta = (p.timestamp - lastPoint.timestamp) / 1000;
                            if (timeDelta > 0 && timeDelta < 10) {
                                const dist = haversineDistance(lastPoint.lat, lastPoint.lon, p.lat, p.lon);
                                if (dist > 2.0) { // 2km
                                    console.warn(`[NativeGPS] Point rejeté (saut horizontal: ${dist.toFixed(2)}km en ${timeDelta.toFixed(1)}s):`, p);
                                    return false;
                                }
                            }
                            
                            // Sécurité absolue : un point ne peut pas être à plus de 500km du précédent
                            // (Sauf si on redémarre l'app après un vol, mais ici on est en REC continu)
                            if (haversineDistance(lastPoint.lat, lastPoint.lon, p.lat, p.lon) > 500) {
                                return false;
                            }
                        }
                        
                        // Plage absolue de sécurité
                        if (p.alt < -500 || p.alt > 9000) return false;

                        lastPoint = { lat: p.lat, lon: p.lon, alt: p.alt, timestamp: p.timestamp };
                        return true;
                    });
                    
                    if (uniqueNewPoints.length > 0) {
                        // Convertir NativeGPSPoint en LocationPoint
                        const convertedPoints = uniqueNewPoints.map(p => ({
                            lat: p.lat,
                            lon: p.lon,
                            alt: p.alt,
                            timestamp: p.timestamp
                        }));
                        state.recordedPoints = [...state.recordedPoints, ...convertedPoints];
                        
                        // Mettre à jour le mesh 3D
                        // Stratégie: immédiat pour les premiers points, debounce pour les suivants
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
