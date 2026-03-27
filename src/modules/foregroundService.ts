/**
 * foregroundService.ts — Wrapper JS pour le Foreground Service Android (v5.11)
 *
 * Remplit deux rôles :
 *   1. Démarre/arrête le RecordingService natif Android pour maintenir le processus
 *      en vie quand l'app est en arrière-plan pendant un enregistrement.
 *   2. Persiste l'état d'enregistrement dans localStorage comme fallback — si l'app
 *      est quand même tuée, l'utilisateur peut reprendre à son retour.
 *
 * Sur web/navigateur : les appels natifs sont ignorés silencieusement.
 */

import { registerPlugin, Capacitor } from '@capacitor/core';

// ── Types ──────────────────────────────────────────────────────────────────────
interface RecordingPlugin {
    startForeground(): Promise<void>;
    stopForeground(): Promise<void>;
}

interface RecordingSnapshot {
    isRecording: boolean;
    startTime: number;
    pointCount: number;
}

// ── Plugin natif (no-op sur web) ───────────────────────────────────────────────
const RecordingNative = Capacitor.isNativePlatform()
    ? registerPlugin<RecordingPlugin>('Recording')
    : null;

const SNAPSHOT_KEY = 'suntrail_rec_snapshot_v1';

// ── API publique ───────────────────────────────────────────────────────────────

/**
 * Démarre le Foreground Service et persiste l'état.
 * Appelé quand l'utilisateur active REC.
 */
export async function startRecordingService(): Promise<void> {
    // Sauvegarder l'état dans localStorage (fallback si le service est tué)
    const snapshot: RecordingSnapshot = {
        isRecording: true,
        startTime:   Date.now(),
        pointCount:  0,
    };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));

    // Démarrer le service natif
    if (RecordingNative) {
        try {
            await RecordingNative.startForeground();
        } catch (e) {
            console.warn('[RecordingService] startForeground failed:', e);
        }
    }
}

/**
 * Arrête le Foreground Service et efface la persistence.
 * Appelé quand l'utilisateur arrête REC ou exporte.
 */
export async function stopRecordingService(): Promise<void> {
    localStorage.removeItem(SNAPSHOT_KEY);

    if (RecordingNative) {
        try {
            await RecordingNative.stopForeground();
        } catch (e) {
            console.warn('[RecordingService] stopForeground failed:', e);
        }
    }
}

/**
 * Met à jour le nombre de points dans le snapshot (appelé à chaque nouveau point GPS).
 * Permet de savoir où on en était si l'app est quand même tuée.
 */
export function updateRecordingSnapshot(pointCount: number): void {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return;
    try {
        const snapshot: RecordingSnapshot = JSON.parse(raw);
        snapshot.pointCount = pointCount;
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch { /* ignore */ }
}

/**
 * Vérifie si un enregistrement était actif lors du dernier lancement.
 * Retourne le snapshot si oui, null sinon.
 * Utilisé au démarrage pour proposer une reprise.
 */
export function getInterruptedRecording(): RecordingSnapshot | null {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    try {
        const snapshot: RecordingSnapshot = JSON.parse(raw);
        return snapshot.isRecording ? snapshot : null;
    } catch {
        return null;
    }
}

/**
 * Efface le snapshot d'enregistrement interrompu sans arrêter le service.
 */
export function clearInterruptedRecording(): void {
    localStorage.removeItem(SNAPSHOT_KEY);
}
