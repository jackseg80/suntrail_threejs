/**
 * foregroundService.ts — Wrapper JS pour le Foreground Service Android (v5.24)
 *
 * Ce module a été simplifié après la refactorisation "Single Source of Truth" :
 * - L'enregistrement GPS est géré par nativeGPSService.ts qui dialogue avec le natif
 * - Ce module conserve uniquement le foreground service pour garder le processus vivant
 * - La persistence via filesystem a été supprimée (le natif est la source de vérité)
 *
 * Sur web/navigateur : les appels natifs sont ignorés silencieusement.
 */

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { nativeGPSService } from './nativeGPSService';

// ── Types ──────────────────────────────────────────────────────────────────────
interface RecordingSnapshot {
    isRecording: boolean;
    startTime: number;
    pointCount: number;
    originTile?: { x: number; y: number; z: number };
}

const SNAPSHOT_KEY = 'suntrail_rec_snapshot_v1';
const POINTS_FILE  = 'suntrail_rec_points_v1.json';

// ── API publique ───────────────────────────────────────────────────────────────

/**
 * Démarre le Foreground Service et persist l'état.
 * Appelé quand l'utilisateur active REC.
 */
export async function startRecordingService(originTile?: { x: number; y: number; z: number }): Promise<void> {
    const snapshot: RecordingSnapshot = {
        isRecording: true,
        startTime:   Date.now(),
        pointCount:  0,
        originTile:  originTile,
    };
    await Preferences.set({ key: SNAPSHOT_KEY, value: JSON.stringify(snapshot) });

    // Nettoyer le fichier de points orphan si présent
    if (Capacitor.isNativePlatform()) {
        Filesystem.deleteFile({ path: POINTS_FILE, directory: Directory.Cache })
            .catch(() => { /* fichier absent = normal */ });
    }
}

/**
 * Arrête le Foreground Service et efface la persistence.
 */
export async function stopRecordingService(): Promise<void> {
    await Preferences.remove({ key: SNAPSHOT_KEY });

    if (Capacitor.isNativePlatform()) {
        Filesystem.deleteFile({ path: POINTS_FILE, directory: Directory.Cache })
            .catch(() => { /* fichier absent = normal */ });
    }
}

/**
 * Met à jour le nombre de points dans le snapshot.
 */
export async function updateRecordingSnapshot(pointCount: number): Promise<void> {
    const { value } = await Preferences.get({ key: SNAPSHOT_KEY });
    if (!value) return;
    try {
        const snapshot: RecordingSnapshot = JSON.parse(value);
        snapshot.pointCount = pointCount;
        await Preferences.set({ key: SNAPSHOT_KEY, value: JSON.stringify(snapshot) });
    } catch { /* ignore */ }
}

/**
 * Persiste immédiatement tous les points sur disque.
 * Appelé lors du passage en background (appStateChange) pour éviter toute perte.
 * 
 * Note: Cette fonction persiste les points dans un fichier local mais ce n'est plus
 * la source de vérité - le natif reste la seule source fiable.
 */
export async function persistAllPointsNow(points: { lat: number; lon: number; alt: number; timestamp: number }[]): Promise<void> {
    if (!Capacitor.isNativePlatform() || points.length === 0) return;
    try {
        await Filesystem.writeFile({
            path:      POINTS_FILE,
            data:      JSON.stringify(points),
            directory: Directory.Cache,
            encoding:  Encoding.UTF8,
        });
    } catch (e) {
        console.warn('[RecordingService] persistAllPointsNow failed:', e);
    }
}

/**
 * Lit les points d'enregistrement persistés sur le filesystem (fallback legacy).
 * Retourne null si aucun fichier ou si on est sur web.
 * 
 * Note: Cette fonction n'est plus utilisée pour la recovery car nativeGPSService
 * récupère les points directement depuis le natif via getCurrentCourse().
 */
export async function getPersistedRecordingPoints(): Promise<{ lat: number; lon: number; alt: number; timestamp: number }[] | null> {
    if (!Capacitor.isNativePlatform()) return null;
    try {
        const result = await Filesystem.readFile({
            path:      POINTS_FILE,
            directory: Directory.Cache,
            encoding:  Encoding.UTF8,
        });
        return JSON.parse(result.data as string);
    } catch {
        return null;
    }
}

/**
 * Vérifie si le Foreground Service natif d'enregistrement tourne encore.
 * Permet de différencier au démarrage de l'app :
 *   - service vivant → reprise transparente (REC continue, pas de prompt)
 *   - service mort   → prompt recovery "Restaurer / Supprimer"
 */
export async function isRecordingServiceRunning(): Promise<boolean> {
    try {
        const currentCourse = await nativeGPSService.getCurrentCourse();
        return currentCourse?.isRunning ?? false;
    } catch {
        return false;
    }
}

/**
 * Vérifie si un enregistrement était actif lors du dernier lancement.
 */
export async function getInterruptedRecording(): Promise<RecordingSnapshot | null> {
    const { value } = await Preferences.get({ key: SNAPSHOT_KEY });
    if (!value) return null;
    try {
        const snapshot: RecordingSnapshot = JSON.parse(value);
        return snapshot.isRecording ? snapshot : null;
    } catch {
        return null;
    }
}

/**
 * Efface le snapshot d'enregistrement interrompu sans arrêter le service.
 */
export async function clearInterruptedRecording(): Promise<void> {
    await Preferences.remove({ key: SNAPSHOT_KEY });
}
