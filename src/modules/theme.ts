/**
 * SunTrail Theme Manager (v5.22)
 * Gestion du mode clair/sombre avec support auto (prefers-color-scheme)
 */

import { state, saveSettings } from './state';
import { eventBus } from './eventBus';

type EffectiveTheme = 'light' | 'dark';

const darkMediaQuery = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

/** Résout 'auto' → thème effectif selon la préférence système */
export function getEffectiveTheme(): EffectiveTheme {
    if (state.themePreference !== 'auto') return state.themePreference;
    return darkMediaQuery?.matches ? 'dark' : 'light';
}

/** Applique le thème effectif sur le DOM + émet l'event */
function applyTheme(theme: EffectiveTheme): void {
    document.documentElement.dataset.theme = theme;

    // Meta theme-color pour Android status bar et PWA
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
    }
    meta.content = theme === 'light' ? '#f5f5f0' : '#0a0c12';

    eventBus.emit('themeChanged', { theme });
}

/** Initialise le thème — appeler depuis initUI() après loadSettings() */
export function initTheme(): void {
    // Application initiale
    applyTheme(getEffectiveTheme());

    // Réagir aux changements de préférence utilisateur
    state.subscribe('themePreference', () => {
        applyTheme(getEffectiveTheme());
        saveSettings();
    });

    // Réagir aux changements système (mode auto)
    darkMediaQuery?.addEventListener('change', () => {
        if (state.themePreference === 'auto') {
            applyTheme(getEffectiveTheme());
        }
    });
}
