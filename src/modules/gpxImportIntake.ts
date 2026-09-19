/**
 * gpxImportIntake.ts — Réception OS des GPX (Android, v5.91)
 *
 * Un fichier ouvert via « Ouvrir avec » ou partagé depuis une autre application
 * est lu côté natif puis transmis ici. Le fichier emprunte ensuite exactement le
 * même pipeline que l'import manuel (`importGpxTrack`).
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { importGpxTrack } from './gpxImportFlow';
import { showToast } from './toast';
import { i18n } from '../i18n/I18nService';
import { state } from './state';

export type SharedGpxError = 'not-gpx' | 'too-large' | 'read-failed';

export interface SharedGpxFile {
    name: string;
    xml?: string;
    error?: SharedGpxError;
}

export interface SharedGpxPayload {
    files: SharedGpxFile[];
}

interface GpxImportListenerHandle {
    remove: () => Promise<void>;
}

interface GpxImportNativePlugin {
    addListener(
        eventName: 'gpxImportReceived',
        listener: (payload: SharedGpxPayload) => void
    ): Promise<GpxImportListenerHandle>;
    openAppAssociationSettings(): Promise<void>;
}

const gpxImportNative = registerPlugin<GpxImportNativePlugin>('GpxImport');

const ERROR_KEYS: Record<SharedGpxError, string> = {
    'not-gpx': 'gpx.shareNotGpx',
    'too-large': 'gpx.shareTooLarge',
    'read-failed': 'gpx.shareReadFailed',
};

let importQueue: Promise<void> = Promise.resolve();

async function processFiles(payload: SharedGpxPayload): Promise<void> {
    const files = payload?.files ?? [];
    if (files.length === 0) return;
    for (const file of files) {
        if (!file.xml) {
            showToast(
                i18n.t(
                    ERROR_KEYS[file.error ?? 'read-failed'] ?? 'gpx.importError'
                )
            );
            continue;
        }
        try {
            await importGpxTrack(file.xml, file.name || 'track.gpx');
        } catch (error) {
            if (state.DEBUG_MODE)
                console.error('[GPX] Shared import failed', error);
            showToast(i18n.t('gpx.importError'));
        }
    }
}

/**
 * Sérialise les événements natifs : Android peut livrer un second partage
 * pendant que le dialogue du premier import est encore ouvert.
 */
export function enqueueSharedGpxImport(
    payload: SharedGpxPayload
): Promise<void> {
    importQueue = importQueue
        .then(() => processFiles(payload))
        .catch((error) => {
            if (state.DEBUG_MODE)
                console.error('[GPX] Shared import queue failed', error);
            showToast(i18n.t('gpx.importError'));
        });
    return importQueue;
}

/**
 * Écoute les GPX reçus par le système. Le natif retient l'événement jusqu'à ce
 * qu'un premier écouteur soit posé, ce qui couvre le démarrage à froid.
 */
export async function initGpxImportIntake(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
        await gpxImportNative.addListener(
            'gpxImportReceived',
            (payload) => void enqueueSharedGpxImport(payload)
        );
    } catch (error) {
        if (state.DEBUG_MODE) console.error('[GPX] Intake init failed', error);
    }
}

/**
 * Ouvre les réglages Android d'association de l'application. Android interdit
 * de définir un gestionnaire par défaut par programme : on guide donc
 * l'utilisateur vers l'écran système correspondant.
 */
export async function openGpxAssociationSettings(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    try {
        await gpxImportNative.openAppAssociationSettings();
        return true;
    } catch (error) {
        if (state.DEBUG_MODE)
            console.error('[GPX] Association settings failed', error);
        return false;
    }
}
