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
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

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

const SNAPSHOT_KEY  = 'suntrail_rec_snapshot_v1';
const POINTS_FILE   = 'suntrail_rec_points_v1.json';
const PERSIST_EVERY_N       = 10;         // Écrire sur disque tous les 10 nouveaux points (v5.19.1 — réduit de 30)
const PERSIST_INTERVAL_MS   = 20_000;     // …ou toutes les 20 secondes (v5.19.1 — réduit de 60s)

let _lastPersistedCount = 0;
let _lastPersistTime    = 0;

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

    // Réinitialiser les compteurs de persistance pour cette nouvelle session
    _lastPersistedCount = 0;
    _lastPersistTime    = Date.now();

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

    // Réinitialiser et supprimer le fichier de points temporaire
    _lastPersistedCount = 0;
    _lastPersistTime    = 0;
    if (Capacitor.isNativePlatform()) {
        Filesystem.deleteFile({ path: POINTS_FILE, directory: Directory.Cache })
            .catch(() => { /* fichier absent = normal si aucun point persité */ });
    }

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
export function updateRecordingSnapshot(
    pointCount: number,
    points?: Array<{ lat: number; lon: number; alt: number; timestamp: number }>
): void {
    // 1. Toujours mettre à jour le compte dans localStorage (rapide, synchrone)
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return;
    try {
        const snapshot: RecordingSnapshot = JSON.parse(raw);
        snapshot.pointCount = pointCount;
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch { /* ignore */ }

    // 2. Persister les points complets sur le filesystem selon les seuils (natif uniquement)
    if (!points || !Capacitor.isNativePlatform()) return;
    const now = Date.now();
    const newPoints = pointCount - _lastPersistedCount;
    if (newPoints >= PERSIST_EVERY_N || now - _lastPersistTime >= PERSIST_INTERVAL_MS) {
        _lastPersistedCount = pointCount;
        _lastPersistTime    = now;
        // Fire-and-forget — non-bloquant, perte d'un write = acceptable
        Filesystem.writeFile({
            path:      POINTS_FILE,
            data:      JSON.stringify(points),
            directory: Directory.Cache,
            encoding:  Encoding.UTF8,
        }).catch(e => console.warn('[RecordingService] points persist failed:', e));
    }
}

/**
 * Lit les points d'enregistrement persistés sur le filesystem (après un kill Android).
 * Retourne null si aucun fichier ou si on est sur web.
 */
export async function getPersistedRecordingPoints(): Promise<
    Array<{ lat: number; lon: number; alt: number; timestamp: number }> | null
> {
    if (!Capacitor.isNativePlatform()) return null;
    try {
        const result = await Filesystem.readFile({
            path:      POINTS_FILE,
            directory: Directory.Cache,
            encoding:  Encoding.UTF8,
        });
        return JSON.parse(result.data as string);
    } catch {
        return null; // Fichier absent = normal au premier REC
    }
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
