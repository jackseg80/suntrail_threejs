import fr from './locales/fr.json';
import de from './locales/de.json';
import it from './locales/it.json';
import en from './locales/en.json';
import { state } from '../modules/state';
import { eventBus } from '../modules/eventBus';

export type Locale = 'fr' | 'de' | 'it' | 'en';

type TranslationData = Record<string, unknown>;

const allTranslations: Record<Locale, TranslationData> = { fr, de, it, en };

class I18nService {
    private currentLocale: Locale;
    private translations: TranslationData;

    constructor() {
        // Default to 'fr' at construction time — setLocale() will be called
        // by initUI() once state.lang is properly restored from localStorage.
        this.currentLocale = 'fr';
        this.translations = allTranslations.fr;
    }

    /**
     * Translate a key with optional variable interpolation.
     * Supports nested keys like 'track.empty.title'.
     * Fallback chain: current locale → fr → key itself.
     */
    t(key: string, vars?: Record<string, string>): string {
        let value = this.resolve(this.translations, key);
        if (value === undefined) {
            value = this.resolve(allTranslations.fr, key);
        }
        if (value === undefined) {
            return key;
        }
        if (vars) {
            return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => vars[name] ?? `{{${name}}}`);
        }
        return value;
    }

    /**
     * Change the active locale.
     * Updates state.lang, emits 'localeChanged', sets document lang attribute.
     */
    setLocale(locale: Locale): void {
        if (locale === this.currentLocale) return;
        this.currentLocale = locale;
        this.translations = allTranslations[locale] || allTranslations.fr;
        state.lang = locale;
        eventBus.emit('localeChanged', { locale });
        if (typeof document !== 'undefined') {
            document.documentElement.lang = locale;
        }
    }

    /** Returns the current active locale. */
    getLocale(): Locale {
        return this.currentLocale;
    }

    /**
     * Apply translations to all [data-i18n] and [data-i18n-placeholder] elements
     * within the given root element. Called after every DOM clone or locale change.
     */
    applyToDOM(root: Element | DocumentFragment): void {
        // textContent translations
        const els = root.querySelectorAll('[data-i18n]');
        els.forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) el.textContent = this.t(key);
        });
        // placeholder translations
        const placeholders = root.querySelectorAll('[data-i18n-placeholder]');
        placeholders.forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (key) (el as HTMLInputElement).placeholder = this.t(key);
        });
        // aria-label translations (a11y)
        const ariaLabels = root.querySelectorAll('[data-i18n-aria-label]');
        ariaLabels.forEach(el => {
            const key = el.getAttribute('data-i18n-aria-label');
            if (key) el.setAttribute('aria-label', this.t(key));
        });
    }

    /** Resolve a dot-separated key path in a nested object. */
    private resolve(obj: TranslationData, key: string): string | undefined {
        const parts = key.split('.');
        let current: unknown = obj;
        for (const part of parts) {
            if (current == null || typeof current !== 'object') return undefined;
            current = (current as Record<string, unknown>)[part];
        }
        return typeof current === 'string' ? current : undefined;
    }
}

export const i18n = new I18nService();
