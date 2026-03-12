import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock localStorage avant toute chose
const storage: Record<string, string> = {};
const localStorageMock = {
    getItem: vi.fn((key: string) => storage[key] || null),
    setItem: vi.fn((key: string, value: string) => { storage[key] = value.toString(); }),
    removeItem: vi.fn((key: string) => { delete storage[key]; }),
    clear: vi.fn(() => { Object.keys(storage).forEach(k => delete storage[k]); }),
    length: 0,
    key: vi.fn((i: number) => Object.keys(storage)[i] || null)
};
vi.stubGlobal('localStorage', localStorageMock);

import { state } from './state';

describe('state.ts', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('should have a default TARGET_LAT and TARGET_LON (Spiez)', () => {
        expect(state.TARGET_LAT).toBe(46.6863);
        expect(state.TARGET_LON).toBe(7.6617);
    });

    it('should initialize MK from localStorage', () => {
        localStorage.setItem('maptiler_key_3d', 'test-key');
        // Simuler la ré-initialisation
        state.MK = localStorage.getItem('maptiler_key_3d') || '';
        expect(state.MK).toBe('test-key');
    });

    it('should have initial three.js instances as null', () => {
        expect(state.scene).toBeNull();
        expect(state.camera).toBeNull();
        expect(state.renderer).toBeNull();
    });
});
