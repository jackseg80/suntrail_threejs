import './style.css';
import { initUI } from './modules/ui';
import { initBatteryManager } from './modules/performance';
import { initNetworkMonitor } from './modules/networkMonitor';
import { initEmbeddedOverview } from './modules/tileLoader';
import { packManager } from './modules/packManager';
import { registerSW } from 'virtual:pwa-register';
import { nativeGPSService } from './modules/nativeGPSService';
import { showToast } from './modules/toast';
import { state } from './modules/state';
import { eventBus } from './modules/eventBus';
import { sheetManager } from './modules/ui/core/SheetManager';


// Enregistrement du Service Worker pour le mode Hors-ligne (PWA)
registerSW({
  onNeedRefresh() {
    console.log("[SW] Nouvelle version détectée — rechargement…");
    window.location.reload();
  },
  onOfflineReady() {
    console.log("[SW] SunTrail est prêt à fonctionner hors-ligne.");
  },
});

// Lancement de l'initialisation globale de l'interface (v5.28.39)
// On utilise requestAnimationFrame pour laisser le navigateur souffler (Splash screen / CSS) 
// avant de lancer le moteur Three.js qui est gourmand en CPU au démarrage.
requestAnimationFrame(() => {
    initUI();
    initBatteryManager();
});


// Système unifié de recovery au démarrage (v5.28.1 - Unification native).
window.addEventListener('suntrail:uiReady', async () => {
    try {
        // Chargement asynchrone des services lents en arrière-plan
        void initNetworkMonitor();
        void initEmbeddedOverview();
        void packManager.initialize();

        // Initialisation unifiée (Natif + Preferences)
        await nativeGPSService.init();

        // Cas 1 : Course native toujours active (reprise transparente)
        if (state.isRecording && state.recordedPoints.length > 0) {
            setTimeout(() => sheetManager.open('track'), 300);
            showToast(`▶ Enregistrement repris — ${state.recordedPoints.length} points`);
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
        // Tente d'afficher l'interstitiel Pro ( Discovery Trial )
        const { UpsellModal } = await import('./modules/ui/components/UpsellModal');
        UpsellModal.tryShow();
    }
}, { once: true });

