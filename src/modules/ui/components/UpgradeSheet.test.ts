import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockIap } = vi.hoisted(() => ({
    mockIap: {
        isProActive: vi.fn(() => false),
        showUpgradePrompt: vi.fn(),
    },
}));

vi.mock('../../iap', () => mockIap);
vi.mock('../../toast', () => ({ showToast: vi.fn() }));
vi.mock('../../haptics', () => ({ haptic: { light: vi.fn() } }));
vi.mock('../../../i18n/I18nService', () => ({
    i18n: { t: (key: string) => key },
}));
vi.mock('../../eventBus', () => ({
    eventBus: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('../../iapService', () => ({
    iapService: {
        getOfferings: vi.fn().mockResolvedValue(null),
        purchase: vi.fn().mockResolvedValue({ error: 'mock' }),
        restore: vi.fn().mockResolvedValue(null),
        getPrices: vi.fn().mockResolvedValue({
            monthly: '—',
            yearly: '—',
            lifetime: '—',
        }),
    },
}));
vi.mock('../core/SheetManager', () => ({
    sheetManager: {
        back: vi.fn(),
        close: vi.fn(),
        canGoBack: vi.fn(() => false),
    },
}));

import { UpgradeSheet } from './UpgradeSheet';
import { sheetManager } from '../core/SheetManager';

describe('UpgradeSheet', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="template-upgrade">
                <button id="close-upgrade"></button>
                <span class="price-monthly">—</span>
                <span class="price-yearly">—</span>
                <span class="price-lifetime">—</span>
                <button id="btn-buy-monthly"></button>
                <button id="btn-buy-yearly"></button>
                <button id="btn-buy-lifetime"></button>
                <button id="btn-restore"></button>
            </div>
            <div id="sheet-container"></div>
        `;
        vi.clearAllMocks();
        vi.mocked(sheetManager.canGoBack).mockReturnValue(false);
    });

    it('constructs without throwing', () => {
        const sheet = new UpgradeSheet();
        expect(sheet).toBeDefined();
        sheet.dispose();
    });

    it("render ne lance pas d'erreur", () => {
        const sheet = new UpgradeSheet();
        (sheet as any).element = document.getElementById('template-upgrade');
        sheet.render();
        sheet.dispose();
    });

    it('navigation button closes or returns through SheetManager.back', () => {
        const sheet = new UpgradeSheet();
        (sheet as any).element = document.getElementById('template-upgrade');
        sheet.render();

        const closeBtn = document.getElementById('close-upgrade');
        expect(closeBtn).not.toBeNull();
        closeBtn!.click();
        expect(sheetManager.back).toHaveBeenCalled();
        sheet.dispose();
    });

    it('labels the navigation button as a return when opened from settings', () => {
        vi.mocked(sheetManager.canGoBack).mockReturnValue(true);
        const sheet = new UpgradeSheet();
        (sheet as any).element = document.getElementById('template-upgrade');
        sheet.render();

        expect(
            document.getElementById('close-upgrade')?.getAttribute('aria-label')
        ).toBe('upgrade.aria.back');
        sheet.dispose();
    });

    it('dispose cleans up without errors', () => {
        const sheet = new UpgradeSheet();
        (sheet as any).element = document.getElementById('template-upgrade');
        sheet.render();
        sheet.dispose();
        expect((sheet as any).element).toBeNull();
    });
});
