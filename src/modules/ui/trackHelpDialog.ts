import { Capacitor } from '@capacitor/core';
import { i18n } from '../../i18n/I18nService';
import { openGpxAssociationSettings } from '../gpxImportIntake';

export type TrackHelpTab = 'record' | 'prepare' | 'import' | 'guidance';

interface HelpTabDef {
    id: TrackHelpTab;
    labelKey: string;
    stepKeys: string[];
}

const TABS: HelpTabDef[] = [
    {
        id: 'record',
        labelKey: 'track.help.tabRecord',
        stepKeys: [
            'track.help.recordStep1',
            'track.help.recordStep2',
            'track.help.recordStep3',
        ],
    },
    {
        id: 'prepare',
        labelKey: 'track.help.tabPrepare',
        stepKeys: [
            'track.help.prepareStep1',
            'track.help.prepareStep2',
            'track.help.prepareStep3',
        ],
    },
    {
        id: 'import',
        labelKey: 'track.help.tabImport',
        stepKeys: [
            'track.help.importStep1',
            'track.help.importStep2',
            'track.help.importStep3',
            'track.help.importStep4',
        ],
    },
    {
        id: 'guidance',
        labelKey: 'track.help.tabGuidance',
        stepKeys: [
            'track.help.guidanceStep1',
            'track.help.guidanceStep2',
            'track.help.guidanceStep3',
        ],
    },
];

export interface TrackHelpOptions {
    /** Onglets à afficher. Par défaut : tous. */
    tabs?: TrackHelpTab[];
}

/**
 * trackHelpDialog.ts — Aide « Parcours » adaptée au contexte (v5.91).
 *
 * Les onglets dépendent de la page : « Enregistrer » dans Sortie, « Préparer »
 * et « Importer » dans Bibliothèque, « Suivre » depuis les Réglages de
 * l'itinéraire. Un seul onglet masque la barre d'onglets.
 */
export function showTrackHelpDialog(
    options: TrackHelpOptions = {}
): Promise<void> {
    return new Promise<void>((resolve) => {
        const requested = options.tabs;
        const selected = requested
            ? TABS.filter((tab) => requested.includes(tab.id))
            : TABS;
        const tabs = selected.length > 0 ? selected : TABS;
        const showTabBar = tabs.length > 1;

        const previouslyFocused = document.activeElement as HTMLElement | null;
        const overlay = document.createElement('div');
        overlay.id = 'track-help-overlay';
        overlay.className = 'confirm-dialog-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'track-help-title');

        const tabsHtml = showTabBar
            ? `<div class="track-help-tabs" role="tablist">${tabs
                  .map(
                      (tab, index) => `
                <button
                    type="button"
                    role="tab"
                    class="track-help-tab${index === 0 ? ' is-active' : ''}"
                    data-tab="${tab.id}"
                    aria-selected="${index === 0}"
                >${i18n.t(tab.labelKey)}</button>
            `
                  )
                  .join('')}</div>`
            : '';

        const panelsHtml = tabs
            .map((tab, index) => {
                const steps = tab.stepKeys
                    .map((key) => `<li>${i18n.t(key)}</li>`)
                    .join('');
                return `
                <ul
                    class="track-help-panel"
                    role="tabpanel"
                    data-panel="${tab.id}"
                    ${index === 0 ? '' : 'hidden'}
                >${steps}</ul>
            `;
            })
            .join('');

        const showSettings = Capacitor.isNativePlatform();
        overlay.innerHTML = `
            <div class="confirm-dialog-card track-help-card">
                <h3 id="track-help-title" class="confirm-dialog-title">${i18n.t('track.help.title')}</h3>
                ${tabsHtml}
                <div class="track-help-body">${panelsHtml}</div>
                <div class="confirm-dialog-actions">
                    ${
                        showSettings
                            ? `<button type="button" class="confirm-dialog-btn confirm-dialog-cancel" data-action="settings">${i18n.t('track.help.settings')}</button>`
                            : ''
                    }
                    <button type="button" class="confirm-dialog-btn confirm-dialog-accept" data-action="close">${i18n.t('track.help.close')}</button>
                </div>
            </div>
        `;

        const selectTab = (tabId: string): void => {
            overlay
                .querySelectorAll<HTMLButtonElement>('.track-help-tab')
                .forEach((tab) => {
                    const active = tab.dataset.tab === tabId;
                    tab.classList.toggle('is-active', active);
                    tab.setAttribute('aria-selected', String(active));
                });
            overlay
                .querySelectorAll<HTMLElement>('.track-help-panel')
                .forEach((panel) => {
                    panel.hidden = panel.dataset.panel !== tabId;
                });
        };

        const cleanup = (): void => {
            overlay.removeEventListener('click', onClick);
            document.removeEventListener('keydown', onKeyDown);
            overlay.remove();
            previouslyFocused?.focus();
            resolve();
        };

        const onClick = (e: Event): void => {
            const target = e.target as HTMLElement;
            const tab = target.closest<HTMLElement>('.track-help-tab');
            if (tab?.dataset.tab) {
                selectTab(tab.dataset.tab);
                return;
            }
            const action = target
                .closest('[data-action]')
                ?.getAttribute('data-action');
            if (action === 'settings') void openGpxAssociationSettings();
            else if (action === 'close') cleanup();
        };

        const onKeyDown = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                e.preventDefault();
                cleanup();
            }
        };

        overlay.addEventListener('click', onClick);
        document.addEventListener('keydown', onKeyDown);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => {
            (
                overlay.querySelector(
                    '[data-action="close"]'
                ) as HTMLElement | null
            )?.focus();
        });
    });
}
