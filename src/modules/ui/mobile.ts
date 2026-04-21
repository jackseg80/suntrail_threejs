import { App } from '@capacitor/app';
import { sheetManager } from './core/SheetManager';
import { state } from '../state';
import { startLocationTracking, isWatchActive } from '../location';
import { nativeGPSService } from '../nativeGPSService';
import { updateRecordedTrackMesh } from '../terrain';

/**
 * Initializes mobile-specific UI logic, such as back button handling.
 * This is primarily for Android/Capacitor environments.
 * 
 * v5.25.0 - Single Source of Truth : le natif Android gère entièrement
 * l'enregistrement GPS. Le JS n'a plus besoin de persister ou merger.
 */
export function initMobileUI(): void {
    App.addListener('backButton', (data) => {
        const activeSheetId = sheetManager.getActiveSheetId();

        if (activeSheetId) {
            sheetManager.close();
        } else if (!data.canGoBack) {
            App.exitApp();
        } else {
            window.history.back();
        }
    }).catch(() => {});

    // Gestion du cycle de vie Android (v5.25.0)
    // — Background : le natif continue d'enregistrer dans SQLite
    // — Resume    : récupérer les nouveaux points depuis le natif
    let _wasRecordingWhenBackgrounded = false;

    App.addListener('appStateChange', async ({ isActive }) => {
        if (!isActive) {
            // App passe en background
            // Le natif continue d'enregistrer automatiquement dans SQLite
            if (state.isRecording) {
                _wasRecordingWhenBackgrounded = true;
            }
        } else {
            // App revient en foreground
            if (_wasRecordingWhenBackgrounded && state.isRecording && state.currentCourseId) {
                _wasRecordingWhenBackgrounded = false;

                // Récupérer les points enregistrés pendant le background
                // v5.34.9 : Utilisation de syncPoints() pour garantir le filtrage (cleanGPSTrack)
                // et éviter les artefacts de "champignons" liés aux points (0,0) injectés.
                await nativeGPSService.syncPoints();

                // Relancer watchPosition si le callback est mort avec la WebView
                // (pour l'affichage UI uniquement, pas pour l'enregistrement)
                if (!isWatchActive()) {
                    await startLocationTracking();
                }
            }
        }
    }).catch(() => {});
}
