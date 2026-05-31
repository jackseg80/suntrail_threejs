import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockIap, mockAuthService } = vi.hoisted(() => ({
    mockIap: {
        isProActive: vi.fn(() => false),
        showUpgradePrompt: vi.fn(),
    },
    mockAuthService: {
        isAuthenticated: false,
        user: null as { email: string } | null,
        signOut: vi.fn().mockResolvedValue(undefined),
        deleteAccount: vi.fn().mockResolvedValue({ error: null }),
        signInWithGoogle: vi.fn().mockResolvedValue(undefined),
        linkGoogleAccount: vi.fn().mockResolvedValue(undefined),
        isGoogleLinked: vi.fn(() => false),
    },
}));

vi.mock('../../performance', () => ({
    applyPreset: vi.fn(),
    getGpuInfo: vi.fn(() => 'Mock GPU'),
    detectBestPreset: vi.fn(() => 'balanced'),
}));

vi.mock('../../terrain', () => ({
    updateHydrologyVisibility: vi.fn(),
    refreshTerrain: vi.fn(),
}));

vi.mock('../../iap', () => mockIap);

vi.mock('../../authService', () => ({ authService: mockAuthService }));
vi.mock('../../toast', () => ({ showToast: vi.fn() }));

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

    it("doit mettre à jour le state lors du changement d'un slider", () => {
        const slider = document.getElementById(
            'res-slider'
        ) as HTMLInputElement;
        const disp = document.getElementById('res-disp');

        slider.value = '75';
        slider.dispatchEvent(new Event('input'));

        expect(state.RESOLUTION).toBe(75);
        expect(disp?.textContent).toBe('75');
    });

    it("doit mettre à jour le state lors du basculement d'un toggle", () => {
        const toggle = document.getElementById(
            'energy-saver-toggle'
        ) as HTMLInputElement;
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change'));
        expect(state.ENERGY_SAVER).toBe(true);
    });

    it('doit bloquer les features PRO pour les utilisateurs gratuits', () => {
        mockIap.isProActive.mockReturnValue(false);
        const toggle = document.getElementById(
            'inclinometer-toggle'
        ) as HTMLInputElement;
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change'));
        expect(toggle.checked).toBe(false);
        expect(mockIap.showUpgradePrompt).toHaveBeenCalledWith('inclinometer');
    });
});

describe.skip('SettingsSheet - Delete Account button (RGPD)', () => {
    const ACCOUNT_DOM = `
        <div id="settings-panel">
            <button id="close-panel"></button>
            <div id="account-section">
                <div id="account-avatar"></div>
                <div id="account-status"></div>
                <div id="account-email"></div>
                <button id="account-action-btn"></button>
                <button id="account-delete-btn" style="display:none;"></button>
                <button id="account-link-google-btn" style="display:none;"></button>
            </div>
            <input type="range" id="res-slider" min="1" max="100" value="50">
            <span id="res-disp">50</span>
            <input type="checkbox" id="energy-saver-toggle">
            <input type="checkbox" id="inclinometer-toggle">
            <div id="row-inclinometer"></div>
            <button id="btn-upgrade-pro"></button>
        </div>
        <div id="sheet-container"></div>
    `;

    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = ACCOUNT_DOM;
    });

    it('should show delete button when user is authenticated', () => {
        mockAuthService.isAuthenticated = true;
        mockAuthService.user = { email: 'test@suntrail.app' };

        const sheet = new SettingsSheet();
        (sheet as any).element = document.getElementById('settings-panel');
        sheet.render();

        const deleteBtn = document.getElementById(
            'account-delete-btn'
        ) as HTMLButtonElement;
        expect(deleteBtn.style.display).toBe('block');
    });

    it('should hide delete button when user is not authenticated', () => {
        mockAuthService.isAuthenticated = false;
        mockAuthService.user = null;

        const sheet = new SettingsSheet();
        (sheet as any).element = document.getElementById('settings-panel');
        sheet.render();

        const deleteBtn = document.getElementById(
            'account-delete-btn'
        ) as HTMLButtonElement;
        expect(deleteBtn.style.display).toBe('none');
    });
});

describe.skip('SettingsSheet - Google buttons', () => {
    const ACCOUNT_DOM = `
        <div id="settings-panel">
            <button id="close-panel"></button>
            <div id="account-section">
                <div id="account-avatar"></div>
                <div id="account-status"></div>
                <div id="account-email"></div>
                <button id="account-action-btn"></button>
                <button id="account-delete-btn" style="display:none;"></button>
                <button id="account-link-google-btn" style="display:none;"></button>
            </div>
            <input type="range" id="res-slider" min="1" max="100" value="50">
            <span id="res-disp">50</span>
            <input type="checkbox" id="energy-saver-toggle">
            <input type="checkbox" id="inclinometer-toggle">
            <div id="row-inclinometer"></div>
            <button id="btn-upgrade-pro"></button>
        </div>
        <div id="sheet-container"></div>
    `;

    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = ACCOUNT_DOM;
        mockAuthService.isGoogleLinked.mockReturnValue(false);
    });

    it('should call signInWithGoogle when main button is clicked and not authenticated', async () => {
        mockAuthService.isAuthenticated = false;
        mockAuthService.user = null;

        const sheet = new SettingsSheet();
        (sheet as any).element = document.getElementById('settings-panel');
        sheet.render();

        const actionBtn = document.getElementById(
            'account-action-btn'
        ) as HTMLButtonElement;
        await actionBtn.onclick?.(new MouseEvent('click') as any);

        expect(mockAuthService.signInWithGoogle).toHaveBeenCalled();
    });

    it('should show link-google button when authenticated and google not linked', () => {
        mockAuthService.isAuthenticated = true;
        mockAuthService.user = { email: 'test@test.com' };
        mockAuthService.isGoogleLinked.mockReturnValue(false);

        const sheet = new SettingsSheet();
        (sheet as any).element = document.getElementById('settings-panel');
        sheet.render();

        const linkBtn = document.getElementById(
            'account-link-google-btn'
        ) as HTMLButtonElement;
        expect(linkBtn.style.display).toBe('flex');
    });

    it('should hide link-google button when authenticated and google already linked', () => {
        mockAuthService.isAuthenticated = true;
        mockAuthService.user = { email: 'test@test.com' };
        mockAuthService.isGoogleLinked.mockReturnValue(true);

        const sheet = new SettingsSheet();
        (sheet as any).element = document.getElementById('settings-panel');
        sheet.render();

        const linkBtn = document.getElementById(
            'account-link-google-btn'
        ) as HTMLButtonElement;
        expect(linkBtn.style.display).toBe('none');
    });
});
