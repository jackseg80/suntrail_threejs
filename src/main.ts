import './style.css';
import { initUI } from './modules/ui';
import { initBatteryManager } from './modules/performance';
import { initNetworkMonitor } from './modules/networkMonitor';
import { initEmbeddedOverview } from './modules/tileLoader';
import { registerSW } from 'virtual:pwa-register';
import { nativeGPSService } from './modules/nativeGPSService';
import { showToast } from './modules/toast';
import { state } from './modules/state';
import { eventBus } from './modules/eventBus';
import { sheetManager } from './modules/ui/core/SheetManager';

// Détection de changement de version → nettoyage des caches SW (précaches uniquement)
try {
    const VERSION_KEY = 'suntrail_app_version';
    const lastVersion = localStorage.getItem(VERSION_KEY);
    if (lastVersion !== __APP_VERSION__) {
        if ('caches' in window) {
            caches.keys().then((keys) => {
                const toDelete = keys.filter(
                    (k) => k.startsWith('workbox-') // précaches uniquement, pas les runtimes (tiles offline)
                );
                return Promise.all(toDelete.map((k) => caches.delete(k)));
            });
        }
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker
                .getRegistrations()
                .then((regs) => Promise.all(regs.map((r) => r.unregister())));
        }
        localStorage.setItem(VERSION_KEY, __APP_VERSION__);
    }
} catch {
    /* localStorage indisponible */
}

// v5.80.2 : Timestamp défini AVANT registerSW pour le cooldown onNeedRefresh
const _bootStartTime = Date.now();

// Enregistrement du Service Worker pour le mode Hors-ligne (PWA)
registerSW({
    onNeedRefresh() {
        // v5.80.2 : Cooldown 5s pour éviter un reload fantôme au 1er lancement
        // (le version check + réinscription peut déclencher un faux onNeedRefresh
        // après que la carte soit déjà affichée, surtout sur Android/Capacitor)
        if (Date.now() - _bootStartTime < 5000) {
            console.log(
                '[SW] Nouvelle version différée — applied au prochain lancement.'
            );
            return;
        }
        console.log('[SW] Nouvelle version détectée — rechargement…');
        window.location.reload();
    },
    onOfflineReady() {
        console.log('[SW] SunTrail est prêt à fonctionner hors-ligne.');
    },
});

// Lancement de l'initialisation globale de l'interface (v5.29.28)
let _bootStarted = false;
const _doBoot = async () => {
    if (_bootStarted) return;
    _bootStarted = true;
    await initUI();
    await initBatteryManager();
};
requestAnimationFrame(() => {
    // v5.29.28 : On utilise setTimeout 0 pour garantir que le splash screen / CSS est rendu
    // avant de lancer l'initialisation qui peut être bloquante sur certains navigateurs.
    setTimeout(_doBoot, 0);
});
// v5.80.1 : Safety fallback — sur certains devices Android (1er lancement après install/màj
// depuis le Play Store), requestAnimationFrame peut ne jamais se déclencher. Ce setTimeout
// garantit que l'app démarre même si rAF reste muet.
setTimeout(_doBoot, 800);

// Système unifié de recovery au démarrage (v5.28.1 - Unification native).
window.addEventListener(
    'suntrail:uiReady',
    async () => {
        try {
            // Chargement asynchrone des services lents en arrière-plan
            void initNetworkMonitor();
            // initCacheLayer() déjà appelé dans appInit.ts (avant loadTerrain)
            // → initEmbeddedOverview() ne fait plus que charger le PMTiles
            void initEmbeddedOverview();

            // Initialisation unifiée (Natif + Preferences)
            await nativeGPSService.init();
            const { guidanceForegroundService } =
                await import('./modules/guidance/GuidanceForegroundService');
            await guidanceForegroundService.recoverNativeSession();

            // Cas 1 : Course native toujours active (reprise transparente)
            if (state.isRecording && state.recordedPoints.length > 0) {
                setTimeout(() => sheetManager.open('track'), 300);
                showToast(
                    `▶ Enregistrement repris — ${state.recordedPoints.length} points`
                );
                return;
            }

            // Cas 2 : Crash détecté (points en mémoire mais pas d'enregistrement actif)
            // Note: nativeGPSService.init a rempli recordedPoints depuis Preferences
            if (!state.isRecording && state.recordedPoints.length >= 2) {
                state.recoveredPoints = [...state.recordedPoints];
                state.recordedPoints = [];
                setTimeout(() => sheetManager.open('track'), 300);
                eventBus.emit('recordingRecovered');
            }
        } catch (e) {
            console.error('[Main] Recovery failure:', e);
        } finally {
            // Tente d'afficher l'interstitiel Pro ( Google Play Trial )
            const { UpsellModal } =
                await import('./modules/ui/components/UpsellModal');
            UpsellModal.tryShow();
        }
    },
    { once: true }
);
