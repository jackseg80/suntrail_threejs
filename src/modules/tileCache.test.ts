import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { state } from './state';
import { addToCache, getFromCache, disposeAllCachedTiles, getCacheSize, hasInCache } from './tileCache';

// Mock de utils pour isMobileDevice
vi.mock('./utils', () => ({
    isMobileDevice: vi.fn(() => false),
    showToast: vi.fn(),
    isPositionInSwitzerland: vi.fn(),
    isPositionInFrance: vi.fn()
}));

describe('tileCache.ts', () => {
    beforeEach(() => {
        disposeAllCachedTiles();
        state.PERFORMANCE_PRESET = 'balanced';
    });

    it('should add and retrieve items from cache', () => {
        const elev = new THREE.Texture();
        const color = new THREE.Texture();
        addToCache('test_key', elev, null, color, null);

        expect(hasInCache('test_key')).toBe(true);
        const cached = getFromCache('test_key');
        expect(cached).not.toBeNull();
        expect(cached?.elev).toBe(elev);
        expect(cached?.color).toBe(color);
    });

    it('should respect maximum cache size (FIFO)', () => {
        // En mode balanced (non-mobile), la taille est 250.
        // On va forcer un mode avec une taille plus petite pour le test si possible, 
        // ou simplement tester la logique de débordement.
        
        state.PERFORMANCE_PRESET = 'eco'; // Taille 60
        
        for (let i = 0; i < 70; i++) {
            addToCache(`key_${i}`, new THREE.Texture(), null, new THREE.Texture(), null);
        }

        expect(getCacheSize()).toBe(60);
        expect(hasInCache('key_0')).toBe(false); // Le premier a dû être supprimé
        expect(hasInCache('key_69')).toBe(true); // Le dernier doit être là
    });

    it('should dispose textures when cleared', () => {
        const elev = new THREE.Texture();
        const spy = vi.spyOn(elev, 'dispose');
        addToCache('test', elev, null, new THREE.Texture(), null);
        
        disposeAllCachedTiles();
        
        expect(spy).toHaveBeenCalled();
        expect(getCacheSize()).toBe(0);
    });

    it('should move accessed item to the end of FIFO queue', () => {
        state.PERFORMANCE_PRESET = 'eco'; // Taille 60
        
        // Remplir 60 items
        for (let i = 0; i < 60; i++) {
            addToCache(`key_${i}`, new THREE.Texture(), null, new THREE.Texture(), null);
        }
        
        // Accéder au premier item (key_0) pour le "rafraîchir"
        getFromCache('key_0');
        
        // Ajouter un 61ème item
        addToCache('key_new', new THREE.Texture(), null, new THREE.Texture(), null);
        
        // key_1 devrait être supprimé au lieu de key_0
        expect(hasInCache('key_1')).toBe(false);
        expect(hasInCache('key_0')).toBe(true);
    });
});
