import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../core/SheetManager', () => ({
    sheetManager: {
        open: vi.fn(),
        close: vi.fn(),
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
            <button id="sos-close-btn">Fermer</button>
            <button id="sos-btn-pill">SOS</button>
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

    it('close button calls sheetManager.close', () => {
        const sheet = new SOSSheet();
        sheet.hydrate();
        const btn = document.getElementById('sos-close-btn')!;
        btn.click();
        expect(sheetManager.close).toHaveBeenCalled();
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
        expect(showToast).toHaveBeenCalledWith('🆘 Message copié');
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
        const sheet = new SOSSheet();
        sheet.hydrate();

        const textContainer = document.getElementById('sos-text-container')!;

        let sheetOpenedHandler: (payload: { id: string }) => void = () => {};
        vi.mocked(eventBus.on).mockImplementation((_event, fn) => {
            if (_event === 'sheetOpened')
                sheetOpenedHandler = fn as (payload: { id: string }) => void;
        });

        sheet.hydrate();
        await sheetOpenedHandler({ id: 'sos' });

        expect(textContainer.textContent).toBe(
            'SOS: Lat 46.5 Lon 7.2 Alt 1200m'
        );
    });

    it('enables SMS button after message resolution', async () => {
        const sheet = new SOSSheet();
        sheet.hydrate();

        let sheetOpenedHandler: (payload: { id: string }) => void = () => {};
        vi.mocked(eventBus.on).mockImplementation((_event, fn) => {
            if (_event === 'sheetOpened')
                sheetOpenedHandler = fn as (payload: { id: string }) => void;
        });

        sheet.hydrate();
        await sheetOpenedHandler({ id: 'sos' });

        const smsBtn = document.getElementById(
            'sos-sms-btn'
        ) as HTMLButtonElement;
        expect(smsBtn.disabled).toBe(false);
    });

    it('shows error message when SOS generation fails', async () => {
        mockGenerateSOSMessage.mockRejectedValue(new Error('Network error'));
        const sheet = new SOSSheet();
        sheet.hydrate();

        let sheetOpenedHandler: (payload: { id: string }) => void = () => {};
        vi.mocked(eventBus.on).mockImplementation((_event, fn) => {
            if (_event === 'sheetOpened')
                sheetOpenedHandler = fn as (payload: { id: string }) => void;
        });

        sheet.hydrate();
        await sheetOpenedHandler({ id: 'sos' });

        const textContainer = document.getElementById('sos-text-container')!;
        expect(textContainer.textContent).toBe(
            'Erreur lors de la génération du message SOS'
        );
    });

    it('ignores sheetOpened for other sheet ids', async () => {
        const sheet = new SOSSheet();
        sheet.hydrate();

        let sheetOpenedHandler: (payload: { id: string }) => void = () => {};
        vi.mocked(eventBus.on).mockImplementation((_event, fn) => {
            if (_event === 'sheetOpened')
                sheetOpenedHandler = fn as (payload: { id: string }) => void;
        });

        sheet.hydrate();
        await sheetOpenedHandler({ id: 'other-sheet' });

        expect(mockGenerateSOSMessage).not.toHaveBeenCalled();
    });

    it('disposes cleanly', () => {
        const sheet = new SOSSheet();
        sheet.hydrate();
        expect(() => sheet.dispose()).not.toThrow();
    });

    it('sets up SOS pill button when present', () => {
        const sheet = new SOSSheet();
        sheet.hydrate();
        const pill = document.getElementById('sos-btn-pill');
        expect(pill?.getAttribute('aria-label')).toBe('Appel SOS urgence');
        pill?.click();
        expect(sheetManager.open).toHaveBeenCalledWith('sos');
    });
});
