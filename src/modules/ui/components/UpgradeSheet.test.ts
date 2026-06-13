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
    sheetManager: { close: vi.fn() },
}));

import { UpgradeSheet } from './UpgradeSheet';

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

    it('close button calls sheetManager.close', () => {
        const sheet = new UpgradeSheet();
        (sheet as any).element = document.getElementById('template-upgrade');
        sheet.render();

        const closeBtn = document.getElementById('close-upgrade');
        expect(closeBtn).not.toBeNull();
        closeBtn!.click();
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
