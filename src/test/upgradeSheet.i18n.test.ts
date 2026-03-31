/**
 * upgradeSheet.i18n.test.ts — Vérifie que toutes les clés i18n de l'UpgradeSheet
 * existent dans les 4 fichiers de locale.
 */

import { describe, it, expect } from 'vitest';
import fr from '../i18n/locales/fr.json';
import en from '../i18n/locales/en.json';
import de from '../i18n/locales/de.json';
import it_ from '../i18n/locales/it.json';

const locales = { fr, en, de, it: it_ };

/** Resolve a dotted key in a nested object */
function resolve(obj: any, key: string): any {
    return key.split('.').reduce((acc, part) => acc?.[part], obj);
}

const UPGRADE_KEYS = [
    'upgrade.title',
    'upgrade.feature.maxDetail',
    'upgrade.feature.satellite',
    'upgrade.feature.buildings',
    'upgrade.feature.solarCalendar',
    'upgrade.feature.solarAnalysis',
    'upgrade.feature.weatherStation',
    'upgrade.feature.inclinometer',
    'upgrade.feature.multiGpx',
    'upgrade.feature.exportStats',
    'upgrade.feature.offlineZones',
    'upgrade.plan.monthly',
    'upgrade.plan.yearly',
    'upgrade.plan.lifetime',
    'upgrade.plan.perMonth',
    'upgrade.plan.perYear',
    'upgrade.plan.oneTime',
    'upgrade.plan.badge',
    'upgrade.restore',
    'upgrade.legal',
    'upgrade.toast.purchaseFailed',
    'upgrade.toast.restoring',
    'upgrade.toast.restored',
    'upgrade.toast.noRestore',
];

describe('UpgradeSheet i18n keys', () => {
    for (const [lang, data] of Object.entries(locales)) {
        describe(`locale: ${lang}`, () => {
            for (const key of UPGRADE_KEYS) {
                it(`has key "${key}"`, () => {
                    const value = resolve(data, key);
                    expect(value, `Missing key "${key}" in ${lang}.json`).toBeDefined();
                    expect(typeof value).toBe('string');
                    expect(value.length).toBeGreaterThan(0);
                });
            }
        });
    }
});
