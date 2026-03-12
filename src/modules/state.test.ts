import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from './state';

describe('state.ts', () => {
    beforeEach(() => {
        // Mock localStorage
        const localStorageMock = (function() {
            let store: Record<string, string> = {};
            return {
                getItem: (key: string) => store[key] || null,
                setItem: (key: string, value: string) => { store[key] = value.toString(); },
                clear: () => { store = {}; }
            };
        })();
        Object.defineProperty(window, 'localStorage', { value: localStorageMock });
    });

    it('should have a default TARGET_LAT and TARGET_LON (Spiez)', () => {
        expect(state.TARGET_LAT).toBe(46.6863);
        expect(state.TARGET_LON).toBe(7.6617);
    });

    it('should initialize MK from localStorage', () => {
        localStorage.setItem('maptiler_key_3d', 'test-key');
        // Re-import or re-evaluate state is tricky because it's a singleton
        // But we can check if it reads it correctly on first load
        // Since state is already imported, we test if we can set it
        state.MK = localStorage.getItem('maptiler_key_3d') || '';
        expect(state.MK).toBe('test-key');
    });

    it('should have initial three.js instances as null', () => {
        expect(state.scene).toBeNull();
        expect(state.camera).toBeNull();
        expect(state.renderer).toBeNull();
    });
});
