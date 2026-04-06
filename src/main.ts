import './style.css';
import { initUI } from './modules/ui';
import { initBatteryManager } from './modules/performance';
import { initNetworkMonitor } from './modules/networkMonitor';
import { initEmbeddedOverview } from './modules/tileLoader';
import { packManager } from './modules/packManager';
import { registerSW } from 'virtual:pwa-register';
import { getInterruptedRecording, clearInterruptedRecording, getPersistedRecordingPoints, getNativeRecordedPoints, mergeAndDeduplicatePoints, stopRecordingService, clearNativeRecordedPoints, isRecordingServiceRunning } from './modules/foregroundService';
import { showToast } from './modules/utils';
import { state } from './modules/state';
import { eventBus } from './modules/eventBus';
import { sheetManager } from './modules/ui/core/SheetManager';


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

// Système unifié de recovery au démarrage. Trois cas distincts :
//   1. Service natif TOUJOURS ACTIF (notification visible, GPS continue) →
//      Reprise TRANSPARENTE : state.isRecording=true, recordedPoints=merged, aucun prompt.
//      L'utilisateur voit son REC continuer comme si rien ne s'était passé.
//   2. Service MORT mais points persistés (≥2) → prompt "Restaurer / Supprimer".
//   3. Pas assez de points → nettoyage silencieux.
window.addEventListener('suntrail:uiReady', async () => {
    const interrupted = getInterruptedRecording();

    try {
        const serviceRunning = await isRecordingServiceRunning();
        const [jsPoints, nativePoints] = await Promise.all([
            getPersistedRecordingPoints(),
            getNativeRecordedPoints(),
        ]);
        const merged = mergeAndDeduplicatePoints(jsPoints ?? [], nativePoints);

        // Cas 1 : service actif → reprise transparente (pas de prompt, REC continue)
        if (serviceRunning && merged.length >= 1) {
            state.recordedPoints = merged;
            state.isRecording = true;
            // v5.24.4: Restaurer recordingOriginTile depuis le snapshot pour cohérence géographique
            if (interrupted?.originTile) {
                state.recordingOriginTile = interrupted.originTile;
            }
            setTimeout(() => sheetManager.open('track'), 300);
            showToast(`▶ Enregistrement repris — ${merged.length} points`);
            return;
        }

        // Cas 2 : service arrêté, assez de points → prompt recovery
        if (merged.length >= 2) {
            state.recoveredPoints = merged;
            // v5.24.4: Restaurer recordingOriginTile depuis le snapshot pour cohérence géographique
            if (interrupted?.originTile) {
                state.recordingOriginTile = interrupted.originTile;
            }
            setTimeout(() => sheetManager.open('track'), 300);
            eventBus.emit('recordingRecovered');
            return;
        }

        // Cas 3 : pas assez de points → nettoyage
        if (interrupted) {
            const mins = Math.round((Date.now() - interrupted.startTime) / 60000);
            clearInterruptedRecording();
            void stopRecordingService();
            if (merged.length > 0) {
                showToast(`⚠️ Enregistrement interrompu après ${mins} min — données insuffisantes`);
            }
        } else if (merged.length > 0) {
            // Points orphelins sans snapshot → nettoyer silencieusement
            void clearNativeRecordedPoints();
            void stopRecordingService();
        }
    } catch {
        if (interrupted) {
            const mins = Math.round((Date.now() - interrupted.startTime) / 60000);
            clearInterruptedRecording();
            void stopRecordingService();
            showToast(`⚠️ Enregistrement interrompu après ${mins} min — récupération échouée`);
        }
    }
}, { once: true });

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

