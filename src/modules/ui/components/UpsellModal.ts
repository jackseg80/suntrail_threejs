import { BaseComponent } from '../core/BaseComponent';
import { isProActive } from '../../state';
import { sheetManager } from '../core/SheetManager';

/**
 * UpsellModal.ts — Interstitiel de démarrage pour inciter au passage Pro.
 * S'affiche au boot (logique de fréquence localstorage).
 */
export class UpsellModal extends BaseComponent {
    private static readonly LAST_SHOW_KEY = 'suntrail_upsell_last_show';
    private static readonly SHOW_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1x par 24h

    constructor() {
        super('template-upgrade', 'sheet-container'); // On réutilise le template upgrade pour la cohérence
    }

    public render(): void {
        // No specific rendering logic needed for this component
    }

    public static tryShow(): void {
        // Ne pas afficher en mode test E2E (Playwright) ou si explicitement désactivé
        const isTest = window.location.search.includes('mode=test') || 
                       (window as any).IS_E2E || 
                       navigator.userAgent.includes('Playwright') ||
                       navigator.webdriver;
        
        if (isTest) {
            console.log('[UpsellModal] Test mode detected (webdriver/useragent), skipping.');
            return;
        }
        // 1. Pas déjà Pro (achat ou trial)
        // 2. Pas affiché depuis > 24h
        // 3. Pas au tout premier démarrage (on laisse l'utilisateur découvrir)
        
        if (isProActive()) return;

        const lastShow = parseInt(localStorage.getItem(this.LAST_SHOW_KEY) || '0');
        const now = Date.now();

        if (now - lastShow < this.SHOW_INTERVAL_MS) return;

        // On affiche
        localStorage.setItem(this.LAST_SHOW_KEY, now.toString());
        
        // On attend que la scène soit un peu chargée (2s)
        setTimeout(() => {
            if (isProActive()) return; // Re-check
            sheetManager.open('upgrade-sheet');
        }, 3000);
    }
}
