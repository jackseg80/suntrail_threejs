import './style.css';
import { initUI } from './modules/ui';
import { initBatteryManager } from './modules/performance';
import { initNetworkMonitor } from './modules/networkMonitor';
import { initEmbeddedOverview } from './modules/tileLoader';
import { packManager } from './modules/packManager';
import { registerSW } from 'virtual:pwa-register';
import { getInterruptedRecording, clearInterruptedRecording, stopRecordingService } from './modules/foregroundService';
import { nativeGPSService } from './modules/nativeGPSService';
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

// Système unifié de recovery au démarrage (v5.24 - Single Source of Truth).
// Le natif Android (FusedLocationProviderClient) est la SEULE source de vérité.
// Plus de fusion, plus de doublons - on récupère les points directement depuis le natif.
//
// Deux cas distincts :
//   1. Course native TOUJOURS ACTIVE (service vivant, notification visible) → 
//      Reprise TRANSPARENTE : state.isRecording=true, recordedPoints=viennent du natif, aucun prompt.
//   2. Course native ARRETÉE (crash/kill) mais snapshot localStorage → 
//      On récupère les points via nativeGPSService.getAllPoints() et on propose la restauration.
window.addEventListener('suntrail:uiReady', async () => {
    const interrupted = getInterruptedRecording();

    try {
        // Récupérer l'état de la course native
        const currentCourse = await nativeGPSService.getCurrentCourse();

        // Cas 1 : service natif actif → reprise transparente
        if (currentCourse && currentCourse.isRunning) {
            // Récupérer tous les points depuis le natif (Single Source of Truth)
            const allPoints = await nativeGPSService.getAllPoints(currentCourse.courseId);
            
            state.recordedPoints = allPoints;
            state.isRecording = true;
            state.currentCourseId = currentCourse.courseId;
            
            // Restaurer recordingOriginTile depuis le natif si disponible
            if (currentCourse.originTile) {
                state.recordingOriginTile = currentCourse.originTile;
            }
            
            // Reprendre l'écoute des événements natifs
            nativeGPSService.setupListeners();
            
            setTimeout(() => sheetManager.open('track'), 300);
            showToast(`▶ Enregistrement repris — ${allPoints.length} points`);
            return;
        }

        // Cas 2 : service natif arrêté mais snapshot existant → prompt recovery
        if (interrupted) {
            // Essayer de récupérer les points depuis le natif (si le service a été restart)
            let recoveredPoints: { lat: number; lon: number; alt: number; timestamp: number; id?: number; accuracy?: number }[] = [];
            if (currentCourse?.courseId) {
                recoveredPoints = await nativeGPSService.getAllPoints(currentCourse.courseId);
            }
            
            if (recoveredPoints.length >= 2) {
                state.recoveredPoints = recoveredPoints;
                if (interrupted.originTile) {
                    state.recordingOriginTile = interrupted.originTile;
                }
                setTimeout(() => sheetManager.open('track'), 300);
                eventBus.emit('recordingRecovered');
                return;
            }
            
            // Pas assez de points ou récupération échouée → nettoyage
            const mins = Math.round((Date.now() - interrupted.startTime) / 60000);
            clearInterruptedRecording();
            void stopRecordingService();
            if (recoveredPoints.length > 0) {
                showToast(`⚠️ Enregistrement interrompu après ${mins} min — données insuffisantes`);
            }
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

