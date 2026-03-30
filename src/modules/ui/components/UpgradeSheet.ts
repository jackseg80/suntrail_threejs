import { BaseComponent } from '../core/BaseComponent';
import { sheetManager } from '../core/SheetManager';
import { showToast } from '../../utils';
import { haptic } from '../../haptics';
import { iapService } from '../../iapService';

export class UpgradeSheet extends BaseComponent {
    /** Guard : loadPrices() ne s'exécute qu'une seule fois (évite le burst getOfferings) */
    private _pricesLoaded = false;

    constructor() {
        super('template-upgrade', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        const closeBtn = this.element.querySelector('#close-upgrade');
        closeBtn?.addEventListener('click', () => sheetManager.close());

        // Afficher les prix réels depuis RevenueCat — une seule fois
        if (!this._pricesLoaded) {
            this._pricesLoaded = true;
            this.loadPrices();
        }

        // Helper commun pour les 3 boutons d'achat
        const handlePurchase = async (
            btn: HTMLButtonElement,
            type: 'yearly' | 'monthly' | 'lifetime'
        ) => {
            btn.classList.add('btn-loading');
            btn.setAttribute('aria-busy', 'true');
            void haptic('medium');
            const success = await iapService.purchase(type);
            btn.classList.remove('btn-loading');
            btn.removeAttribute('aria-busy');
            if (success) {
                void haptic('success');
                // Toast géré par grantProAccess() dans iap.ts — pas de doublon ici
                sheetManager.close();
            } else {
                // Achat annulé, non disponible ou offres non configurées
                showToast('Achat impossible — vérifiez votre connexion ou réessayez.'); // TODO i18n
            }
        };

        // CTA — achat annuel (offre mise en avant)
        const ctaBtn = this.element.querySelector<HTMLButtonElement>('#upgrade-cta-btn');
        ctaBtn?.addEventListener('click', () => { void handlePurchase(ctaBtn, 'yearly'); });

        // Bouton mensuel
        const monthlyBtn = this.element.querySelector<HTMLButtonElement>('#upgrade-monthly-btn');
        monthlyBtn?.addEventListener('click', () => { void handlePurchase(monthlyBtn, 'monthly'); });

        // Bouton lifetime
        const lifetimeBtn = this.element.querySelector<HTMLButtonElement>('#upgrade-lifetime-btn');
        lifetimeBtn?.addEventListener('click', () => { void handlePurchase(lifetimeBtn, 'lifetime'); });

        // Restaurer les achats
        const restoreBtn = this.element.querySelector('#upgrade-restore-btn');
        restoreBtn?.addEventListener('click', async () => {
            showToast('Restauration en cours…'); // TODO i18n
            const restored = await iapService.restorePurchases();
            if (restored) {
                void haptic('success');
                showToast('✅ Achats restaurés !'); // TODO i18n
                sheetManager.close();
            } else {
                showToast('Aucun achat à restaurer.'); // TODO i18n
            }
        });
    }

    private async loadPrices(): Promise<void> {
        const prices = await iapService.getPrices();
        // Mettre à jour les prix affichés si les éléments existent
        const yearlyPriceEl = this.element?.querySelector('#upgrade-yearly-price');
        const monthlyPriceEl = this.element?.querySelector('#upgrade-monthly-price');
        const lifetimePriceEl = this.element?.querySelector('#upgrade-lifetime-price');
        if (yearlyPriceEl) yearlyPriceEl.textContent = prices.yearly;
        if (monthlyPriceEl) monthlyPriceEl.textContent = prices.monthly;
        if (lifetimePriceEl) lifetimePriceEl.textContent = prices.lifetime;

        // Les prix sont mis à jour via les spans dédiés — ne pas écraser le HTML du bouton
    }
}
