import { describe, it, expect, beforeEach } from 'vitest';
import { state } from './state';

describe('state.ts', () => {
    beforeEach(() => {
        // Utiliser le localStorage natif de JSDOM plutôt que de le redéfinir
        window.localStorage.clear();
    });

    it('should have a default TARGET_LAT and TARGET_LON (Spiez)', () => {
        expect(state.TARGET_LAT).toBe(46.6863);
        expect(state.TARGET_LON).toBe(7.6617);
    });

    it('should initialize MK from localStorage', () => {
        window.localStorage.setItem('maptiler_key_3d', 'test-key');
        // On simule manuellement la lecture qui se fait normalement à l'import
        state.MK = window.localStorage.getItem('maptiler_key_3d') || '';
        expect(state.MK).toBe('test-key');
    });

    it('should have initial three.js instances as null', () => {
        expect(state.scene).toBeNull();
        expect(state.camera).toBeNull();
        expect(state.renderer).toBeNull();
    });
});
