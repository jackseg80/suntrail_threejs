import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock haptics (avoid Capacitor dependency)
vi.mock('../../haptics', () => ({
    haptic: vi.fn(),
}));

import { sheetManager } from './SheetManager';
import { eventBus } from '../../eventBus';

function createSheet(id: string): HTMLElement {
    const sheet = document.createElement('div');
    sheet.id = id;
    const title = document.createElement('h2');
    title.classList.add('sheet-title');
    title.textContent = 'Test';
    sheet.appendChild(title);
    document.body.appendChild(sheet);
    return sheet;
}

describe('SheetManager', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="sheet-overlay"></div>';
        // Fermer tout sheet ouvert entre les tests
        sheetManager.close();
    });

    it('open() ajoute la classe is-open au sheet', () => {
        const sheet = createSheet('test-sheet');
        sheetManager.open('test-sheet');

        expect(sheet.classList.contains('is-open')).toBe(true);
        expect(sheetManager.getActiveSheetId()).toBe('test-sheet');
    });

    it('close() retire la classe is-open', () => {
        const sheet = createSheet('test-sheet');
        sheetManager.open('test-sheet');
        sheetManager.close();

        expect(sheet.classList.contains('is-open')).toBe(false);
        expect(sheetManager.getActiveSheetId()).toBeNull();
    });

    it('toggle() ouvre puis ferme le sheet', () => {
        createSheet('toggle-sheet');
        sheetManager.toggle('toggle-sheet');
        expect(sheetManager.getActiveSheetId()).toBe('toggle-sheet');

        sheetManager.toggle('toggle-sheet');
        expect(sheetManager.getActiveSheetId()).toBeNull();
    });

    it('exclusivité : ouvrir un 2ème sheet ferme le 1er', () => {
        const sheet1 = createSheet('sheet-1');
        const sheet2 = createSheet('sheet-2');

        sheetManager.open('sheet-1');
        expect(sheet1.classList.contains('is-open')).toBe(true);

        sheetManager.open('sheet-2');
        expect(sheet1.classList.contains('is-open')).toBe(false);
        expect(sheet2.classList.contains('is-open')).toBe(true);
        expect(sheetManager.getActiveSheetId()).toBe('sheet-2');
        expect(document.body.classList.contains('sheet-sheet-1-open')).toBe(
            false
        );
    });

    it('openChild() conserve le parent et back() le restaure', () => {
        const parent = createSheet('parent-sheet');
        const child = createSheet('child-sheet');
        parent.scrollTop = 120;

        sheetManager.open('parent-sheet');
        sheetManager.openChild('child-sheet');

        expect(parent.classList.contains('is-open')).toBe(false);
        expect(child.classList.contains('is-open')).toBe(true);
        expect(child.classList.contains('has-sheet-parent')).toBe(true);
        expect(sheetManager.canGoBack()).toBe(true);
        expect(sheetManager.getRootSheetId()).toBe('parent-sheet');

        sheetManager.back();

        expect(parent.classList.contains('is-open')).toBe(true);
        expect(parent.classList.contains('has-sheet-parent')).toBe(false);
        expect(child.classList.contains('is-open')).toBe(false);
        expect(sheetManager.getActiveSheetId()).toBe('parent-sheet');
        expect(sheetManager.canGoBack()).toBe(false);
        expect(sheetManager.getRootSheetId()).toBe('parent-sheet');
    });

    it('laisse une sous-page interne consommer Retour avant de fermer', () => {
        const sheet = createSheet('internal-sheet');
        const handler = vi.fn(() => true);
        const unregister = sheetManager.registerBackHandler(
            'internal-sheet',
            handler
        );
        sheetManager.open('internal-sheet');

        sheetManager.back();

        expect(handler).toHaveBeenCalledOnce();
        expect(sheet.classList.contains('is-open')).toBe(true);
        unregister();
    });

    it('close() depuis un enfant ferme tout le flux', () => {
        createSheet('parent-sheet');
        createSheet('child-sheet');
        sheetManager.open('parent-sheet');
        sheetManager.openChild('child-sheet');

        sheetManager.close();

        expect(sheetManager.getActiveSheetId()).toBeNull();
        expect(sheetManager.canGoBack()).toBe(false);
        expect(document.body.classList.contains('sheet-open')).toBe(false);
    });

    it("ARIA : role=dialog et aria-modal=true posés à l'ouverture", () => {
        const sheet = createSheet('aria-sheet');
        sheet.inert = true;
        sheet.setAttribute('aria-hidden', 'true');
        sheetManager.open('aria-sheet');

        expect(sheet.getAttribute('role')).toBe('dialog');
        expect(sheet.getAttribute('aria-modal')).toBe('true');
        expect(sheet.getAttribute('tabindex')).toBe('-1');
        expect(sheet.inert).toBe(false);
        expect(sheet.hasAttribute('aria-hidden')).toBe(false);
    });

    it('ARIA : aria-labelledby pointe vers le .sheet-title', () => {
        const sheet = createSheet('label-sheet');
        sheetManager.open('label-sheet');

        const titleId = sheet.querySelector('.sheet-title')?.id;
        expect(titleId).toBe('sheet-title-label-sheet');
        expect(sheet.getAttribute('aria-labelledby')).toBe(titleId);
    });

    it('ARIA : attributs nettoyés à la fermeture', () => {
        const sheet = createSheet('cleanup-sheet');
        sheetManager.open('cleanup-sheet');
        sheetManager.close();

        expect(sheet.getAttribute('role')).toBeNull();
        expect(sheet.getAttribute('aria-modal')).toBeNull();
        expect(sheet.getAttribute('aria-labelledby')).toBeNull();
        expect(sheet.inert).toBe(true);
        expect(sheet.getAttribute('aria-hidden')).toBe('true');
    });

    it('émet sheetOpened / sheetClosed via eventBus', () => {
        createSheet('event-sheet');
        const openHandler = vi.fn();
        const closeHandler = vi.fn();
        eventBus.on('sheetOpened', openHandler);
        eventBus.on('sheetClosed', closeHandler);

        sheetManager.open('event-sheet');
        expect(openHandler).toHaveBeenCalledWith({ id: 'event-sheet' });

        sheetManager.close();
        expect(closeHandler).toHaveBeenCalledWith({ id: 'event-sheet' });

        eventBus.off('sheetOpened', openHandler);
        eventBus.off('sheetClosed', closeHandler);
    });

    it('body.sheet-open togglé correctement', () => {
        createSheet('body-sheet');
        sheetManager.open('body-sheet');
        expect(document.body.classList.contains('sheet-open')).toBe(true);
        expect(document.body.classList.contains('sheet-body-sheet-open')).toBe(
            true
        );

        sheetManager.close();
        expect(document.body.classList.contains('sheet-open')).toBe(false);
        expect(document.body.classList.contains('sheet-body-sheet-open')).toBe(
            false
        );
    });

    // Note: le test overlay n'est pas fiable car SheetManager est un singleton
    // qui cache la référence DOM de l'overlay. Les resets DOM entre tests
    // invalident cette référence. L'overlay est couvert par les tests a11y e2e.

    it('open() sur un ID inexistant ne plante pas', () => {
        expect(() => sheetManager.open('nope')).not.toThrow();
        expect(sheetManager.getActiveSheetId()).toBeNull();
    });

    it('close() sans sheet ouvert ne plante pas', () => {
        expect(() => sheetManager.close()).not.toThrow();
    });

    it('Escape ferme le sheet actif', () => {
        createSheet('esc-sheet');
        sheetManager.open('esc-sheet');

        const event = new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
        });
        document.dispatchEvent(event);

        expect(sheetManager.getActiveSheetId()).toBeNull();
    });

    it('Escape revient au parent avant de fermer le flux', () => {
        createSheet('escape-parent');
        createSheet('escape-child');
        sheetManager.open('escape-parent');
        sheetManager.openChild('escape-child');

        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        );

        expect(sheetManager.getActiveSheetId()).toBe('escape-parent');
    });
});
