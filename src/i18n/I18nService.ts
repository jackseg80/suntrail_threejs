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
        this.currentLocale = (state.lang as Locale) || 'fr';
        this.translations = allTranslations[this.currentLocale] || allTranslations.fr;
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
