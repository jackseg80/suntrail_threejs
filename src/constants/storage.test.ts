import { describe, it, expect } from 'vitest';
import { STORAGE_KEYS } from './storage';

describe('STORAGE_KEYS', () => {
    it('has no duplicate values', () => {
        const values = Object.values(STORAGE_KEYS);
        const unique = new Set(values);
        expect(unique.size).toBe(values.length);
    });

    it('all keys use the suntrail_ prefix', () => {
        const values = Object.values(STORAGE_KEYS);
        for (const v of values) {
            expect(
                v.startsWith('suntrail_') ||
                    v.startsWith('rc_') ||
                    v === 'maptiler_key'
            ).toBe(true);
        }
    });

    it('contains all required keys', () => {
        expect(STORAGE_KEYS.SETTINGS).toBe('suntrail_settings');
        expect(STORAGE_KEYS.PRO).toBe('suntrail_pro');
        expect(STORAGE_KEYS.MAPTILER_KEY).toBe('maptiler_key');
        expect(STORAGE_KEYS.GPX_HISTORY).toBe('suntrail_gpx_history_v1');
        expect(STORAGE_KEYS.PACK_STATES).toBe('suntrail_pack_states');
        expect(STORAGE_KEYS.PACK_CATALOG).toBe('suntrail_pack_catalog');
    });
});
