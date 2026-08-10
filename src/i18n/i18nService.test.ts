import { describe, it, expect, vi, beforeEach } from 'vitest';
import { i18n } from './I18nService';
import { state } from '../modules/state';
import { eventBus } from '../modules/eventBus';

describe('I18nService', () => {
    beforeEach(() => {
        // Reset to default locale before each test
        i18n.setLocale('en');
    });

    it('should return English text by default', () => {
        expect(i18n.getLocale()).toBe('en');
        expect(i18n.t('track.empty.title')).toBe('No track');
    });

    it('should resolve nested keys correctly', () => {
        i18n.setLocale('fr');
        expect(i18n.t('nav.tab.search')).toBe('Recherche');
        expect(i18n.t('settings.aria.close')).toBe('Fermer les réglages');
        expect(i18n.t('common.unit.km')).toBe('km');
    });

    it('should support interpolation with {{var}}', () => {
        i18n.setLocale('fr');
        const result = i18n.t('preset.applied', { preset: 'ULTRA' });
        expect(result).toBe('Profil appliqué : ULTRA');
    });

    it('should expose localized map-source labels without technical jargon', () => {
        i18n.setLocale('fr');
        expect(i18n.t('topbar.lod.swiss')).toBe('Carte suisse');
        expect(i18n.t('topbar.lod.world')).toBe('Carte mondiale');
        expect(
            i18n.t('topbar.mapDetail', {
                source: 'Carte suisse',
                detail: '14',
            })
        ).toBe('Carte suisse · détail 14');
    });

    it('should translate in the English locale', () => {
        // English is the default locale and the reference fallback
        expect(i18n.t('track.empty.title')).toBe('No track');
    });

    it('should return the key itself when not found in any locale', () => {
        expect(i18n.t('nonexistent.key.here')).toBe('nonexistent.key.here');
        expect(i18n.t('also.missing')).toBe('also.missing');
    });

    it('should change locale with setLocale()', () => {
        i18n.setLocale('de');
        expect(i18n.getLocale()).toBe('de');
        expect(i18n.t('track.empty.title')).toBe('Keine Tour');
    });

    it('should update state.lang when changing locale', () => {
        i18n.setLocale('it');
        expect(state.lang).toBe('it');
    });

    it('should emit localeChanged event via eventBus', () => {
        const spy = vi.fn();
        eventBus.on('localeChanged', spy);
        i18n.setLocale('de');
        expect(spy).toHaveBeenCalledWith({ locale: 'de' });
        eventBus.off('localeChanged', spy);
    });

    it('should not re-emit if locale is already set', () => {
        i18n.setLocale('fr'); // explicit switch to fr
        const spy = vi.fn();
        eventBus.on('localeChanged', spy);
        i18n.setLocale('fr'); // same locale, no event
        expect(spy).not.toHaveBeenCalled();
        eventBus.off('localeChanged', spy);
    });

    it('should translate static DOM even when the locale is already active', () => {
        const button = document.createElement('button');
        button.setAttribute('data-i18n-aria-label', 'common.close');
        button.setAttribute('aria-label', 'stale');
        document.body.appendChild(button);

        i18n.setLocale('fr');

        expect(button.getAttribute('aria-label')).toBe('Fermer');
        button.remove();
    });

    it('should update document.documentElement.lang', () => {
        i18n.setLocale('de');
        expect(document.documentElement.lang).toBe('de');
        i18n.setLocale('it');
        expect(document.documentElement.lang).toBe('it');
    });

    it('should handle interpolation with missing vars gracefully', () => {
        i18n.setLocale('fr');
        const result = i18n.t('preset.applied');
        expect(result).toBe('Profil appliqué : {{preset}}');
    });

    it('should translate to all four supported languages', () => {
        i18n.setLocale('fr');
        expect(i18n.t('common.close')).toBe('Fermer');

        i18n.setLocale('de');
        expect(i18n.t('common.close')).toBe('Schliessen');

        i18n.setLocale('it');
        expect(i18n.t('common.close')).toBe('Chiudi');

        i18n.setLocale('en');
        expect(i18n.t('common.close')).toBe('Close');
    });

    it('should handle deeply nested key resolution', () => {
        i18n.setLocale('fr');
        expect(i18n.t('connectivity.download.progress')).toBe(
            'Chargement {{percent}}%'
        );
        const result = i18n.t('connectivity.download.progress', {
            percent: '75',
        });
        expect(result).toBe('Chargement 75%');
    });

    describe('detectSystemLocale', () => {
        it('should return the first supported locale from navigator.languages', () => {
            vi.stubGlobal('navigator', {
                language: 'de-CH',
                languages: ['de-CH', 'en-US'],
            });
            expect(i18n.detectSystemLocale()).toBe('de');
            vi.unstubAllGlobals();
        });

        it('should map navigator.language when languages is absent', () => {
            vi.stubGlobal('navigator', {
                language: 'it-IT',
            });
            expect(i18n.detectSystemLocale()).toBe('it');
            vi.unstubAllGlobals();
        });

        it('should match every supported locale', () => {
            vi.stubGlobal('navigator', {
                language: 'fr-FR',
                languages: ['fr-FR'],
            });
            expect(i18n.detectSystemLocale()).toBe('fr');
            vi.stubGlobal('navigator', {
                language: 'de-DE',
                languages: ['de-DE'],
            });
            expect(i18n.detectSystemLocale()).toBe('de');
            vi.stubGlobal('navigator', {
                language: 'it-CH',
                languages: ['it-CH'],
            });
            expect(i18n.detectSystemLocale()).toBe('it');
            vi.stubGlobal('navigator', {
                language: 'en-GB',
                languages: ['en-GB'],
            });
            expect(i18n.detectSystemLocale()).toBe('en');
            vi.unstubAllGlobals();
        });

        it('should fall back to en for unsupported system languages', () => {
            vi.stubGlobal('navigator', {
                language: 'es-ES',
                languages: ['es-ES', 'pt-BR'],
            });
            expect(i18n.detectSystemLocale()).toBe('en');
            vi.unstubAllGlobals();
        });

        it('should fall back to en when navigator is unavailable', () => {
            vi.stubGlobal('navigator', undefined);
            expect(i18n.detectSystemLocale()).toBe('en');
            vi.unstubAllGlobals();
        });
    });
});
