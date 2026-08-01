/**
 * iapService.ts — RevenueCat integration (natif + web)
 *
 * Android/iOS : @revenuecat/purchases-capacitor via Google Play / App Store
 * Web         : @revenuecat/purchases-js via Stripe (import dynamique)
 *
 * Entitlement RevenueCat : 'SunTrail 3D Pro'
 * Offerings : monthly | yearly | lifetime
 */

import { Capacitor } from '@capacitor/core';
import { state, saveProStatus } from './state';
import { grantProAccess, revokeProAccess } from './iap';
import { STORAGE_KEYS } from '../constants/storage';

const ENTITLEMENT_ID = 'SunTrail 3D Pro';

// Interface commune aux deux SDKs (Capacitor et purchases-js partagent la même forme)
interface ICustomerInfo {
    entitlements: { active: Record<string, unknown> };
}

class IAPService {
    private initialized = false;
    private _initPromise: Promise<void> | null = null;
    private _webPurchases: any = null; // instance @revenuecat/purchases-js (web uniquement)
    private _nativePurchasesPromise: Promise<
        typeof import('@revenuecat/purchases-capacitor')
    > | null = null;
    private _visibilityHandler: (() => void) | null = null;
    private _purchaseCleanup: (() => void) | null = null;

    /** Charge le SDK natif uniquement lorsque Capacitor en a besoin. */
    private getNativePurchases(): Promise<
        typeof import('@revenuecat/purchases-capacitor')
    > {
        this._nativePurchasesPromise ??=
            import('@revenuecat/purchases-capacitor');
        return this._nativePurchasesPromise;
    }

    /** Attend que l'init soit terminée (max 5s) */
    async waitForInit(timeoutMs = 5000): Promise<boolean> {
        if (this.initialized) return true;
        if (!this._initPromise) return false;
        try {
            await Promise.race([
                this._initPromise,
                new Promise<void>((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), timeoutMs)
                ),
            ]);
            return this.initialized;
        } catch {
            return false;
        }
    }

    // ── Initialisation ────────────────────────────────────────────────────────

    async initialize(): Promise<void> {
        this._initPromise = this._doInitialize();
        return this._initPromise;
    }

    private async _doInitialize(): Promise<void> {
        if (!Capacitor.isNativePlatform()) {
            return this._doInitializeWeb();
        }
        return this._doInitializeNative();
    }

    private async _doInitializeNative(): Promise<void> {
        const sdkKey = import.meta.env.VITE_REVENUECAT_KEY as
            string | undefined;
        if (!sdkKey || sdkKey.length < 10) {
            console.warn(
                '[IAP] VITE_REVENUECAT_KEY manquante — achats désactivés.'
            );
            if (state.isPro) {
                state.isPro = false;
                saveProStatus();
            }
            return;
        }
        if (this.initialized) return;

        try {
            const { Purchases, LOG_LEVEL } = await this.getNativePurchases();
            await Purchases.setLogLevel({
                level: state.DEBUG_MODE ? LOG_LEVEL.INFO : LOG_LEVEL.ERROR,
            });
            await Purchases.configure({ apiKey: sdkKey });
            this.initialized = true;

            await this.syncProStatus();

            // Écouter les changements en temps réel (renouvellements, annulations, remboursements)
            Purchases.addCustomerInfoUpdateListener((customerInfo) => {
                if (!state.isPro) {
                    this.updateStateFromCustomerInfo(customerInfo);
                }
            });

            if (state.DEBUG_MODE)
                console.log('[IAP] RevenueCat (Android) initialisé.');
        } catch (e) {
            console.warn('[IAP] Erreur initialisation RevenueCat:', e);
        }
    }

    /**
     * Bascule l'identité RevenueCat vers un utilisateur authentifié (Supabase)
     * et fusionne les achats anonymes existants si nécessaire.
     */
    public async identify(supabaseUserId: string): Promise<void> {
        if (state.DEBUG_MODE)
            console.log(`[IAP] Identification RevenueCat : ${supabaseUserId}`);

        if (!Capacitor.isNativePlatform()) {
            const webKey = import.meta.env.VITE_REVENUECAT_WEB_KEY as
                string | undefined;
            if (!webKey) return;
            try {
                const { Purchases: PurchasesWeb } =
                    await import('@revenuecat/purchases-js');
                PurchasesWeb.configure({
                    apiKey: webKey,
                    appUserId: supabaseUserId,
                });
                this._webPurchases = PurchasesWeb.getSharedInstance();
                await this.syncProStatus();
            } catch (e) {
                console.error('[IAP] Échec identification web :', e);
            }
        } else {
            try {
                const { Purchases } = await this.getNativePurchases();
                await Purchases.logIn({ appUserID: supabaseUserId });
                await this.syncProStatus();
            } catch (e) {
                console.error('[IAP] Échec identification native :', e);
            }
        }
    }

    private async _doInitializeWeb(): Promise<void> {
        const webKey = import.meta.env.VITE_REVENUECAT_WEB_KEY as
            string | undefined;
        if (!webKey || webKey.length < 10) {
            if (state.DEBUG_MODE)
                console.log(
                    '[IAP] VITE_REVENUECAT_WEB_KEY manquante — achats web désactivés.'
                );
            if (state.isPro) {
                state.isPro = false;
                saveProStatus();
            }
            return;
        }
        if (this.initialized) return;

        try {
            // Import dynamique : ne charge pas le SDK web sur Android (et inversement)
            const { Purchases: PurchasesWeb } =
                await import('@revenuecat/purchases-js');
            const { authService } = await import('./authService');

            // Attendre que la session Supabase soit chargée
            await authService.waitForInit();

            // On utilise l'UID Supabase si l'utilisateur est connecté, sinon l'ID anonyme habituel
            const appUserId =
                authService.user?.id || this._getOrCreateWebUserId();

            PurchasesWeb.configure({ apiKey: webKey, appUserId });
            this._webPurchases = PurchasesWeb.getSharedInstance();
            this.initialized = true;

            await this.syncProStatus();

            // Filet de sécurité : re-sync Pro quand l'onglet redevient actif (après Stripe)
            this._visibilityHandler = () => {
                if (document.visibilityState === 'visible') {
                    void this._pollProStatusWeb();
                }
            };
            document.addEventListener(
                'visibilitychange',
                this._visibilityHandler
            );

            if (state.DEBUG_MODE)
                console.log('[IAP] RevenueCat Web (Stripe) initialisé.');
        } catch (e) {
            console.warn('[IAP] Erreur initialisation RevenueCat Web:', e);
        }
    }

    /** Polling post-paiement Stripe : vérifie le statut Pro jusqu'à confirmation (max 30s) */
    private async _pollProStatusWeb(maxAttempts = 6): Promise<void> {
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const isPro = await this.syncProStatus();
            if (isPro) return;
        }
    }

    // ── Vérification statut Pro ───────────────────────────────────────────────

    async syncProStatus(): Promise<boolean> {
        if (!this.initialized) return state.isPro;
        try {
            if (Capacitor.isNativePlatform()) {
                const { Purchases } = await this.getNativePurchases();
                const { customerInfo } = await Purchases.getCustomerInfo();
                return this.updateStateFromCustomerInfo(customerInfo);
            } else {
                const customerInfo = await this._webPurchases.getCustomerInfo();
                return this.updateStateFromCustomerInfo(customerInfo);
            }
        } catch (e) {
            console.warn('[IAP] Impossible de vérifier le statut Pro:', e);
            return state.isPro;
        }
    }

    private updateStateFromCustomerInfo(customerInfo: ICustomerInfo): boolean {
        const isPro =
            customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
        if (isPro && !state.isPro) {
            grantProAccess();
        } else if (!isPro && state.isPro) {
            revokeProAccess();
        }
        return isPro;
    }

    // ── Achat ─────────────────────────────────────────────────────────────────

    async purchase(
        packageType: 'monthly' | 'yearly' | 'lifetime'
    ): Promise<boolean> {
        if (!this.initialized) {
            console.warn('[IAP] RevenueCat non initialisé.');
            return false;
        }

        // Prévention mode invité sur le Web
        if (!Capacitor.isNativePlatform()) {
            const { authService } = await import('./authService');
            if (!authService.isAuthenticated) {
                const proceed = await new Promise<boolean>((resolve) => {
                    let resolved = false;
                    const isProd = window.location.hostname !== 'localhost';
                    const base = isProd ? '/suntrail_threejs/' : '/';
                    const win = window.open(
                        `${base}guest-purchase-modal.html`,
                        '_blank',
                        'width=500,height=550'
                    );

                    const cleanup = () => {
                        clearInterval(checkClosed);
                        window.removeEventListener('message', handler);
                        window.removeEventListener('pagehide', cleanup);
                        this._purchaseCleanup = null;
                    };

                    const handler = (event: MessageEvent) => {
                        if (event.data.type === 'PURCHASE_GUEST_CONTINUE') {
                            resolved = true;
                            cleanup();
                            resolve(true);
                        }
                    };
                    window.addEventListener('message', handler);

                    const checkClosed = setInterval(() => {
                        if (win?.closed) {
                            cleanup();
                            if (!resolved) resolve(false);
                        }
                    }, 500);

                    window.addEventListener('pagehide', cleanup, {
                        once: true,
                    });
                    this._purchaseCleanup = cleanup;
                });

                if (proceed !== true) {
                    if (state.DEBUG_MODE)
                        console.log(
                            '[IAP] Achat invité annulé ou fenêtre fermée.'
                        );
                    return false;
                }
            }
        }

        try {
            const offering = await this.getCurrentOffering();
            if (!offering) return false;

            // RevenueCat utilise 'ANNUAL' (pas 'YEARLY') — on normalise
            const normalized =
                packageType === 'yearly' ? 'annual' : packageType;
            const pkg = offering.availablePackages.find(
                (p: any) =>
                    p.packageType.toLowerCase() === normalized ||
                    p.packageType.toLowerCase() === packageType ||
                    p.identifier.toLowerCase().includes(normalized) ||
                    p.identifier.toLowerCase().includes(packageType)
            );
            if (!pkg) {
                console.warn(
                    `[IAP] Package '${packageType}' introuvable dans l'offering.`
                );
                return false;
            }

            if (Capacitor.isNativePlatform()) {
                const { Purchases } = await this.getNativePurchases();
                const { customerInfo } = await Purchases.purchasePackage({
                    aPackage: pkg,
                });
                const granted = this.updateStateFromCustomerInfo(customerInfo);
                // Retry si la validation serveur est en attente (Service Account absent)
                if (!granted) {
                    await new Promise((r) => setTimeout(r, 2000));
                    const { customerInfo: ci2 } =
                        await Purchases.getCustomerInfo();
                    return this.updateStateFromCustomerInfo(ci2);
                }
                return granted;
            } else {
                // Web : ouvre le checkout Stripe (overlay in-page, pas de redirect)
                const { customerInfo } = await this._webPurchases.purchase({
                    rcPackage: pkg,
                });
                return this.updateStateFromCustomerInfo(customerInfo);
            }
        } catch (e: any) {
            if (e?.userCancelled) {
                console.log("[IAP] Achat annulé par l'utilisateur.");
            } else {
                console.error('[IAP] Erreur achat:', e);
            }
            return false;
        }
    }

    // ── Restauration ──────────────────────────────────────────────────────────

    async restorePurchases(): Promise<boolean> {
        if (!this.initialized) return false;
        try {
            if (Capacitor.isNativePlatform()) {
                const { Purchases } = await this.getNativePurchases();
                const { customerInfo } = await Purchases.restorePurchases();
                return this.updateStateFromCustomerInfo(customerInfo);
            } else {
                // purchases-js retourne CustomerInfo directement (sans wrapper)
                const customerInfo =
                    await this._webPurchases.restorePurchases();
                return this.updateStateFromCustomerInfo(customerInfo);
            }
        } catch (e) {
            console.warn('[IAP] Erreur restauration:', e);
            return false;
        }
    }

    // ── Offerings ─────────────────────────────────────────────────────────────

    async getCurrentOffering(): Promise<any> {
        if (!this.initialized) return null;
        try {
            if (Capacitor.isNativePlatform()) {
                const { Purchases } = await this.getNativePurchases();
                const offerings = await Purchases.getOfferings();
                return offerings.current ?? null;
            } else {
                const offerings = await this._webPurchases.getOfferings();
                return offerings.current ?? null;
            }
        } catch (e) {
            console.warn('[IAP] Impossible de charger les offerings:', e);
            return null;
        }
    }

    /** ID RevenueCat anonyme — utilisé pour l'identification des testeurs */
    async getAppUserID(): Promise<string> {
        if (!this.initialized) await this.waitForInit();
        if (!this.initialized) return '';
        try {
            if (Capacitor.isNativePlatform()) {
                const { Purchases } = await this.getNativePurchases();
                const result = await Purchases.getAppUserID();
                return result.appUserID ?? '';
            } else {
                // purchases-js : méthode synchrone
                return this._webPurchases.getAppUserId() ?? '';
            }
        } catch {
            return '';
        }
    }

    /** Prix formatés pour l'UpgradeSheet (cache 5min via caller) */
    async getPrices(): Promise<{
        monthly: string;
        yearly: string;
        lifetime: string;
    }> {
        const defaults = { monthly: '—', yearly: '—', lifetime: '—' };
        if (!this.initialized) await this.waitForInit();
        if (!this.initialized) return defaults;
        try {
            const offering = await this.getCurrentOffering();
            if (!offering) return defaults;
            const prices = { ...defaults };
            for (const pkg of offering.availablePackages) {
                const id = pkg.identifier.toLowerCase();
                // Capacitor SDK : pkg.product.priceString
                // Web SDK      : pkg.rcBillingProduct.currentPrice.formattedPrice
                const raw =
                    pkg.product?.priceString ??
                    pkg.rcBillingProduct?.currentPrice?.formattedPrice ??
                    '';
                const price = raw
                    .replace(
                        /\s*(for|per|pour|durch|para|in)\s*\d+\s*(minutes?|min\.?)/gi,
                        ''
                    )
                    .replace(
                        /\s*\/\s*(mois|an|month|year|mes|monat|jahr|anno)/gi,
                        ''
                    )
                    .trim();
                if (id.includes('monthly')) prices.monthly = price || '—';
                else if (id.includes('yearly') || id.includes('annual'))
                    prices.yearly = price || '—';
                else if (id.includes('lifetime'))
                    prices.lifetime = price || '—';
            }
            return prices;
        } catch {
            return defaults;
        }
    }

    // ── Country Packs (non-consumable) ───────────────────────────────────────

    private static readonly PACK_ENTITLEMENTS: Record<string, string> = {
        switzerland: 'SunTrail Pack Switzerland',
        france_alps: 'SunTrail Pack France Alps',
    };

    private static readonly PACK_PRODUCT_IDS: Record<string, string> = {
        switzerland: 'suntrail_pack_switzerland',
        france_alps: 'suntrail_pack_france_alps',
    };

    async purchasePack(packId: string): Promise<boolean> {
        if (!this.initialized) return false;
        const productId = IAPService.PACK_PRODUCT_IDS[packId];
        if (!productId) return false;

        try {
            if (Capacitor.isNativePlatform()) {
                const { Purchases } = await this.getNativePurchases();
                const offerings = await Purchases.getOfferings();
                let targetPkg = null;
                for (const offering of Object.values(offerings.all ?? {})) {
                    targetPkg = offering.availablePackages.find(
                        (p) =>
                            p.identifier.toLowerCase().includes(productId) ||
                            p.product.identifier === productId
                    );
                    if (targetPkg) break;
                }
                if (!targetPkg) {
                    console.warn(
                        `[IAP] Pack product '${productId}' introuvable.`
                    );
                    return false;
                }
                const { customerInfo } = await Purchases.purchasePackage({
                    aPackage: targetPkg,
                });
                return this.hasPackEntitlement(customerInfo, packId);
            } else {
                const offerings = await this._webPurchases.getOfferings();
                let targetPkg: any = null;
                for (const offering of Object.values(
                    (offerings.all ?? {}) as Record<string, any>
                )) {
                    targetPkg = offering.availablePackages?.find(
                        (p: any) =>
                            p.identifier?.toLowerCase().includes(productId) ||
                            p.product?.identifier === productId ||
                            p.rcBillingProduct?.identifier === productId
                    );
                    if (targetPkg) break;
                }
                if (!targetPkg) {
                    console.warn(`[IAP] Pack web '${productId}' introuvable.`);
                    return false;
                }
                const { customerInfo } = await this._webPurchases.purchase({
                    rcPackage: targetPkg,
                });
                return this.hasPackEntitlement(customerInfo, packId);
            }
        } catch (e: any) {
            if (e?.userCancelled) {
                console.log('[IAP] Achat pack annulé.');
            } else {
                console.error('[IAP] Erreur achat pack:', e);
            }
            return false;
        }
    }

    hasPackEntitlement(customerInfo: ICustomerInfo, packId: string): boolean {
        const entId = IAPService.PACK_ENTITLEMENTS[packId];
        if (!entId) return false;
        return customerInfo.entitlements.active[entId] !== undefined;
    }

    async isPackPurchased(packId: string): Promise<boolean> {
        if (!this.initialized) return false;
        try {
            if (Capacitor.isNativePlatform()) {
                const { Purchases } = await this.getNativePurchases();
                const { customerInfo } = await Purchases.getCustomerInfo();
                return this.hasPackEntitlement(customerInfo, packId);
            } else {
                const customerInfo = await this._webPurchases.getCustomerInfo();
                return this.hasPackEntitlement(customerInfo, packId);
            }
        } catch {
            return false;
        }
    }

    async getPackPrice(packId: string): Promise<string> {
        if (!this.initialized) await this.waitForInit();
        if (!this.initialized) return '—';
        const productId = IAPService.PACK_PRODUCT_IDS[packId];
        if (!productId) return '—';
        try {
            const offeringsData = Capacitor.isNativePlatform()
                ? await (
                      await this.getNativePurchases()
                  ).Purchases.getOfferings()
                : await this._webPurchases.getOfferings();
            for (const offering of Object.values(
                (offeringsData.all ?? {}) as Record<string, any>
            )) {
                const pkg = offering.availablePackages?.find(
                    (p: any) =>
                        p.identifier?.toLowerCase().includes(productId) ||
                        p.product?.identifier === productId ||
                        p.rcBillingProduct?.identifier === productId
                );
                if (pkg) {
                    return (
                        pkg.product?.priceString ??
                        pkg.rcBillingProduct?.currentPrice?.formattedPrice ??
                        '—'
                    );
                }
            }
            return '—';
        } catch {
            return '—';
        }
    }

    async checkAllPackPurchases(): Promise<string[]> {
        if (!this.initialized) return [];
        try {
            let customerInfo: ICustomerInfo;
            if (Capacitor.isNativePlatform()) {
                const { Purchases } = await this.getNativePurchases();
                const result = await Purchases.getCustomerInfo();
                customerInfo = result.customerInfo;
            } else {
                customerInfo = await this._webPurchases.getCustomerInfo();
            }
            const purchased: string[] = [];
            for (const packId of Object.keys(IAPService.PACK_ENTITLEMENTS)) {
                if (this.hasPackEntitlement(customerInfo, packId)) {
                    purchased.push(packId);
                }
            }
            return purchased;
        } catch {
            return [];
        }
    }

    /** ID anonyme stable pour le SDK web (persisted in localStorage) */
    private _getOrCreateWebUserId(): string {
        let id = localStorage.getItem(STORAGE_KEYS.RC_WEB_USER_ID);
        if (!id) {
            id =
                'web_' +
                Math.random().toString(36).slice(2, 9) +
                '_' +
                Date.now().toString(36);
            localStorage.setItem(STORAGE_KEYS.RC_WEB_USER_ID, id);
        }
        return id;
    }

    /** @internal Reset state for testing purposes */
    public resetForTest(): void {
        this.initialized = false;
        this._initPromise = null;
        this._webPurchases = null;
        if (this._visibilityHandler) {
            document.removeEventListener(
                'visibilitychange',
                this._visibilityHandler
            );
            this._visibilityHandler = null;
        }
        if (this._purchaseCleanup) {
            this._purchaseCleanup();
            this._purchaseCleanup = null;
        }
    }
}

export const iapService = new IAPService();
