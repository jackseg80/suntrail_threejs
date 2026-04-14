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

// Système unifié de recovery au démarrage (v5.28.1 - Unification native).
window.addEventListener('suntrail:uiReady', async () => {
    try {
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

// Détection réseau (event-driven, zéro polling)
void initNetworkMonitor();

// Monte l'archive de tuiles overview embarquée (LOD 5-7, Europe)
void initEmbeddedOverview();

// Initialise le gestionnaire de packs pays
void packManager.initialize();

// Lancement de l'initialisation globale de l'interface
initUI();
initBatteryManager();
