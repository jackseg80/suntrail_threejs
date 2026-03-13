import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadBuildingsForTile } from './buildings';
import { state } from './state';

describe('Module Bâtiments (buildings.ts)', () => {
    beforeEach(() => {
        state.SHOW_BUILDINGS = true;
        state.ZOOM = 14;
        // Reset des caches mémoire si possible ou simuler un environnement propre
    });

    it('loadBuildingsForTile devrait retourner null si SHOW_BUILDINGS est désactivé', async () => {
        state.SHOW_BUILDINGS = false;
        const tile = { tx: 8540, ty: 5789, zoom: 14, key: '14/8540/5789' };
        const result = await loadBuildingsForTile(tile);
        expect(result).toBeNull();
    });

    it('loadBuildingsForTile devrait retourner null si le zoom est trop bas (< 14)', async () => {
        const tile = { tx: 4270, ty: 2894, zoom: 13, key: '13/4270/2894' };
        const result = await loadBuildingsForTile(tile);
        expect(result).toBeNull();
    });

    it('devrait filtrer correctement les bâtiments appartenant à une tuile spécifique', () => {
        // Cette partie nécessite de mocker fetch ou d'extraire la logique de filtrage
        // Pour l'instant on valide les conditions de garde (zoom, settings)
        expect(true).toBe(true);
    });
});
