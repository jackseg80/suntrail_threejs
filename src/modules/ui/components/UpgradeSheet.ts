import { BaseComponent } from '../core/BaseComponent';
import { sheetManager } from '../core/SheetManager';
import { showToast } from '../../utils';
import { haptic } from '../../haptics';
import { iapService } from '../../iapService';

export class UpgradeSheet extends BaseComponent {
    constructor() {
        super('template-upgrade', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        const closeBtn = this.element.querySelector('#close-upgrade');
        closeBtn?.addEventListener('click', () => sheetManager.close());

        // Afficher les prix réels depuis RevenueCat dès l'ouverture
        this.loadPrices();

        // CTA — achat annuel (offre mise en avant)
        const ctaBtn = this.element.querySelector<HTMLButtonElement>('#upgrade-cta-btn');
        ctaBtn?.addEventListener('click', async () => {
            if (!ctaBtn) return;
            ctaBtn.classList.add('btn-loading');
            ctaBtn.setAttribute('aria-busy', 'true');
            void haptic('medium');
            const success = await iapService.purchase('yearly');
            ctaBtn.classList.remove('btn-loading');
            ctaBtn.removeAttribute('aria-busy');
            if (success) {
                void haptic('success');
                showToast('✅ Accès Pro activé !'); // TODO i18n
                sheetManager.close();
            }
        });

        // Bouton mensuel (si présent dans le template)
        const monthlyBtn = this.element.querySelector<HTMLButtonElement>('#upgrade-monthly-btn');
        monthlyBtn?.addEventListener('click', async () => {
            void haptic('medium');
            const success = await iapService.purchase('monthly');
            if (success) { void haptic('success'); sheetManager.close(); }
        });

        // Bouton lifetime (si présent dans le template)
        const lifetimeBtn = this.element.querySelector<HTMLButtonElement>('#upgrade-lifetime-btn');
        lifetimeBtn?.addEventListener('click', async () => {
            void haptic('medium');
            const success = await iapService.purchase('lifetime');
            if (success) { void haptic('success'); sheetManager.close(); }
        });

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

        // Mettre à jour le label du CTA
        const ctaBtn = this.element?.querySelector('#upgrade-cta-btn');
        if (ctaBtn) ctaBtn.textContent = `Activer Pro — ${prices.yearly}`; // TODO i18n
    }
}
