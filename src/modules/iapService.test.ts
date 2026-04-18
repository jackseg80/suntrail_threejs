import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockPurchases, mockCapacitor } = vi.hoisted(() => ({
    mockPurchases: {
        setLogLevel: vi.fn(),
        configure: vi.fn(),
        getCustomerInfo: vi.fn(),
        addCustomerInfoUpdateListener: vi.fn(),
        getOfferings: vi.fn(),
        purchasePackage: vi.fn(),
        restorePurchases: vi.fn(),
        getAppUserID: vi.fn(),
    },
    mockCapacitor: {
        isNativePlatform: vi.fn(() => true),
        getPlatform: vi.fn(() => 'android')
    }
}));

vi.mock('@revenuecat/purchases-capacitor', () => ({
    Purchases: mockPurchases,
    LOG_LEVEL: { INFO: 1, ERROR: 2 }
}));

vi.mock('@capacitor/core', () => ({
    Capacitor: mockCapacitor
}));

vi.mock('./iap', () => ({
    grantProAccess: vi.fn(() => { state.isPro = true; }),
    revokeProAccess: vi.fn(() => { state.isPro = false; })
}));

import { state } from './state';
import { iapService } from './iapService';
import { grantProAccess, revokeProAccess } from './iap';

describe('IAPService - Blindage (v5.29.36)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Pas de fake timers globaux pour éviter les conflits avec les async/await RC
        state.isPro = false;
        state.DEBUG_MODE = false;
        iapService.resetForTest();
        vi.stubEnv('VITE_REVENUECAT_KEY', 'mock-sdk-key-1234567890');
        mockCapacitor.isNativePlatform.mockReturnValue(true);
        
        // Mock par défaut pour éviter les timeouts dans initialize()
        mockPurchases.configure.mockResolvedValue({});
        mockPurchases.setLogLevel.mockResolvedValue({});
        mockPurchases.getCustomerInfo.mockResolvedValue({ 
            customerInfo: { entitlements: { active: {} } } 
        });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    // --- Initialisation ---

    it('doit ignorer l\'init sur le Web', async () => {
        mockCapacitor.isNativePlatform.mockReturnValue(false);
        await iapService.initialize();
        expect(mockPurchases.configure).not.toHaveBeenCalled();
    });

    it('doit ignorer l\'init si la clé SDK est manquante', async () => {
        vi.stubEnv('VITE_REVENUECAT_KEY', '');
        await iapService.initialize();
        expect(mockPurchases.configure).not.toHaveBeenCalled();
    });

    it('doit s\'initialiser correctement en natif', async () => {
        await iapService.initialize();
        expect(mockPurchases.setLogLevel).toHaveBeenCalledWith({ level: 2 });
        expect(mockPurchases.configure).toHaveBeenCalledWith({ apiKey: 'mock-sdk-key-1234567890' });
        expect(mockPurchases.addCustomerInfoUpdateListener).toHaveBeenCalled();
    });

    it('doit gérer les erreurs d\'initialisation sans crash', async () => {
        mockPurchases.configure.mockRejectedValue(new Error('RC Init Failed'));
        await iapService.initialize();
        expect(mockPurchases.configure).toHaveBeenCalled();
    });

    // --- waitForInit ---

    it('waitForInit doit retourner true si déjà initialisé', async () => {
        await iapService.initialize();
        const ready = await iapService.waitForInit();
        expect(ready).toBe(true);
    });

    it('waitForInit doit attendre la fin de l\'init en cours', async () => {
        let resolveInit: any;
        const initPromise = new Promise<void>((r) => { resolveInit = r; });
        mockPurchases.configure.mockReturnValue(initPromise);
        
        const iapPromise = iapService.initialize();
        const waitPromise = iapService.waitForInit();
        
        resolveInit();
        await iapPromise;
        const ready = await waitPromise;
        expect(ready).toBe(true);
    });

    it('waitForInit doit timeout si l\'init est trop longue', async () => {
        mockPurchases.configure.mockReturnValue(new Promise(() => {})); // Bloqué
        iapService.initialize();
        
        const ready = await iapService.waitForInit(50);
        expect(ready).toBe(false);
    });

    // --- Synchronisation ---

    it('syncProStatus doit accorder l\'accès si entitlement actif', async () => {
        mockPurchases.getCustomerInfo.mockResolvedValue({ 
            customerInfo: { entitlements: { active: { 'SunTrail 3D Pro': {} } } } 
        });
        await iapService.initialize();
        
        const isPro = await iapService.syncProStatus();
        expect(isPro).toBe(true);
        expect(grantProAccess).toHaveBeenCalled();
    });

    it('syncProStatus doit révoquer l\'accès si entitlement expiré', async () => {
        state.isPro = true;
        mockPurchases.getCustomerInfo.mockResolvedValue({ 
            customerInfo: { entitlements: { active: {} } } 
        });
        await iapService.initialize();
        
        const isPro = await iapService.syncProStatus();
        expect(isPro).toBe(false);
        expect(revokeProAccess).toHaveBeenCalled();
    });

    it('syncProStatus doit garder l\'état actuel en cas d\'erreur réseau', async () => {
        // On initialise d'abord avec succès
        await iapService.initialize();
        
        // On force l'état Pro APRES l'init (car l'init appelle syncProStatus)
        state.isPro = true;
        
        // Puis on simule une erreur de sync plus tard
        mockPurchases.getCustomerInfo.mockRejectedValue(new Error('Network Error'));
        const isPro = await iapService.syncProStatus();
        
        expect(isPro).toBe(true); // Garde le cache
    });

    // --- Listener Updates ---

    it('doit réagir aux changements via le listener RC', async () => {
        let listenerCallback: any;
        mockPurchases.addCustomerInfoUpdateListener.mockImplementation((cb) => {
            listenerCallback = cb;
        });
        await iapService.initialize();

        listenerCallback({ entitlements: { active: { 'SunTrail 3D Pro': {} } } });
        expect(grantProAccess).toHaveBeenCalled();
    });

    // --- Achats (Complex Matching) ---

    it('doit trouver le package "yearly" via normalisation "annual"', async () => {
        await iapService.initialize();
        mockPurchases.getOfferings.mockResolvedValue({
            current: {
                availablePackages: [
                    { identifier: 'rc_annual', packageType: 'ANNUAL', product: { identifier: 'prod_annual' } }
                ]
            }
        });
        mockPurchases.purchasePackage.mockResolvedValue({ 
            customerInfo: { entitlements: { active: { 'SunTrail 3D Pro': {} } } } 
        });

        const success = await iapService.purchase('yearly');
        expect(success).toBe(true);
        expect(mockPurchases.purchasePackage).toHaveBeenCalledWith({ 
            aPackage: expect.objectContaining({ packageType: 'ANNUAL' }) 
        });
    });

    it('doit gérer le délai de validation serveur (retry après 2s)', async () => {
        await iapService.initialize();
        mockPurchases.getOfferings.mockResolvedValue({
            current: { availablePackages: [{ identifier: 'monthly', packageType: 'MONTHLY' }] }
        });
        
        // 1er retour de purchasePackage : pas encore actif
        mockPurchases.purchasePackage.mockResolvedValue({ 
            customerInfo: { entitlements: { active: {} } } 
        });

        // 2e retour de getCustomerInfo (retry) : actif
        mockPurchases.getCustomerInfo.mockResolvedValue({ 
            customerInfo: { entitlements: { active: { 'SunTrail 3D Pro': {} } } } 
        });

        const success = await iapService.purchase('monthly');
        expect(success).toBe(true);
        expect(mockPurchases.getCustomerInfo).toHaveBeenCalledTimes(2); // Init + Retry
    });

    it('doit gérer l\'annulation par l\'utilisateur', async () => {
        await iapService.initialize();
        mockPurchases.getOfferings.mockResolvedValue({
            current: { availablePackages: [{ identifier: 'monthly', packageType: 'MONTHLY' }] }
        });
        mockPurchases.purchasePackage.mockRejectedValue({ userCancelled: true });

        const success = await iapService.purchase('monthly');
        expect(success).toBe(false);
    });

    // --- Prix & Formattage ---

    it('getPrices doit formater les prix correctement', async () => {
        await iapService.initialize();
        mockPurchases.getOfferings.mockResolvedValue({
            current: {
                availablePackages: [
                    { identifier: 'monthly', product: { priceString: '4,99 € / mois' } },
                    { identifier: 'annual', product: { priceString: '29,99 € for 5 minutes' } },
                    { identifier: 'lifetime', product: { priceString: '99,99 €' } }
                ]
            }
        });

        const prices = await iapService.getPrices();
        expect(prices.monthly).toBe('4,99 €');
        expect(prices.yearly).toBe('29,99 €');
        expect(prices.lifetime).toBe('99,99 €');
    });

    // --- Packs Pays ---

    it('purchasePack doit chercher dans toutes les offerings', async () => {
        await iapService.initialize();
        mockPurchases.getOfferings.mockResolvedValue({
            all: {
                'packs': { 
                    availablePackages: [
                        { identifier: 'suntrail_pack_switzerland', product: { identifier: 'suntrail_pack_switzerland' } }
                    ] 
                }
            }
        });
        mockPurchases.purchasePackage.mockResolvedValue({ 
            customerInfo: { entitlements: { active: { 'SunTrail Pack Switzerland': {} } } } 
        });

        const success = await iapService.purchasePack('switzerland');
        expect(success).toBe(true);
    });

    it('checkAllPackPurchases doit retourner la liste des IDs possédés', async () => {
        await iapService.initialize();
        mockPurchases.getCustomerInfo.mockResolvedValue({ 
            customerInfo: { entitlements: { active: { 'SunTrail Pack Switzerland': {} } } } 
        });

        const purchased = await iapService.checkAllPackPurchases();
        expect(purchased).toEqual(['switzerland']);
    });

    // --- Cas d'erreurs et Edge Cases ---

    it('restorePurchases doit gérer les échecs', async () => {
        await iapService.initialize();
        mockPurchases.restorePurchases.mockRejectedValue(new Error('Restore failed'));
        const success = await iapService.restorePurchases();
        expect(success).toBe(false);
    });

    it('getPrices doit retourner des tirets si offering introuvable', async () => {
        await iapService.initialize();
        mockPurchases.getOfferings.mockResolvedValue({ current: null });
        const prices = await iapService.getPrices();
        expect(prices).toEqual({ monthly: '—', yearly: '—', lifetime: '—' });
    });

    it('getAppUserID doit gérer les erreurs', async () => {
        await iapService.initialize();
        mockPurchases.getAppUserID.mockRejectedValue(new Error('ID Error'));
        const id = await iapService.getAppUserID();
        expect(id).toBe('');
    });

    it('purchasePack doit échouer si pack inconnu ou non initialisé', async () => {
        const successUnknown = await iapService.purchasePack('invalid_pack');
        expect(successUnknown).toBe(false);
        
        await iapService.initialize();
        const successUninit = await iapService.purchasePack('switzerland'); // Sans offerings mockés
        expect(successUninit).toBe(false);
    });

    it('isPackPurchased doit gérer les erreurs', async () => {
        await iapService.initialize();
        mockPurchases.getCustomerInfo.mockRejectedValue(new Error('Sync error'));
        const purchased = await iapService.isPackPurchased('switzerland');
        expect(purchased).toBe(false);
    });

    it('updateStateFromCustomerInfo doit révoquer si on passe de Pro à non-Pro', async () => {
        state.isPro = true;
        await iapService.initialize();
        
        // Simuler un retour customerInfo sans entitlement actif
        const customerInfo = { entitlements: { active: {} } };
        // On accède à la méthode privée via bypass TS
        (iapService as any).updateStateFromCustomerInfo(customerInfo);
        
        expect(revokeProAccess).toHaveBeenCalled();
        expect(state.isPro).toBe(false);
    });
});
