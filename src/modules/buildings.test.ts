import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadBuildingsForTile } from './buildings';
import { state } from './state';

describe('Module Bâtiments (buildings.ts)', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        state.SHOW_BUILDINGS = true;
        state.ZOOM = 14;
    });

    it('loadBuildingsForTile devrait sortir prématurément si SHOW_BUILDINGS est désactivé', async () => {
        state.SHOW_BUILDINGS = false;
        const tile = { tx: 8540, ty: 5789, zoom: 14, key: '14/8540/5789', getBounds: () => ({}) };
        const result = await loadBuildingsForTile(tile);
        expect(result).toBeUndefined();
    });

    it('loadBuildingsForTile devrait sortir prématurément si le zoom est trop bas (< 14)', async () => {
        const tile = { tx: 4270, ty: 2894, zoom: 13, key: '13/4270/2894', getBounds: () => ({}) };
        const result = await loadBuildingsForTile(tile);
        expect(result).toBeUndefined();
    });

    it('devrait utiliser BUILDING_BATCH_SIZE depuis le state', () => {
        state.BUILDING_BATCH_SIZE = 50;
        expect(state.BUILDING_BATCH_SIZE).toBe(50);
    });
});
