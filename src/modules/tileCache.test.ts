import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { state } from './state';
import { addToCache, getFromCache, disposeAllCachedTiles, getCacheSize, hasInCache, trimCache, markCacheKeyActive, markCacheKeyInactive, purgeOldPixelData } from './tileCache';

// Mock de utils pour isMobileDevice
vi.mock('./utils', () => ({
    isMobileDevice: vi.fn(() => false),
    showToast: vi.fn()
}));

// Mock de geo
vi.mock('./geo', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./geo')>();
    return {
        ...actual,
        isPositionInSwitzerland: vi.fn(),
        isPositionInFrance: vi.fn()
    };
});

describe('tileCache.ts', () => {
    beforeEach(() => {
        disposeAllCachedTiles();
        state.PERFORMANCE_PRESET = 'balanced';
    });

    it('should add and retrieve items from cache', () => {
        const elev = new THREE.Texture();
        const color = new THREE.Texture();
        addToCache('test_key', elev, null, color, null, null);

        expect(hasInCache('test_key')).toBe(true);
        const cached = getFromCache('test_key');
        expect(cached).not.toBeNull();
        expect(cached?.elev).toBe(elev);
        expect(cached?.color).toBe(color);
    });

    it('should respect maximum cache size (FIFO)', () => {
        // En mode eco, la taille est 80 (v5.32.0 : increased for LOD retention).
        state.PERFORMANCE_PRESET = 'eco';
        
        for (let i = 0; i < 90; i++) {
            addToCache(`key_${i}`, new THREE.Texture(), null, new THREE.Texture(), null, null);
        }

        expect(getCacheSize()).toBe(80);
        expect(hasInCache('key_0')).toBe(false); // Le premier a dû être supprimé
        expect(hasInCache('key_89')).toBe(true); // Le dernier doit être là
    });

    it('should dispose textures when cleared', () => {
        const elev = new THREE.Texture();
        const color = new THREE.Texture();
        const spyElev = vi.spyOn(elev, 'dispose');
        const spyColor = vi.spyOn(color, 'dispose');
        addToCache('test', elev, null, color, null, null);
        
        disposeAllCachedTiles();
        
        expect(spyElev).toHaveBeenCalled();
        expect(spyColor).toHaveBeenCalled();
        expect(getCacheSize()).toBe(0);
    });

    it('trimCache() réduit le cache à la taille max du preset actuel', () => {
        state.PERFORMANCE_PRESET = 'eco'; // max = 80
        // Remplir au-delà via état précédent (simuler changement de preset)
        state.PERFORMANCE_PRESET = 'performance'; // max = 500 (desktop)
        for (let i = 0; i < 120; i++) {
            addToCache(`perf_${i}`, new THREE.Texture(), null, new THREE.Texture(), null, null);
        }
        expect(getCacheSize()).toBe(120);

        // Changer vers eco : max devient 80, trim doit purger les 40 plus anciens
        state.PERFORMANCE_PRESET = 'eco';
        trimCache();
        expect(getCacheSize()).toBe(80);
        expect(hasInCache('perf_0')).toBe(false);  // évincés
        expect(hasInCache('perf_99')).toBe(true);  // conservés
    });

    it('trimCache() ne fait rien si cache déjà dans la limite', () => {
        state.PERFORMANCE_PRESET = 'eco'; // max = 60
        for (let i = 0; i < 30; i++) {
            addToCache(`key_${i}`, new THREE.Texture(), null, new THREE.Texture(), null, null);
        }
        trimCache();
        expect(getCacheSize()).toBe(30); // pas de changement
    });

    describe('markCacheKeyActive / markCacheKeyInactive (v5.11.1)', () => {
        it('tuile active protégée contre l\'éviction FIFO', () => {
            state.PERFORMANCE_PRESET = 'eco'; // max = 80

            for (let i = 0; i < 80; i++) {
                addToCache(`key_${i}`, new THREE.Texture(), null, new THREE.Texture(), null, null);
            }

            // Marquer key_0 comme active (rendue en scène)
            markCacheKeyActive('key_0');

            // Ajouter un 81ème item → devrait évincer key_1, pas key_0
            addToCache('key_new', new THREE.Texture(), null, new THREE.Texture(), null, null);

            expect(hasInCache('key_0')).toBe(true);  // protégée
            expect(hasInCache('key_1')).toBe(false);  // évincée à la place
            expect(hasInCache('key_new')).toBe(true);

            markCacheKeyInactive('key_0'); // nettoyage
        });

        it('tuile inactive peut être évincée normalement', () => {
            state.PERFORMANCE_PRESET = 'eco';

            for (let i = 0; i < 80; i++) {
                addToCache(`key_${i}`, new THREE.Texture(), null, new THREE.Texture(), null, null);
            }

            // Marquer puis démarquer key_0
            markCacheKeyActive('key_0');
            markCacheKeyInactive('key_0');

            // key_0 est la plus ancienne et n'est plus active → doit être évincée
            addToCache('key_new', new THREE.Texture(), null, new THREE.Texture(), null, null);

            expect(hasInCache('key_0')).toBe(false); // évincée normalement
            expect(hasInCache('key_new')).toBe(true);
        });

        it('trimCache respecte les tuiles actives', () => {
            state.PERFORMANCE_PRESET = 'performance'; // max = 500 desktop

            for (let i = 0; i < 120; i++) {
                addToCache(`key_${i}`, new THREE.Texture(), null, new THREE.Texture(), null, null);
            }

            // Marquer les 5 premières clés comme actives
            for (let i = 0; i < 5; i++) markCacheKeyActive(`key_${i}`);

            // Réduire vers eco (max = 80) → doit évincer les inactives d'abord
            state.PERFORMANCE_PRESET = 'eco';
            trimCache();

            expect(getCacheSize()).toBe(80);
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
            addToCache('victim', victimElev, null, victimColor, null, null);
            for (let i = 1; i < 80; i++) {
                addToCache(`key_${i}`, new THREE.Texture(), null, new THREE.Texture(), null, null);
            }

            // Ajouter un 81ème → 'victim' (la plus ancienne, inactive) est évincée
            addToCache('trigger', new THREE.Texture(), null, new THREE.Texture(), null, null);

            expect(hasInCache('victim')).toBe(false);
            expect(spyElev).toHaveBeenCalled();
            expect(spyColor).toHaveBeenCalled();
        });
    });

    it('should move accessed item to the end of FIFO queue', () => {
        state.PERFORMANCE_PRESET = 'eco'; // Taille 80 (v5.32.0)
        
        // Remplir 80 items
        for (let i = 0; i < 80; i++) {
            addToCache(`key_${i}`, new THREE.Texture(), null, new THREE.Texture(), null, null);
        }
        
        // Accéder au premier item (key_0) pour le "rafraîchir"
        getFromCache('key_0');
        
        // Ajouter un 81ème item
        addToCache('key_new', new THREE.Texture(), null, new THREE.Texture(), null, null);
        
        // key_1 devrait être supprimé au lieu de key_0
        expect(hasInCache('key_1')).toBe(false);
        expect(hasInCache('key_0')).toBe(true);
    });

    describe('purgeOldPixelData (v5.32.0)', () => {
        it('devrait purger les pixelData les plus anciens et garder les plus récents (LRU)', () => {
            state.PERFORMANCE_PRESET = 'eco'; // Budget pixelData = 10
            state.ZOOM = 14;

            const dummyTexture = new THREE.Texture();
            const dummyData = new Uint8ClampedArray(10);

            // Ajouter 15 tuiles. Budget est de 10.
            // On inclut _z14_ dans la clé pour simuler le zoom actuel.
            for (let i = 0; i < 15; i++) {
                addToCache(`key_z14_tile_${i}`, dummyTexture, dummyData.slice(), dummyTexture, null, null);
            }

            purgeOldPixelData();

            // Vérifier que les 10 plus RÉCENTS (5 à 14) ont encore leurs pixelData
            let keptOld = 0;
            for (let i = 0; i < 5; i++) {
                if (getFromCache(`key_z14_tile_${i}`)?.pixelData) keptOld++;
            }

            let keptNew = 0;
            for (let i = 10; i < 15; i++) {
                if (getFromCache(`key_z14_tile_${i}`)?.pixelData) keptNew++;
            }

            expect(keptNew).toBe(5);
            expect(keptOld).toBe(0);
        });

        it('devrait respecter l\'immunité des tuiles parents (z-1)', () => {
            state.PERFORMANCE_PRESET = 'eco'; // Budget global = 10, Budget parent = 5
            state.ZOOM = 14;

            const dummyTexture = new THREE.Texture();
            const dummyData = new Uint8ClampedArray(10);

            // 1. Ajouter 5 tuiles parents (z=13)
            for (let i = 0; i < 5; i++) {
                addToCache(`key_z13_parent_${i}`, dummyTexture, dummyData.slice(), dummyTexture, null, null);
            }

            // 2. Ajouter 15 tuiles normales (z=14). Budget global=10.
            for (let i = 0; i < 15; i++) {
                addToCache(`key_z14_normal_${i}`, dummyTexture, dummyData.slice(), dummyTexture, null, null);
            }

            purgeOldPixelData();

            // Les 5 parents devraient avoir survécu
            for (let i = 0; i < 5; i++) {
                expect(getFromCache(`key_z13_parent_${i}`)?.pixelData).not.toBeNull();
            }

            // Les 10 normales les plus récentes (5-14) devraient avoir survécu
            for (let i = 5; i < 15; i++) {
                expect(getFromCache(`key_z14_normal_${i}`)?.pixelData).not.toBeNull();
            }
            // Les 5 normales les plus anciennes (0-4) devraient être purgées
            for (let i = 0; i < 5; i++) {
                expect(getFromCache(`key_z14_normal_${i}`)?.pixelData).toBeNull();
            }
        });
    });
});
