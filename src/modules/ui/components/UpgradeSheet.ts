import { BaseComponent } from '../core/BaseComponent';
import { sheetManager } from '../core/SheetManager';
import { showToast } from '../../utils';
import { haptic } from '../../haptics';
import { iapService } from '../../iapService';
import { i18n } from '../../../i18n/I18nService';
import { Capacitor } from '@capacitor/core';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.suntrail.threejs';

export class UpgradeSheet extends BaseComponent {
    /** Cache prix : retry si échoué, sinon valide 5 min */
    private _pricesLoaded = false;
    private _pricesCacheTime = 0;
    private static readonly PRICES_TTL = 300_000; // 5 min

    constructor() {
        super('template-upgrade', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        const closeBtn = this.element.querySelector('#close-upgrade');
        closeBtn?.addEventListener('click', () => sheetManager.close());

        // Sur web : remplacer les boutons d'achat par un lien Play Store
        if (!Capacitor.isNativePlatform()) {
            this.renderWebFallback();
            return;
        }

        // Charger les prix depuis RevenueCat — cache 5min, retry si 1er appel échoué
        const now = Date.now();
        if (!this._pricesLoaded || (now - this._pricesCacheTime > UpgradeSheet.PRICES_TTL)) {
            this._pricesLoaded = true;
            this._pricesCacheTime = now;
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
                showToast(i18n.t('upgrade.toast.purchaseFailed'));
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
            showToast(i18n.t('upgrade.toast.restoring'));
            const restored = await iapService.restorePurchases();
            if (restored) {
                void haptic('success');
                showToast(i18n.t('upgrade.toast.restored'));
                sheetManager.close();
            } else {
                showToast(i18n.t('upgrade.toast.noRestore'));
            }
        });
    }

    /** Sur web : masquer les boutons d'achat natifs, afficher un lien Play Store */
    private renderWebFallback(): void {
        if (!this.element) return;

        // Masquer les plans natifs et le bouton restaurer
        const plansContainer = this.element.querySelector('.upgrade-plans');
        const restoreBtn = this.element.querySelector('#upgrade-restore-btn');
        const legalText = this.element.querySelector('.upgrade-legal');
        if (plansContainer) plansContainer.remove();
        if (restoreBtn) restoreBtn.remove();
        if (legalText) legalText.remove();

        // Ajouter le CTA Play Store
        const webCta = document.createElement('a');
        webCta.href = PLAY_STORE_URL;
        webCta.target = '_blank';
        webCta.rel = 'noopener noreferrer';
        webCta.className = 'btn-go';
        webCta.style.cssText = 'display:block;text-align:center;margin-top:var(--space-4);font-size:var(--text-base);padding:14px 24px;';
        webCta.textContent = i18n.t('upgrade.web.playStore');

        const webNote = document.createElement('p');
        webNote.style.cssText = 'text-align:center;color:var(--text-2);font-size:var(--text-xs);margin-top:var(--space-3);';
        webNote.textContent = i18n.t('upgrade.web.note');

        // Insérer après les features (container = .upgrade-content)
        this.element.querySelector('.upgrade-content')?.append(webCta, webNote);
    }

    private async loadPrices(): Promise<void> {
        const prices = await iapService.getPrices();
        // Mettre à jour les prix affichés si les éléments existent
        const yearlyPriceEl = this.element?.querySelector('#upgrade-yearly-price');
        const monthlyPriceEl = this.element?.querySelector('#upgrade-monthly-price');
        const lifetimePriceEl = this.element?.querySelector('#upgrade-lifetime-price');
        const yearlySub = this.element?.querySelector('#upgrade-yearly-sub');
        if (yearlyPriceEl) yearlyPriceEl.textContent = prices.yearly;
        if (monthlyPriceEl) monthlyPriceEl.textContent = prices.monthly;
        if (lifetimePriceEl) lifetimePriceEl.textContent = prices.lifetime;

        // Mettre à jour le sous-titre annuel avec le prix mensuel équivalent
        if (yearlySub && prices.yearly !== '—') {
            const perYear = i18n.t('upgrade.plan.perYear');
            yearlySub.textContent = `${perYear} · ${prices.monthly}/${i18n.t('upgrade.plan.monthShort')}`;
        }
    }
}
