import './style.css';
import { initUI } from './modules/ui';
import { initBatteryManager } from './modules/performance';
import { registerSW } from 'virtual:pwa-register';
import { getInterruptedRecording, clearInterruptedRecording, getPersistedRecordingPoints, stopRecordingService } from './modules/foregroundService';
import { showToast } from './modules/utils';
import { state } from './modules/state';
import { eventBus } from './modules/eventBus';


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
    // Ne pas nettoyer immédiatement — tenter de récupérer les points persistés
    window.addEventListener('suntrail:uiReady', async () => {
        try {
            const points = await getPersistedRecordingPoints();
            if (points && points.length >= 2) {
                // Stocker les points récupérés pour que TrackSheet propose la restauration
                state.recoveredPoints = points;
                eventBus.emit('recordingRecovered');
            } else {
                // Pas assez de points récupérables — nettoyage + info
                const mins = Math.round((Date.now() - interrupted.startTime) / 60000);
                clearInterruptedRecording();
                void stopRecordingService();
                showToast(`⚠️ Enregistrement interrompu après ${mins} min — données insuffisantes`);
            }
        } catch {
            const mins = Math.round((Date.now() - interrupted.startTime) / 60000);
            clearInterruptedRecording();
            void stopRecordingService();
            showToast(`⚠️ Enregistrement interrompu après ${mins} min — récupération échouée`);
        }
    }, { once: true });
}

// Lancement de l'initialisation globale de l'interface
initUI();
initBatteryManager();

