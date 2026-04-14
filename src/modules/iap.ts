/**
 * iap.ts — Freemium gate helpers
 *
 * Centralise les appels au paywall. Actuellement : toast informatif.
 * Sprint IAP : remplacer showUpgradePrompt() par l'ouverture de l'UpgradeSheet.
 */

import { showToast } from './toast';
import { saveProStatus, state } from './state';
export { isProActive, activateDiscoveryTrial } from './state';
import { sheetManager } from './ui/core/SheetManager';

// Messages par feature (sera remplacé par i18n quand les clés seront ajoutées)
const FEATURE_LABELS: Record<string, string> = {
    lod_18:           'LOD 18 (détail max)',
    satellite:        'Couche Satellite',
    multi_gpx:        'Tracés GPX illimités — comparez vos sorties côte à côte',
    export_gpx:       'Export GPX',
    rec_unlimited:    'Enregistrement illimité',
    offline_multi:    'Zones offline illimitées',
    solar_calendar:   'Calendrier solaire — simulez n\'importe quelle date',
    rec_stats:        'Stats avancées REC (VAM, Naismith) + Export GPX',
    weather_extended: 'Prévisions 3-5 jours + alertes montagne',
    weather_pro:      'Station Météo Pro complète',
    inclinometer:     'Inclinomètre numérique PRO',
};

/**
 * Affiche le prompt d'upgrade pour une feature Pro.
 * @param feature - identifiant de la feature bloquée
 */
export function showUpgradePrompt(feature: string): void {
    const label = FEATURE_LABELS[feature] ?? feature;
    showToast(`🔒 ${label} — fonctionnalité Pro`);
    sheetManager.open('upgrade-sheet');
}

/**
 * Accorde le statut Pro (appelé après validation IAP par RevenueCat).
 * Point unique de changement d'état Pro → persistance automatique.
 */
export function grantProAccess(): void {
    state.isPro = true;
    
    // Activer toutes les fonctionnalités Pro par défaut
    state.SHOW_BUILDINGS = true;
    state.SHOW_INCLINOMETER = true;
    state.SHOW_WEATHER_PRO = true;
    
    saveProStatus();
    showToast('✅ Accès Pro activé !');
}

/**
 * Révoque le statut Pro (appelé si remboursement ou expiration abonnement).
 */
export function revokeProAccess(): void {
    state.isPro = false;
    saveProStatus();
}
