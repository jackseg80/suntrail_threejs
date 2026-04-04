import './style.css';
import { initUI } from './modules/ui';
import { initBatteryManager } from './modules/performance';
import { initNetworkMonitor } from './modules/networkMonitor';
import { initEmbeddedOverview } from './modules/tileLoader';
import { packManager } from './modules/packManager';
import { registerSW } from 'virtual:pwa-register';
import { getInterruptedRecording, clearInterruptedRecording, getPersistedRecordingPoints, getNativeRecordedPoints, mergeAndDeduplicatePoints, stopRecordingService } from './modules/foregroundService';
import { showToast } from './modules/utils';
import { state } from './modules/state';
import { eventBus } from './modules/eventBus';


// Enregistrement du Service Worker pour le mode Hors-ligne (PWA)
// skipWaiting + clientsClaim = le nouveau SW prend le contrôle immédiatement.
// onNeedRefresh recharge la page pour que le navigateur serve les nouveaux fichiers.
registerSW({
  onNeedRefresh() {
    console.log("[SW] Nouvelle version détectée — rechargement…");
    window.location.reload();
  },
  onOfflineReady() {
    console.log("[SW] SunTrail est prêt à fonctionner hors-ligne.");
  },
});

// Vérifier si un enregistrement a été interrompu par Android (app tuée en background)
const interrupted = getInterruptedRecording();
if (interrupted) {
    // Ne pas nettoyer immédiatement — tenter de récupérer les points persistés
    window.addEventListener('suntrail:uiReady', async () => {
        try {
            // Lire en parallèle les points JS (Filesystem) et natifs (RecordingService.java)
            const [jsPoints, nativePoints] = await Promise.all([
                getPersistedRecordingPoints(),
                getNativeRecordedPoints(),
            ]);
            const merged = mergeAndDeduplicatePoints(jsPoints ?? [], nativePoints);
            if (merged.length >= 2) {
                // Stocker les points récupérés pour que TrackSheet propose la restauration
                state.recoveredPoints = merged;
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

// Détection réseau (event-driven, zéro polling) — avant initUI pour que state.isNetworkAvailable
// soit disponible quand l'overlay de chargement vérifie la connectivité
void initNetworkMonitor();

// Monte l'archive de tuiles overview embarquée (LOD 5-7, Europe) — fire-and-forget
void initEmbeddedOverview();

// Initialise le gestionnaire de packs pays (mount packs installés) — fire-and-forget
void packManager.initialize();

// Lancement de l'initialisation globale de l'interface
initUI();
initBatteryManager();

