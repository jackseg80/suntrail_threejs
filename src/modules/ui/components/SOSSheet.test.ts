import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../core/SheetManager', () => ({
    sheetManager: {
        open: vi.fn(),
        back: vi.fn(),
    },
}));

vi.mock('../../../i18n/I18nService', () => ({
    i18n: { t: (k: string) => k, applyToDOM: vi.fn() },
}));

vi.mock('../../eventBus', () => ({
    eventBus: { on: vi.fn(), off: vi.fn() },
}));

vi.mock('../../toast', () => ({
    showToast: vi.fn(),
}));

const { mockGenerateSOSMessage } = vi.hoisted(() => ({
    mockGenerateSOSMessage: vi.fn(),
}));

vi.mock('../../expertService', () => ({
    expertService: {
        generateSOSMessage: mockGenerateSOSMessage,
    },
}));

vi.mock('../templates/sos.html?raw', () => ({
    default: `
        <div id="sos" class="bottom-sheet">
            <div id="sos-text-container">⌛ Localisation en cours...</div>
            <button id="sos-copy-btn">Copier</button>
            <button id="sos-sms-btn" disabled>SMS</button>
            <button id="sos-header-close-btn">Fermer</button>
        </div>`,
}));

import { SOSSheet } from './SOSSheet';
import { sheetManager } from '../core/SheetManager';
import { eventBus } from '../../eventBus';
import { showToast } from '../../toast';

describe('SOSSheet', () => {
    let container: HTMLElement;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGenerateSOSMessage.mockResolvedValue(
            'SOS: Lat 46.5 Lon 7.2 Alt 1200m'
        );
        container = document.createElement('div');
        container.id = 'sheet-container';
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('hydrates without crashing', () => {
        const sheet = new SOSSheet();
        expect(() => sheet.hydrate()).not.toThrow();
    });

    it('sets aria-label on copy button', () => {
        const sheet = new SOSSheet();
        sheet.hydrate();
        const btn = document.getElementById('sos-copy-btn');
        expect(btn?.getAttribute('aria-label')).toBe('sos.copy');
    });

    it('sets aria-live on text container', () => {
        const sheet = new SOSSheet();
        sheet.hydrate();
        const container = document.getElementById('sos-text-container');
        expect(container?.getAttribute('aria-live')).toBe('polite');
    });

    it('the single close button follows the common sheet back contract', () => {
        const sheet = new SOSSheet();
        sheet.hydrate();
        document.getElementById('sos-header-close-btn')!.click();
        expect(sheetManager.back).toHaveBeenCalledTimes(1);
    });

    it('copy button copies text to clipboard', () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });
        const sheet = new SOSSheet();
        sheet.hydrate();
        const textContainer = document.getElementById('sos-text-container')!;
        textContainer.textContent = 'SOS: Help me!';
        const btn = document.getElementById('sos-copy-btn')!;
        btn.click();
        expect(writeText).toHaveBeenCalledWith('SOS: Help me!');
        expect(showToast).toHaveBeenCalledWith('sos.copied');
    });

    it('does not copy when text container is empty', () => {
        const writeText = vi.fn();
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });
        const sheet = new SOSSheet();
        sheet.hydrate();
        const textContainer = document.getElementById('sos-text-container')!;
        textContainer.textContent = '';
        const btn = document.getElementById('sos-copy-btn')!;
        btn.click();
        expect(writeText).not.toHaveBeenCalled();
    });

    it('registers sheetOpened listener to resolveAndDisplay', async () => {
        const sheet = new SOSSheet();
        sheet.hydrate();
        expect(eventBus.on).toHaveBeenCalledWith(
            'sheetOpened',
            expect.anything()
        );
    });

    it('resolves SOS message when sheetOpened with id=sos', async () => {
        let sheetOpenedHandler: (payload: { id: string }) => void = () => {};
        vi.mocked(eventBus.on).mockImplementation((_event, fn) => {
            if (_event === 'sheetOpened')
                sheetOpenedHandler = fn as (payload: { id: string }) => void;
        });

        const sheet = new SOSSheet();
        sheet.hydrate();
        await sheetOpenedHandler({ id: 'sos' });

        const textContainer = document.getElementById('sos-text-container')!;
        expect(textContainer.textContent).toBe(
            'SOS: Lat 46.5 Lon 7.2 Alt 1200m'
        );
    });

    it('enables SMS button after message resolution', async () => {
        let sheetOpenedHandler: (payload: { id: string }) => void = () => {};
        vi.mocked(eventBus.on).mockImplementation((_event, fn) => {
            if (_event === 'sheetOpened')
                sheetOpenedHandler = fn as (payload: { id: string }) => void;
        });

        const sheet = new SOSSheet();
        sheet.hydrate();
        await sheetOpenedHandler({ id: 'sos' });

        const smsBtn = document.getElementById(
            'sos-sms-btn'
        ) as HTMLButtonElement;
        expect(smsBtn.disabled).toBe(false);
    });

    it('shows error message when SOS generation fails', async () => {
        mockGenerateSOSMessage.mockRejectedValue(new Error('Network error'));
        let sheetOpenedHandler: (payload: { id: string }) => void = () => {};
        vi.mocked(eventBus.on).mockImplementation((_event, fn) => {
            if (_event === 'sheetOpened')
                sheetOpenedHandler = fn as (payload: { id: string }) => void;
        });

        const sheet = new SOSSheet();
        sheet.hydrate();
        await sheetOpenedHandler({ id: 'sos' });

        const textContainer = document.getElementById('sos-text-container')!;
        expect(textContainer.textContent).toBe('sos.error');
    });

    it('ignores sheetOpened for other sheet ids', async () => {
        let sheetOpenedHandler: (payload: { id: string }) => void = () => {};
        vi.mocked(eventBus.on).mockImplementation((_event, fn) => {
            if (_event === 'sheetOpened')
                sheetOpenedHandler = fn as (payload: { id: string }) => void;
        });

        const sheet = new SOSSheet();
        sheet.hydrate();
        await sheetOpenedHandler({ id: 'other-sheet' });

        expect(mockGenerateSOSMessage).not.toHaveBeenCalled();
    });

    it('disposes cleanly', () => {
        const sheet = new SOSSheet();
        sheet.hydrate();
        expect(() => sheet.dispose()).not.toThrow();
    });
});
