import { App } from '@capacitor/app';
import { sheetManager } from './core/SheetManager';
import { state } from '../state';
import { startLocationTracking, isWatchActive } from '../location';
import { nativeGPSService } from '../nativeGPSService';
import { eventBus } from '../eventBus';

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
    }).catch((e) => {
        if (state.DEBUG_MODE)
            console.warn('[Mobile] backButton listener failed', e);
    });

    // Gestion du cycle de vie Android (v5.25.0)
    // — Background : le natif continue d'enregistrer dans SQLite
    // — Resume    : récupérer les nouveaux points depuis le natif
    let _wasRecordingWhenBackgrounded = false;

    // OAuth Google — deep link de retour depuis Chrome Custom Tab
    App.addListener('appUrlOpen', async ({ url }) => {
        if (!url.startsWith('com.suntrail.threejs://auth-callback')) return;
        try {
            const { Browser } = await import('@capacitor/browser');
            const { supabase } = await import('../authService');

            // Extract tokens from both query params (Code Flow) and hash fragment (Implicit Flow)
            const urlObj = new URL(url);
            let accessToken = urlObj.searchParams.get('access_token');
            let refreshToken = urlObj.searchParams.get('refresh_token');

            // If not found in query params, try hash fragment
            if (!accessToken && url.includes('#')) {
                const hashPart = url.split('#')[1];
                const hashParams = new URLSearchParams(hashPart);
                accessToken = hashParams.get('access_token');
                refreshToken = hashParams.get('refresh_token');
            }

            let error;
            if (accessToken && refreshToken) {
                // Implicit Flow — tokens directs reçus du callback
                const { error: setError } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken,
                });
                error = setError;
            } else {
                // Code Flow — échanger code pour session
                const { error: exchangeError } =
                    await supabase.auth.exchangeCodeForSession(url);
                error = exchangeError;
            }

            if (error) {
                if (state.DEBUG_MODE)
                    console.error('[OAuth] Auth failed:', error);
                await Browser.close().catch(() => {});
                return;
            }

            // Vérifier que la session est bien établie
            const {
                data: { session },
                error: sessionError,
            } = await supabase.auth.getSession();
            if (sessionError || !session?.user?.id) {
                if (state.DEBUG_MODE)
                    console.error('[OAuth] Session not established');
                await Browser.close().catch(() => {});
                return;
            }

            // Identifier à RevenueCat
            const { iapService } = await import('../iapService');
            await iapService.identify(session.user.id);

            // Fermer le Chrome Custom Tab — revient à l'app native
            await Browser.close();
        } catch (e) {
            if (state.DEBUG_MODE) console.error('[OAuth] Callback error', e);
            try {
                const { Browser } = await import('@capacitor/browser');
                await Browser.close();
            } catch {
                /* Browser close can fail */
            }
        }
    }).catch((e) => {
        if (state.DEBUG_MODE)
            console.warn('[Mobile] appUrlOpen listener failed', e);
    });

    App.addListener('appStateChange', async ({ isActive }) => {
        if (!isActive) {
            // App passe en background
            // Le natif continue d'enregistrer automatiquement dans SQLite
            if (state.isRecording) {
                _wasRecordingWhenBackgrounded = true;
            }
        } else {
            // App revient en foreground
            eventBus.emit('sceneRenderRequested');
            if (
                _wasRecordingWhenBackgrounded &&
                state.isRecording &&
                state.currentCourseId
            ) {
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
    }).catch((e) => {
        if (state.DEBUG_MODE)
            console.warn('[Mobile] appStateChange listener failed', e);
    });
}
