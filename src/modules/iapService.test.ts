import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub environment before any imports
vi.stubEnv('VITE_REVENUECAT_KEY', 'mock-sdk-key-1234567890');

const { mockPurchases } = vi.hoisted(() => ({
    mockPurchases: {
        setLogLevel: vi.fn().mockResolvedValue({}),
        configure: vi.fn().mockResolvedValue({}),
        getCustomerInfo: vi.fn().mockResolvedValue({ 
            customerInfo: { entitlements: { active: { 'SunTrail 3D Pro': {} } } } 
        }),
        addCustomerInfoUpdateListener: vi.fn(),
        getOfferings: vi.fn().mockResolvedValue({ 
            current: { 
                availablePackages: [
                    { identifier: 'monthly', packageType: 'MONTHLY', product: { price: 4.99, currency: 'EUR', priceString: '4.99 €' } }
                ] 
            } 
        }),
        purchasePackage: vi.fn().mockResolvedValue({ customerInfo: { entitlements: { active: { 'SunTrail 3D Pro': {} } } } }),
        restorePurchases: vi.fn().mockResolvedValue({ customerInfo: { entitlements: { active: { 'SunTrail 3D Pro': {} } } } }),
    }
}));

// Mock Capacitor and Purchases before importing the service
vi.mock('@capacitor/core', () => ({
    Capacitor: {
        isNativePlatform: vi.fn(() => true),
        getPlatform: vi.fn(() => 'android')
    }
}));

vi.mock('@revenuecat/purchases-capacitor', () => ({
    Purchases: mockPurchases,
    LOG_LEVEL: { INFO: 1 }
}));

// Mock iap module to avoid side effects on actual state/localStorage
vi.mock('./iap', () => ({
    grantProAccess: vi.fn(),
    revokeProAccess: vi.fn()
}));

import { state } from './state';
import { iapService } from './iapService';
import { grantProAccess } from './iap';

describe('IAPService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.isPro = false;
        // Mock SDK Key for test (needed for _doInitialize)
        // Note: SDK_KEY is evaluated at module load time, so we might need 
        // to reset it if it was empty.
    });

    it('should initialize and sync pro status', async () => {
        await iapService.initialize();
        
        // On vérifie les appels au SDK
        expect(mockPurchases.configure).toHaveBeenCalled();
        expect(mockPurchases.getCustomerInfo).toHaveBeenCalled();
        expect(grantProAccess).toHaveBeenCalled();
    });

    it('should handle purchase success', async () => {
        // Initialiser d'abord pour avoir initialized=true
        await iapService.initialize();

        const success = await iapService.purchase('monthly');
        
        expect(mockPurchases.purchasePackage).toHaveBeenCalled();
        expect(success).toBe(true);
        expect(grantProAccess).toHaveBeenCalled();
    });

    it('should handle restore purchases', async () => {
        await iapService.initialize();
        
        const success = await iapService.restorePurchases();
        expect(mockPurchases.restorePurchases).toHaveBeenCalled();
        expect(success).toBe(true);
        expect(grantProAccess).toHaveBeenCalled();
    });
});
