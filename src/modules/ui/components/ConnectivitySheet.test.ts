import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockState } = vi.hoisted(() => {
    const state: Record<string, any> = {
        IS_OFFLINE: false,
        userLocation: null,
        userLocationAccuracy: null,
        subscribe: vi.fn(() => vi.fn()),
    };
    return { mockState: state };
});

vi.mock('../../state', () => ({
    state: mockState,
    isProActive: vi.fn(() => false),
}));

vi.mock('../../tileLoader', () => ({
    deleteTerrainCache: vi.fn().mockResolvedValue(undefined),
    setPMTilesSource: vi.fn(),
    getOfflineZoneCount: vi.fn(() => 0),
}));

vi.mock('../../toast', () => ({
    showToast: vi.fn(),
}));

vi.mock('../core/SheetManager', () => ({
    sheetManager: { close: vi.fn() },
}));

vi.mock('../../terrain', () => ({
    resetTerrain: vi.fn(),
    updateVisibleTiles: vi.fn(),
}));

vi.mock('../../../i18n/I18nService', () => ({
    i18n: { t: (k: string) => k, applyToDOM: vi.fn() },
}));

vi.mock('../../networkMonitor', () => ({
    setManualOffline: vi.fn(),
}));

vi.mock('../../packManager', () => ({
    packManager: { getStates: vi.fn(() => new Map()) },
}));

vi.mock('../../eventBus', () => ({
    eventBus: { on: vi.fn(), off: vi.fn() },
}));

vi.mock('../../ZoneOverlay', () => ({
    ZoneOverlay: class {},
}));

vi.mock('./ZoneSelectToolbar', () => ({
    ZoneSelectToolbar: class {},
}));

vi.mock('../../iap', () => ({
    showUpgradePrompt: vi.fn(),
}));

vi.mock('../../cachedZones', () => ({
    getCachedZones: vi.fn(() => []),
    removeCachedZone: vi.fn(),
}));

vi.mock('../../cameraManager', () => ({
    flyTo: vi.fn(),
}));

vi.mock('../../geo', () => ({
    lngLatToWorld: vi.fn(() => ({ x: 0, z: 0 })),
}));

vi.mock('../../analysis', () => ({
    getAltitudeAt: vi.fn(() => 1000),
}));

vi.mock('../templates/connectivity.html?raw', () => ({
    default: `
        <div>
            <button id="close-connectivity">Fermer</button>
            <input type="checkbox" id="offline-toggle" />
            <div class="network-status"></div>
            <div id="gps-accuracy"></div>
            <button id="conn-clear-cache">Vider le cache</button>
            <button id="conn-download-zone"><span>Zone offline</span></button>
        </div>`,
}));

import { ConnectivitySheet } from './ConnectivitySheet';
import { sheetManager } from '../core/SheetManager';
import { setManualOffline } from '../../networkMonitor';
import { deleteTerrainCache } from '../../tileLoader';

describe('ConnectivitySheet', () => {
    let container: HTMLElement;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState.IS_OFFLINE = false;
        mockState.userLocation = null;
        mockState.userLocationAccuracy = null;
        container = document.createElement('div');
        container.id = 'sheet-container';
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('hydrates without crashing', () => {
        const sheet = new ConnectivitySheet();
        expect(() => sheet.hydrate()).not.toThrow();
    });

    it('close button calls sheetManager.close', () => {
        const sheet = new ConnectivitySheet();
        sheet.hydrate();
        const btn = document.getElementById('close-connectivity')!;
        btn.click();
        expect(sheetManager.close).toHaveBeenCalled();
    });

    it('offline toggle calls setManualOffline', () => {
        const sheet = new ConnectivitySheet();
        sheet.hydrate();
        const toggle = document.getElementById(
            'offline-toggle'
        ) as HTMLInputElement;
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change'));
        expect(setManualOffline).toHaveBeenCalledWith(true);
    });

    it('offline toggle uncheck calls setManualOffline(false)', () => {
        mockState.IS_OFFLINE = true;
        const sheet = new ConnectivitySheet();
        sheet.hydrate();
        const toggle = document.getElementById(
            'offline-toggle'
        ) as HTMLInputElement;
        toggle.checked = false;
        toggle.dispatchEvent(new Event('change'));
        expect(setManualOffline).toHaveBeenCalledWith(false);
    });

    it('sets aria-checked on offline toggle', () => {
        mockState.IS_OFFLINE = true;
        const sheet = new ConnectivitySheet();
        sheet.hydrate();
        const toggle = document.getElementById('offline-toggle')!;
        expect(toggle.getAttribute('aria-checked')).toBe('true');
    });

    it('clear cache button calls deleteTerrainCache', () => {
        const sheet = new ConnectivitySheet();
        sheet.hydrate();
        const btn = document.getElementById('conn-clear-cache')!;
        btn.click();
        expect(deleteTerrainCache).toHaveBeenCalled();
    });

    it('affiche la précision GPS avec deux décimales au maximum', () => {
        mockState.userLocationAccuracy = 12.34567;
        const sheet = new ConnectivitySheet();
        sheet.hydrate();

        expect(document.getElementById('gps-accuracy')?.textContent).toBe(
            '12.35 m'
        );
    });

    it('disposes cleanly', () => {
        const sheet = new ConnectivitySheet();
        sheet.hydrate();
        expect(() => sheet.dispose()).not.toThrow();
    });
});
