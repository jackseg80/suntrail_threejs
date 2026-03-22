import './style.css';
import { initUI } from './modules/ui';
// @ts-ignore
import { registerSW } from 'virtual:pwa-register';

// Enregistrement du Service Worker pour le mode Hors-ligne (PWA)
const updateSW = registerSW({
  onNeedRefresh() {
    // Proposer de rafraîchir l'application s'il y a une mise à jour
    console.log("Nouvelle version de SunTrail disponible !");
  },
  onOfflineReady() {
    console.log("SunTrail est prêt à fonctionner hors-ligne !");
  },
});

// Lancement de l'initialisation globale de l'interface
initUI();
