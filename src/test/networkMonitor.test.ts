/**
 * networkMonitor.test.ts — Tests unitaires pour la détection réseau (v5.20)
 *
 * Vérifie la logique du module networkMonitor :
 * - Détection offline/online via échecs tuiles (reportNetworkFailure/Success)
 * - Override manuel (setManualOffline) vs auto-restore
 * - Probe de connectivité
 * - Événements eventBus (networkOnline/networkOffline)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock @capacitor/network
vi.mock('@capacitor/network', () => ({
    Network: {
        getStatus: vi.fn().mockResolvedValue({ connected: true, connectionType: 'wifi' }),
        addListener: vi.fn(),
    },
}));

// Mock @capacitor/core — simulate web (not native)
vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => false },
}));

// Mock showToast (avoid DOM manipulation)
vi.mock('../modules/toast', () => ({
    showToast: vi.fn(),
}));

// Mock i18n
vi.mock('../i18n/I18nService', () => ({
    i18n: { t: (key: string) => key },
}));

// Mock fetch for probe
const mockFetch = vi.fn().mockResolvedValue(new Response());
vi.stubGlobal('fetch', mockFetch);

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { state } from '../modules/state';
import { eventBus } from '../modules/eventBus';
import { showToast } from '../modules/toast';

// We need to test the module functions directly — reimport fresh for each test
// Since initNetworkMonitor has a guard (_initialized), we test the exported helpers
import {
    reportNetworkFailure,
    reportNetworkSuccess,
    setManualOffline,
    initNetworkMonitor,
} from '../modules/networkMonitor';

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetState() {
    state.isNetworkAvailable = true;
    state.connectionType = 'unknown';
    state.IS_OFFLINE = false;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('reportNetworkFailure / reportNetworkSuccess', () => {
    beforeEach(() => {
        resetState();
        // Reset consecutive failures by calling reportNetworkSuccess
        reportNetworkSuccess();
    });

    it('1-2 échecs consécutifs ne déclenchent pas offline', () => {
        reportNetworkFailure();
        reportNetworkFailure();
        expect(state.isNetworkAvailable).toBe(true);
        expect(state.IS_OFFLINE).toBe(false);
    });

    it('3 échecs consécutifs déclenchent offline', () => {
        reportNetworkFailure();
        reportNetworkFailure();
        reportNetworkFailure();
        expect(state.isNetworkAvailable).toBe(false);
        expect(state.IS_OFFLINE).toBe(true);
    });

    it('un succès après des échecs reset le compteur', () => {
        reportNetworkFailure();
        reportNetworkFailure();
        reportNetworkSuccess(); // reset
        reportNetworkFailure();
        reportNetworkFailure();
        // Seulement 2 échecs consécutifs depuis le reset
        expect(state.isNetworkAvailable).toBe(true);
    });

    it('reportNetworkSuccess restaure online après offline', () => {
        // Passer en offline via 3 échecs
        reportNetworkFailure();
        reportNetworkFailure();
        reportNetworkFailure();
        expect(state.isNetworkAvailable).toBe(false);

        // Un succès restaure
        reportNetworkSuccess();
        expect(state.isNetworkAvailable).toBe(true);
        expect(state.IS_OFFLINE).toBe(false);
    });

    it('toast affiché quand on passe offline via échecs tuiles', () => {
        vi.mocked(showToast).mockClear();
        reportNetworkFailure();
        reportNetworkFailure();
        reportNetworkFailure();
        expect(showToast).toHaveBeenCalledWith('network.toast.offline');
    });

    it('toast affiché quand on revient online', () => {
        reportNetworkFailure();
        reportNetworkFailure();
        reportNetworkFailure();
        vi.mocked(showToast).mockClear();
        reportNetworkSuccess();
        expect(showToast).toHaveBeenCalledWith('network.toast.online');
    });
});

describe('setManualOffline', () => {
    beforeEach(() => {
        resetState();
        reportNetworkSuccess(); // reset counter
        setManualOffline(false); // reset override
    });

    it('active le mode offline manuellement', () => {
        setManualOffline(true);
        expect(state.IS_OFFLINE).toBe(true);
    });

    it('désactive le mode offline manuellement', () => {
        setManualOffline(true);
        setManualOffline(false);
        expect(state.IS_OFFLINE).toBe(false);
    });

    it('override manuel empêche auto-restore quand réseau revient', () => {
        // L'utilisateur force offline manuellement
        setManualOffline(true);

        // Simuler perte réseau puis retour
        reportNetworkFailure();
        reportNetworkFailure();
        reportNetworkFailure(); // -> offline détecté
        reportNetworkSuccess(); // -> réseau revient

        // IS_OFFLINE doit rester true car override manuel actif
        expect(state.isNetworkAvailable).toBe(true); // réseau physique OK
        expect(state.IS_OFFLINE).toBe(true); // mais mode offline forcé par l'utilisateur
    });

    it('sans override, auto-restore fonctionne normalement', () => {
        setManualOffline(false);

        reportNetworkFailure();
        reportNetworkFailure();
        reportNetworkFailure();
        expect(state.IS_OFFLINE).toBe(true);

        reportNetworkSuccess();
        expect(state.IS_OFFLINE).toBe(false); // auto-restauré
    });
});

describe('eventBus events', () => {
    beforeEach(() => {
        resetState();
        reportNetworkSuccess();
        setManualOffline(false);
    });

    it('émet networkOffline quand on passe offline', () => {
        const handler = vi.fn();
        eventBus.on('networkOffline', handler);

        reportNetworkFailure();
        reportNetworkFailure();
        reportNetworkFailure();

        expect(handler).toHaveBeenCalledTimes(1);
        eventBus.off('networkOffline', handler);
    });

    it('émet networkOnline quand on revient online', () => {
        const handler = vi.fn();
        eventBus.on('networkOnline', handler);

        // D'abord passer offline
        reportNetworkFailure();
        reportNetworkFailure();
        reportNetworkFailure();

        // Puis revenir online
        reportNetworkSuccess();

        expect(handler).toHaveBeenCalledTimes(1);
        eventBus.off('networkOnline', handler);
    });

    it('pas de double émission si déjà offline', () => {
        const handler = vi.fn();
        eventBus.on('networkOffline', handler);

        reportNetworkFailure();
        reportNetworkFailure();
        reportNetworkFailure(); // -> offline
        reportNetworkFailure(); // déjà offline
        reportNetworkFailure(); // déjà offline

        expect(handler).toHaveBeenCalledTimes(1);
        eventBus.off('networkOffline', handler);
    });
});

describe('initNetworkMonitor (web fallback)', () => {
    it('initialise avec navigator.onLine + probe', async () => {
        // navigator.onLine = true by default in happy-dom
        mockFetch.mockResolvedValueOnce(new Response()); // probe succeeds
        await initNetworkMonitor();
        // Should be online after successful probe
        expect(state.isNetworkAvailable).toBe(true);
    });
});
