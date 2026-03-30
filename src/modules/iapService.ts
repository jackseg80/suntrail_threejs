/**
 * iapService.ts — RevenueCat integration
 *
 * Gère le cycle de vie complet des achats In-App :
 *   - Initialisation au démarrage
 *   - Vérification du statut Pro existant
 *   - Déclenchement d'un achat
 *   - Restauration des achats
 *   - Synchronisation avec state.isPro
 *
 * Entitlement RevenueCat : 'SunTrail 3D Pro'
 * Offerings : monthly | yearly | lifetime
 */

import { Purchases, LOG_LEVEL, type CustomerInfo, type PurchasesOffering } from '@revenuecat/purchases-capacitor';
import { Capacitor } from '@capacitor/core';
import { state } from './state';
import { grantProAccess, revokeProAccess } from './iap';

const ENTITLEMENT_ID = 'SunTrail 3D Pro';
const SDK_KEY = import.meta.env.VITE_REVENUECAT_KEY as string | undefined;

class IAPService {
    private initialized = false;

    // ── Initialisation ────────────────────────────────────────────────────────

    async initialize(): Promise<void> {
        // RevenueCat ne fonctionne que sur Android/iOS natif
        if (!Capacitor.isNativePlatform()) {
            console.log('[IAP] Web platform — RevenueCat skipped.');
            return;
        }
        if (!SDK_KEY || SDK_KEY.length < 10) {
            console.warn('[IAP] VITE_REVENUECAT_KEY manquante — achats désactivés.');
            return;
        }
        if (this.initialized) return;

        try {
            await Purchases.setLogLevel({ level: LOG_LEVEL.INFO });
            await Purchases.configure({ apiKey: SDK_KEY });
            this.initialized = true;

            // Vérifier le statut Pro au démarrage (override le cache localStorage)
            await this.syncProStatus();

            // Écouter les changements d'abonnement en temps réel
            // (renouvellements, annulations, remboursements)
            // Guard isPro : évite un 2e toast si purchase() a déjà accordé l'accès
            Purchases.addCustomerInfoUpdateListener((customerInfo) => {
                if (!state.isPro) {
                    this.updateStateFromCustomerInfo(customerInfo);
                }
            });

            console.log('[IAP] RevenueCat initialisé.');
        } catch (e) {
            console.warn('[IAP] Erreur initialisation RevenueCat:', e);
        }
    }

    // ── Vérification statut Pro ───────────────────────────────────────────────

    async syncProStatus(): Promise<boolean> {
        if (!this.initialized) return state.isPro;
        try {
            const { customerInfo } = await Purchases.getCustomerInfo();
            return this.updateStateFromCustomerInfo(customerInfo);
        } catch (e) {
            console.warn('[IAP] Impossible de vérifier le statut Pro:', e);
            return state.isPro; // Garder le cache localStorage
        }
    }

    private updateStateFromCustomerInfo(customerInfo: CustomerInfo): boolean {
        const isPro = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
        if (isPro) {
            grantProAccess();
        } else if (state.isPro) {
            // Révoquer uniquement si on était Pro (évite les faux négatifs au boot)
            revokeProAccess();
        }
        return isPro;
    }

    // ── Achat ─────────────────────────────────────────────────────────────────

    /**
     * Déclenche le flow d'achat Play Store.
     * @param packageType 'monthly' | 'yearly' | 'lifetime'
     */
    async purchase(packageType: 'monthly' | 'yearly' | 'lifetime'): Promise<boolean> {
        if (!this.initialized) {
            console.warn('[IAP] RevenueCat non initialisé.');
            return false;
        }
        try {
            const offering = await this.getCurrentOffering();
            if (!offering) return false;

            // RevenueCat utilise 'ANNUAL' (pas 'YEARLY') comme packageType pour les abonnements annuels.
            // L'identifier 'suntrail_pro_annual' ne contient pas 'yearly'.
            // On normalise 'yearly' → 'annual' pour correspondre à la convention RevenueCat.
            const normalized = packageType === 'yearly' ? 'annual' : packageType;
            const pkg = offering.availablePackages.find(
                p => p.packageType.toLowerCase() === normalized ||
                     p.packageType.toLowerCase() === packageType ||
                     p.identifier.toLowerCase().includes(normalized) ||
                     p.identifier.toLowerCase().includes(packageType)
            );
            if (!pkg) {
                console.warn(`[IAP] Package '${packageType}' (normalized: '${normalized}') introuvable dans l'offering.`, offering.availablePackages.map(p => ({ id: p.identifier, type: p.packageType })));
                return false;
            }

            const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
            const granted = this.updateStateFromCustomerInfo(customerInfo);
            // Si Play Store valide mais RevenueCat n'a pas encore accordé l'entitlement
            // (validation serveur en attente — typique sans Service Account), re-vérifier après 2s
            if (!granted) {
                await new Promise(r => setTimeout(r, 2000));
                const { customerInfo: ci2 } = await Purchases.getCustomerInfo();
                return this.updateStateFromCustomerInfo(ci2);
            }
            return granted;

        } catch (e: any) {
            if (e?.userCancelled) {
                console.log('[IAP] Achat annulé par l\'utilisateur.');
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
            const { customerInfo } = await Purchases.restorePurchases();
            return this.updateStateFromCustomerInfo(customerInfo);
        } catch (e) {
            console.warn('[IAP] Erreur restauration:', e);
            return false;
        }
    }

    // ── Offerings ─────────────────────────────────────────────────────────────

    async getCurrentOffering(): Promise<PurchasesOffering | null> {
        if (!this.initialized) return null;
        try {
            const offerings = await Purchases.getOfferings();
            return offerings.current ?? null;
        } catch (e) {
            console.warn('[IAP] Impossible de charger les offerings:', e);
            return null;
        }
    }

    /** Retourne l'anonymous ID RevenueCat — utilisé pour l'identification des testeurs */
    async getAppUserID(): Promise<string> {
        if (!this.initialized || !Capacitor.isNativePlatform()) return '';
        try {
            const result = await Purchases.getAppUserID();
            return result.appUserID ?? '';
        } catch {
            return '';
        }
    }

    /** Retourne les prix formatés pour affichage dans l'UpgradeSheet */
    async getPrices(): Promise<{ monthly: string; yearly: string; lifetime: string }> {
        const defaults = { monthly: '€3.99/mois', yearly: '€29.99/an', lifetime: '€99.99' };
        if (!this.initialized) return defaults;
        try {
            const offering = await this.getCurrentOffering();
            if (!offering) return defaults;
            const prices = { ...defaults };
            for (const pkg of offering.availablePackages) {
                const id = pkg.identifier.toLowerCase();
                const raw = pkg.product.priceString ?? '';
                // Google Play test subscriptions appendent la période raccourcie (ex: "for 5 minutes")
                const price = raw.replace(/\s*(for|per|pour|durch|para|in)\s*\d+\s*(minutes?|min\.?)/gi, '').trim();
                if (id.includes('monthly')) prices.monthly = price;
                else if (id.includes('yearly') || id.includes('annual')) prices.yearly = price;
                else if (id.includes('lifetime')) prices.lifetime = price;
            }
            return prices;
        } catch {
            return defaults;
        }
    }
}

export const iapService = new IAPService();
