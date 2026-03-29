import './style.css';
import { initUI } from './modules/ui';
import { initBatteryManager } from './modules/performance';
import { registerSW } from 'virtual:pwa-register';
import { getInterruptedRecording, clearInterruptedRecording, stopRecordingService } from './modules/foregroundService';
import { showToast } from './modules/utils';
import { preloadChOverviewTiles } from './modules/tileLoader';

// Enregistrement du Service Worker pour le mode Hors-ligne (PWA)
registerSW({
  onNeedRefresh() {
    console.log("Nouvelle version de SunTrail disponible !");
  },
  onOfflineReady() {
    console.log("SunTrail est prêt à fonctionner hors-ligne !");
  },
});

// Vérifier si un enregistrement a été interrompu par Android (app tuée en background)
const interrupted = getInterruptedRecording();
if (interrupted) {
    const mins = Math.round((Date.now() - interrupted.startTime) / 60000);
    // Nettoyage : le service a été tué, on remet à zéro proprement
    clearInterruptedRecording();
    void stopRecordingService();
    // On affiche un toast après que l'UI soit chargée
    window.addEventListener('suntrail:uiReady', () => {
        showToast(`⚠️ Enregistrement interrompu après ${mins} min — ${interrupted.pointCount} pts sauvegardés`);
    }, { once: true });
}

// Lancement de l'initialisation globale de l'interface
initUI();
initBatteryManager();

// Pré-charge les tuiles Suisse (zoom 6-9) en arrière-plan au premier démarrage
void preloadChOverviewTiles();
