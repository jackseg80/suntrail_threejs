/**
 * foregroundService.ts — Wrapper JS pour le Foreground Service Android (v5.23)
 *
 * Remplit deux rôles :
 *   1. Démarre/arrête le RecordingService natif Android pour maintenir le processus
 *      en vie quand l'app est en arrière-plan pendant un enregistrement.
 *      Depuis v5.23 : le service enregistre aussi les points GPS nativement via
 *      FusedLocationProviderClient, indépendamment du cycle de vie de la WebView.
 *   2. Persiste l'état d'enregistrement dans localStorage comme fallback — si l'app
 *      est quand même tuée, l'utilisateur peut reprendre à son retour.
 *
 * Sur web/navigateur : les appels natifs sont ignorés silencieusement.
 */

import { registerPlugin, Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import type { LocationPoint } from './state';

// ── Types ──────────────────────────────────────────────────────────────────────
interface RecordingPlugin {
    startForeground(options?: {
        interval?: number;
        minDisplacement?: number;
        highAccuracy?: boolean;
    }): Promise<void>;
    stopForeground(): Promise<void>;
    isRunning(): Promise<{ running: boolean }>;
    getRecordedPoints(): Promise<{ points: LocationPoint[] }>;
    clearRecordedPoints(): Promise<void>;
    requestBatteryOptimizationExemption(): Promise<{ granted: boolean }>;
}

interface RecordingSnapshot {
    isRecording: boolean;
    startTime: number;
    pointCount: number;
    originTile?: { x: number; y: number; z: number };
}

// ── Plugin natif (no-op sur web) ───────────────────────────────────────────────
const RecordingNative = Capacitor.isNativePlatform()
    ? registerPlugin<RecordingPlugin>('Recording')
    : null;

const SNAPSHOT_KEY        = 'suntrail_rec_snapshot_v1';
const POINTS_FILE         = 'suntrail_rec_points_v1.json';
const PERSIST_EVERY_N     = 1;       // Persister chaque nouveau point (v5.23 — réduit de 10)
const PERSIST_INTERVAL_MS = 5_000;   // …ou toutes les 5 secondes (v5.23 — réduit de 20s)

let _lastPersistedCount = 0;
let _lastPersistTime    = 0;

// ── API publique ───────────────────────────────────────────────────────────────

/**
 * Démarre le Foreground Service et persiste l'état.
 * Appelé quand l'utilisateur active REC.
 */
export async function startRecordingService(originTile?: { x: number; y: number; z: number }): Promise<void> {
    const snapshot: RecordingSnapshot = {
        isRecording: true,
        startTime:   Date.now(),
        pointCount:  0,
        originTile:  originTile,
    };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));

    _lastPersistedCount = 0;
    _lastPersistTime    = Date.now();

    if (RecordingNative) {
        try {
            await RecordingNative.startForeground({
                interval:        2000,        // v5.23.4: 2s au lieu de 3s (plus fluide)
                minDisplacement: 3.0,         // v5.23.4: 3m au lieu de 0.5m (évite dérive GPS)
                highAccuracy:    true,
            });
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

    _lastPersistedCount = 0;
    _lastPersistTime    = 0;
    if (Capacitor.isNativePlatform()) {
        Filesystem.deleteFile({ path: POINTS_FILE, directory: Directory.Cache })
            .catch(() => { /* fichier absent = normal si aucun point persisté */ });
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
    points?: LocationPoint[]
): void {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return;
    try {
        const snapshot: RecordingSnapshot = JSON.parse(raw);
        snapshot.pointCount = pointCount;
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch { /* ignore */ }

    if (!points || !Capacitor.isNativePlatform()) return;
    const now = Date.now();
    const newPoints = pointCount - _lastPersistedCount;
    if (newPoints >= PERSIST_EVERY_N || now - _lastPersistTime >= PERSIST_INTERVAL_MS) {
        _lastPersistedCount = pointCount;
        _lastPersistTime    = now;
        // Fire-and-forget — non-bloquant pendant le callback GPS
        Filesystem.writeFile({
            path:      POINTS_FILE,
            data:      JSON.stringify(points),
            directory: Directory.Cache,
            encoding:  Encoding.UTF8,
        }).catch(e => console.warn('[RecordingService] points persist failed:', e));
    }
}

/**
 * Persiste immédiatement et de façon bloquante tous les points sur disque.
 * Appelé lors du passage en background (appStateChange) pour éviter toute perte.
 */
export async function persistAllPointsNow(points: LocationPoint[]): Promise<void> {
    if (!Capacitor.isNativePlatform() || points.length === 0) return;
    try {
        await Filesystem.writeFile({
            path:      POINTS_FILE,
            data:      JSON.stringify(points),
            directory: Directory.Cache,
            encoding:  Encoding.UTF8,
        });
        _lastPersistedCount = points.length;
        _lastPersistTime    = Date.now();
    } catch (e) {
        console.warn('[RecordingService] persistAllPointsNow failed:', e);
    }
}

/**
 * Lit les points d'enregistrement persistés sur le filesystem (après un kill Android).
 * Retourne null si aucun fichier ou si on est sur web.
 */
export async function getPersistedRecordingPoints(): Promise<LocationPoint[] | null> {
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
 * Récupère les points enregistrés nativement par RecordingService.java
 * (via FusedLocationProviderClient) pendant que la WebView était morte/suspendue.
 */
export async function getNativeRecordedPoints(): Promise<LocationPoint[]> {
    if (!RecordingNative) return [];
    try {
        const result = await RecordingNative.getRecordedPoints();
        return result.points || [];
    } catch {
        return [];
    }
}

/**
 * Vérifie si le Foreground Service natif d'enregistrement tourne encore.
 * Permet de différencier au démarrage de l'app :
 *   - service vivant → reprise transparente (REC continue, pas de prompt)
 *   - service mort   → prompt recovery "Restaurer / Supprimer"
 */
export async function isRecordingServiceRunning(): Promise<boolean> {
    if (!RecordingNative) return false;
    try {
        const result = await RecordingNative.isRunning();
        return result.running === true;
    } catch {
        return false;
    }
}

/**
 * Efface le fichier de points natifs (après merge réussi).
 */
export async function clearNativeRecordedPoints(): Promise<void> {
    if (!RecordingNative) return;
    try {
        await RecordingNative.clearRecordedPoints();
    } catch { /* ignore */ }
}

/**
 * Demande à Android d'exempter l'app des optimisations batterie.
 * Appelé une seule fois au démarrage du premier REC.
 * Retourne true si déjà exempté ou si l'utilisateur a accepté.
 */
export async function requestBatteryOptimizationExemption(): Promise<boolean> {
    if (!RecordingNative) return true;
    try {
        const result = await RecordingNative.requestBatteryOptimizationExemption();
        return result.granted;
    } catch {
        return false;
    }
}

/**
 * Fusionne et déduplique deux tableaux de points GPS.
 * Tri par timestamp, suppression des doublons proches (< 500ms).
 * Fonction pure — testable sans dépendances.
 */
export function mergeAndDeduplicatePoints(
    jsPoints: LocationPoint[],
    nativePoints: LocationPoint[]
): LocationPoint[] {
    if (jsPoints.length === 0 && nativePoints.length === 0) return [];

    const all = [...jsPoints, ...nativePoints].sort((a, b) => a.timestamp - b.timestamp);
    const result: LocationPoint[] = [all[0]];

    for (let i = 1; i < all.length; i++) {
        const prev = result[result.length - 1];
        const curr = all[i];
        // Ignorer les points trop proches dans le temps (chevauchement JS/natif)
        if (curr.timestamp - prev.timestamp > 500) {
            result.push(curr);
        }
    }

    return result;
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
