import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockIap } = vi.hoisted(() => ({
    mockIap: {
        isProActive: vi.fn(() => false),
        showUpgradePrompt: vi.fn(),
        activateDiscoveryTrial: vi.fn()
    }
}));

vi.mock('../../performance', () => ({
    applyPreset: vi.fn(),
    getGpuInfo: vi.fn(() => 'Mock GPU'),
    detectBestPreset: vi.fn(() => 'balanced')
}));

vi.mock('../../terrain', () => ({
    updateHydrologyVisibility: vi.fn(),
    refreshTerrain: vi.fn()
}));

vi.mock('../../iap', () => mockIap);

import { state } from '../../state';
import { SettingsSheet } from './SettingsSheet';

describe('SettingsSheet - UI Logic (v5.29.36)', () => {
    let sheet: SettingsSheet;

    beforeEach(() => {
        vi.clearAllMocks();
        
        document.body.innerHTML = `
            <div id="settings-panel">
                <button id="close-panel"></button>
                <input type="range" id="res-slider" min="1" max="100" value="50">
                <span id="res-disp">50</span>
                <input type="checkbox" id="energy-saver-toggle">
                <input type="checkbox" id="inclinometer-toggle">
                <div id="row-inclinometer"></div>
                <button id="btn-upgrade-pro"></button>
            </div>
            <div id="sheet-container"></div>
        `;
        
        sheet = new SettingsSheet();
        (sheet as any).element = document.getElementById('settings-panel');
        sheet.render();
    });

    it('doit mettre à jour le state lors du changement d\'un slider', () => {
        const slider = document.getElementById('res-slider') as HTMLInputElement;
        const disp = document.getElementById('res-disp');
        
        slider.value = "75";
        slider.dispatchEvent(new Event('input'));
        
        expect(state.RESOLUTION).toBe(75);
        expect(disp?.textContent).toBe("75");
    });

    it('doit mettre à jour le state lors du basculement d\'un toggle', () => {
        const toggle = document.getElementById('energy-saver-toggle') as HTMLInputElement;
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change'));
        expect(state.ENERGY_SAVER).toBe(true);
    });

    it('doit bloquer les features PRO pour les utilisateurs gratuits', () => {
        mockIap.isProActive.mockReturnValue(false);
        const toggle = document.getElementById('inclinometer-toggle') as HTMLInputElement;
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change'));
        expect(toggle.checked).toBe(false);
        expect(mockIap.showUpgradePrompt).toHaveBeenCalledWith('inclinometer');
    });
});
