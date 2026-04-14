import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { state } from './state';
import { addToCache, getFromCache, disposeAllCachedTiles, getCacheSize, hasInCache, trimCache, markCacheKeyActive, markCacheKeyInactive } from './tileCache';

// Mock de utils pour isMobileDevice
vi.mock('./utils', () => ({
    isMobileDevice: vi.fn(() => false),
    showToast: vi.fn()
}));

// Mock de geo
vi.mock('./geo', () => ({
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
        // En mode eco, la taille est 60 (v5.11 : réduit de 80 → 60).
        state.PERFORMANCE_PRESET = 'eco';
        
        for (let i = 0; i < 70; i++) {
            addToCache(`key_${i}`, new THREE.Texture(), null, new THREE.Texture(), null);
        }

        expect(getCacheSize()).toBe(60);
        expect(hasInCache('key_0')).toBe(false); // Le premier a dû être supprimé
        expect(hasInCache('key_69')).toBe(true); // Le dernier doit être là
    });

    it('should dispose textures when cleared', () => {
        const elev = new THREE.Texture();
        const color = new THREE.Texture();
        const spyElev = vi.spyOn(elev, 'dispose');
        const spyColor = vi.spyOn(color, 'dispose');
        addToCache('test', elev, null, color, null);
        
        disposeAllCachedTiles();
        
        expect(spyElev).toHaveBeenCalled();
        expect(spyColor).toHaveBeenCalled();
        expect(getCacheSize()).toBe(0);
    });

    it('trimCache() réduit le cache à la taille max du preset actuel', () => {
        state.PERFORMANCE_PRESET = 'eco'; // max = 60
        // Remplir au-delà via état précédent (simuler changement de preset)
        state.PERFORMANCE_PRESET = 'performance'; // max = 400 (desktop)
        for (let i = 0; i < 100; i++) {
            addToCache(`perf_${i}`, new THREE.Texture(), null, new THREE.Texture(), null);
        }
        expect(getCacheSize()).toBe(100);

        // Changer vers eco : max devient 60, trim doit purger les 40 plus anciens
        state.PERFORMANCE_PRESET = 'eco';
        trimCache();
        expect(getCacheSize()).toBe(60);
        expect(hasInCache('perf_0')).toBe(false);  // évincés
        expect(hasInCache('perf_99')).toBe(true);  // conservés
    });

    it('trimCache() ne fait rien si cache déjà dans la limite', () => {
        state.PERFORMANCE_PRESET = 'eco'; // max = 60
        for (let i = 0; i < 30; i++) {
            addToCache(`key_${i}`, new THREE.Texture(), null, new THREE.Texture(), null);
        }
        trimCache();
        expect(getCacheSize()).toBe(30); // pas de changement
    });

    describe('markCacheKeyActive / markCacheKeyInactive (v5.11.1)', () => {
        it('tuile active protégée contre l\'éviction FIFO', () => {
            state.PERFORMANCE_PRESET = 'eco'; // max = 60

            for (let i = 0; i < 60; i++) {
                addToCache(`key_${i}`, new THREE.Texture(), null, new THREE.Texture(), null);
            }

            // Marquer key_0 comme active (rendue en scène)
            markCacheKeyActive('key_0');

            // Ajouter un 61ème item → devrait évincer key_1, pas key_0
            addToCache('key_new', new THREE.Texture(), null, new THREE.Texture(), null);

            expect(hasInCache('key_0')).toBe(true);  // protégée
            expect(hasInCache('key_1')).toBe(false);  // évincée à la place
            expect(hasInCache('key_new')).toBe(true);

            markCacheKeyInactive('key_0'); // nettoyage
        });

        it('tuile inactive peut être évincée normalement', () => {
            state.PERFORMANCE_PRESET = 'eco';

            for (let i = 0; i < 60; i++) {
                addToCache(`key_${i}`, new THREE.Texture(), null, new THREE.Texture(), null);
            }

            // Marquer puis démarquer key_0
            markCacheKeyActive('key_0');
            markCacheKeyInactive('key_0');

            // key_0 est la plus ancienne et n'est plus active → doit être évincée
            addToCache('key_new', new THREE.Texture(), null, new THREE.Texture(), null);

            expect(hasInCache('key_0')).toBe(false); // évincée normalement
            expect(hasInCache('key_new')).toBe(true);
        });

        it('trimCache respecte les tuiles actives', () => {
            state.PERFORMANCE_PRESET = 'performance'; // max = 400 desktop

            for (let i = 0; i < 80; i++) {
                addToCache(`key_${i}`, new THREE.Texture(), null, new THREE.Texture(), null);
            }

            // Marquer les 5 premières clés comme actives
            for (let i = 0; i < 5; i++) markCacheKeyActive(`key_${i}`);

            // Réduire vers eco (max = 60) → doit évincer les inactives d'abord
            state.PERFORMANCE_PRESET = 'eco';
            trimCache();

            expect(getCacheSize()).toBe(60);
            // Les 5 clés actives doivent survivre
            for (let i = 0; i < 5; i++) {
                expect(hasInCache(`key_${i}`)).toBe(true);
            }

            // Nettoyage
            for (let i = 0; i < 5; i++) markCacheKeyInactive(`key_${i}`);
        });

        it('dispose() des textures appelé lors de l\'éviction d\'une inactive', () => {
            state.PERFORMANCE_PRESET = 'eco';

            const victimElev = new THREE.Texture();
            const victimColor = new THREE.Texture();
            const spyElev = vi.spyOn(victimElev, 'dispose');
            const spyColor = vi.spyOn(victimColor, 'dispose');

            // Remplir le cache avec la texture observable en premier
            addToCache('victim', victimElev, null, victimColor, null);
            for (let i = 1; i < 60; i++) {
                addToCache(`key_${i}`, new THREE.Texture(), null, new THREE.Texture(), null);
            }

            // Ajouter un 61ème → 'victim' (la plus ancienne, inactive) est évincée
            addToCache('trigger', new THREE.Texture(), null, new THREE.Texture(), null);

            expect(hasInCache('victim')).toBe(false);
            expect(spyElev).toHaveBeenCalled();
            expect(spyColor).toHaveBeenCalled();
        });
    });

    it('should move accessed item to the end of FIFO queue', () => {
        state.PERFORMANCE_PRESET = 'eco'; // Taille 60 (v5.11)
        
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
