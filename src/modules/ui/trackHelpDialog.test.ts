import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCapacitor, mockOpenAssociationSettings } = vi.hoisted(() => ({
    mockCapacitor: { isNativePlatform: vi.fn(() => true) },
    mockOpenAssociationSettings: vi.fn().mockResolvedValue(true),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: mockCapacitor }));
vi.mock('../gpxImportIntake', () => ({
    openGpxAssociationSettings: mockOpenAssociationSettings,
}));
vi.mock('../../i18n/I18nService', () => ({
    i18n: { t: (key: string) => key },
}));

import { showTrackHelpDialog } from './trackHelpDialog';

function overlay(): HTMLElement {
    return document.getElementById('track-help-overlay') as HTMLElement;
}

function click(selector: string): void {
    overlay().querySelector<HTMLButtonElement>(selector)!.click();
}

describe('showTrackHelpDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';
        mockCapacitor.isNativePlatform.mockReturnValue(true);
    });

    it('affiche tous les onglets quand aucun filtre n’est fourni', async () => {
        const promise = showTrackHelpDialog();

        expect(overlay().querySelectorAll('.track-help-tab')).toHaveLength(4);
        expect(overlay().querySelectorAll('.track-help-panel')).toHaveLength(4);
        expect(overlay().querySelectorAll('li')).toHaveLength(13);

        click('[data-action="close"]');
        await promise;
    });

    it('n’affiche qu’un onglet sans barre pour la Sortie', async () => {
        const promise = showTrackHelpDialog({ tabs: ['record'] });

        expect(overlay().querySelectorAll('.track-help-tab')).toHaveLength(0);
        expect(overlay().querySelectorAll('.track-help-panel')).toHaveLength(1);
        expect(overlay().querySelector('[data-panel="record"]')).not.toBeNull();

        click('[data-action="close"]');
        await promise;
    });

    it('affiche Préparer et Importer pour la Bibliothèque', async () => {
        const promise = showTrackHelpDialog({ tabs: ['prepare', 'import'] });

        const tabs = overlay().querySelectorAll('.track-help-tab');
        expect(tabs).toHaveLength(2);
        expect(overlay().querySelector('[data-panel="record"]')).toBeNull();

        click('[data-action="close"]');
        await promise;
    });

    it('bascule vers l’onglet Importer', async () => {
        const promise = showTrackHelpDialog();

        click('.track-help-tab[data-tab="import"]');

        const importPanel = overlay().querySelector<HTMLElement>(
            '[data-panel="import"]'
        )!;
        const recordPanel = overlay().querySelector<HTMLElement>(
            '[data-panel="record"]'
        )!;
        expect(importPanel.hidden).toBe(false);
        expect(recordPanel.hidden).toBe(true);

        click('[data-action="close"]');
        await promise;
    });

    it('ouvre les réglages Android depuis le bouton dédié', async () => {
        const promise = showTrackHelpDialog();

        click('[data-action="settings"]');
        expect(mockOpenAssociationSettings).toHaveBeenCalledTimes(1);

        click('[data-action="close"]');
        await promise;
    });

    it('masque le bouton de réglages sur le Web', async () => {
        mockCapacitor.isNativePlatform.mockReturnValue(false);
        const promise = showTrackHelpDialog();

        expect(overlay().querySelector('[data-action="settings"]')).toBeNull();

        click('[data-action="close"]');
        await promise;
    });
});
