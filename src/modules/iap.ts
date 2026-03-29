/**
 * iap.ts — Freemium gate helpers
 *
 * Centralise les appels au paywall. Actuellement : toast informatif.
 * Sprint IAP : remplacer showUpgradePrompt() par l'ouverture de l'UpgradeSheet.
 */

import { showToast } from './utils';
import { saveProStatus } from './state';
import { state } from './state';
import { sheetManager } from './ui/core/SheetManager';

// Messages par feature (sera remplacé par i18n quand les clés seront ajoutées)
const FEATURE_LABELS: Record<string, string> = {
    lod_18:      'LOD 18 (détail max)',
    satellite:   'Couche Satellite',
    multi_gpx:   'Multi-tracés GPX',
    export_gpx:  'Export GPX',
    rec_unlimited: 'Enregistrement illimité',
    offline_multi: 'Zones offline illimitées',
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
