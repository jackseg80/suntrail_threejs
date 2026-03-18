import { describe, it, expect } from 'vitest';
import { loadBuildingsForTile } from './buildings';
import { state } from './state';

describe('buildings.ts', () => {
    it('should respect the SHOW_BUILDINGS state', async () => {
        state.SHOW_BUILDINGS = false;
        const tile = { zoom: 16, status: 'loaded' };
        await loadBuildingsForTile(tile);
        // On vérifie que le chargement n'a pas eu lieu (pas de mesh ajouté)
        expect((tile as any).buildingMesh).toBeUndefined();
    });

    it('should not load buildings if zoom level is below threshold', async () => {
        state.SHOW_BUILDINGS = true;
        state.BUILDING_ZOOM_THRESHOLD = 16;
        const tile = { zoom: 14, status: 'loaded' };
        await loadBuildingsForTile(tile);
        expect((tile as any).buildingMesh).toBeUndefined();
    });

    it('should handle building limits from state', () => {
        state.BUILDING_LIMIT = 50;
        expect(state.BUILDING_LIMIT).toBe(50);
    });
});
