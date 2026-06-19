import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockIsProActive } = vi.hoisted(() => ({
    mockIsProActive: vi.fn(() => false),
}));

vi.mock('../../state', () => ({
    isProActive: mockIsProActive,
}));

vi.mock('../core/SheetManager', () => ({
    sheetManager: {
        open: vi.fn(),
    },
}));

vi.mock('../../../constants/storage', () => ({
    STORAGE_KEYS: {
        UPSELL_LAST_SHOW: 'suntrail_upsell_last_show',
    },
}));

vi.mock('../../../i18n/I18nService', () => ({
    i18n: { t: (k: string) => k, applyToDOM: vi.fn() },
}));

vi.mock('../../eventBus', () => ({
    eventBus: { on: vi.fn(), off: vi.fn() },
}));

import { UpsellModal } from './UpsellModal';
import { sheetManager } from '../core/SheetManager';

describe('UpsellModal.tryShow()', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        localStorage.clear();
        mockIsProActive.mockReturnValue(false);

        delete (window as any).IS_E2E;
        Object.defineProperty(navigator, 'webdriver', {
            value: false,
            configurable: true,
        });
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0',
            configurable: true,
        });

        const container = document.createElement('div');
        container.id = 'sheet-container';
        document.body.appendChild(container);
    });

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('opens the upgrade sheet after 3s when conditions are met', () => {
        UpsellModal.tryShow();
        expect(sheetManager.open).not.toHaveBeenCalled();
        vi.advanceTimersByTime(3000);
        expect(sheetManager.open).toHaveBeenCalledWith('upgrade-sheet');
    });

    it('does not show if user is already Pro', () => {
        mockIsProActive.mockReturnValue(true);
        UpsellModal.tryShow();
        vi.advanceTimersByTime(3000);
        expect(sheetManager.open).not.toHaveBeenCalled();
    });

    it('does not show if last shown less than 24h ago', () => {
        localStorage.setItem(
            'suntrail_upsell_last_show',
            String(Date.now() - 3600000)
        );
        UpsellModal.tryShow();
        vi.advanceTimersByTime(3000);
        expect(sheetManager.open).not.toHaveBeenCalled();
    });

    it('shows if last shown more than 24h ago', () => {
        localStorage.setItem(
            'suntrail_upsell_last_show',
            String(Date.now() - 25 * 60 * 60 * 1000)
        );
        UpsellModal.tryShow();
        vi.advanceTimersByTime(3000);
        expect(sheetManager.open).toHaveBeenCalledWith('upgrade-sheet');
    });

    it('records the show timestamp', () => {
        UpsellModal.tryShow();
        const ts = localStorage.getItem('suntrail_upsell_last_show');
        expect(ts).not.toBeNull();
        expect(Number(ts)).toBeGreaterThan(0);
    });

    it('skips if test mode is detected via webdriver', () => {
        Object.defineProperty(navigator, 'webdriver', {
            value: true,
            configurable: true,
        });
        const consoleSpy = vi
            .spyOn(console, 'log')
            .mockImplementation(() => {});
        UpsellModal.tryShow();
        vi.advanceTimersByTime(3000);
        expect(sheetManager.open).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('skips if test mode is detected via userAgent', () => {
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Playwright',
            configurable: true,
        });
        UpsellModal.tryShow();
        vi.advanceTimersByTime(3000);
        expect(sheetManager.open).not.toHaveBeenCalled();
    });

    it('skips if IS_E2E flag is set', () => {
        (window as any).IS_E2E = true;
        UpsellModal.tryShow();
        vi.advanceTimersByTime(3000);
        expect(sheetManager.open).not.toHaveBeenCalled();
    });

    it('re-checks isProActive after the 3s delay', () => {
        mockIsProActive.mockReturnValueOnce(false).mockReturnValueOnce(true);
        UpsellModal.tryShow();
        vi.advanceTimersByTime(3000);
        expect(sheetManager.open).not.toHaveBeenCalled();
    });
});
