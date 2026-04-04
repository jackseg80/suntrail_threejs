import { App } from '@capacitor/app';
import { sheetManager } from './core/SheetManager';
import { state } from '../state';
import { persistAllPointsNow, getNativeRecordedPoints, mergeAndDeduplicatePoints } from '../foregroundService';
import { startLocationTracking, isWatchActive } from '../location';
import { updateRecordedTrackMesh } from '../terrain';

/**
 * Initializes mobile-specific UI logic, such as back button handling.
 * This is primarily for Android/Capacitor environments.
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

    // Gestion du cycle de vie Android (v5.23)
    // — Background : persist immédiatement tous les points pour éviter la perte de données
    // — Resume    : relancer watchPosition si mort, merger les points natifs accumulés
    let _wasRecordingWhenBackgrounded = false;

    App.addListener('appStateChange', async ({ isActive }) => {
        if (!isActive) {
            // App passe en background
            if (state.isRecording && state.recordedPoints.length > 0) {
                await persistAllPointsNow(state.recordedPoints);
                _wasRecordingWhenBackgrounded = true;
            }
        } else {
            // App revient en foreground
            if (_wasRecordingWhenBackgrounded && state.isRecording) {
                _wasRecordingWhenBackgrounded = false;

                // Merger les points enregistrés nativement pendant que la WebView était suspendue
                const nativePoints = await getNativeRecordedPoints();
                if (nativePoints.length > 0) {
                    state.recordedPoints = mergeAndDeduplicatePoints(
                        state.recordedPoints,
                        nativePoints
                    );
                    updateRecordedTrackMesh();
                }

                // Relancer watchPosition si le callback est mort avec la WebView
                if (!isWatchActive()) {
                    await startLocationTracking();
                }
            }
        }
    }).catch(() => {});
}
