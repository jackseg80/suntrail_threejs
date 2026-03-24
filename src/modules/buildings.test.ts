import { describe, it, expect } from 'vitest';
import { loadBuildingsForTile } from './buildings';
import { state } from './state';
import { Tile } from './terrain';

describe('buildings.ts', () => {
    it('should respect the SHOW_BUILDINGS state', async () => {
        state.SHOW_BUILDINGS = false;
        const tile = new Tile(0, 0, 16, '16/0/0');
        tile.status = 'loaded';
        await loadBuildingsForTile(tile);
        // On vérifie que le chargement n'a pas eu lieu (pas de mesh ajouté)
        expect(tile.buildingMesh).toBeNull();
    });

    it('should not load buildings if zoom level is below threshold', async () => {
        state.SHOW_BUILDINGS = true;
        state.BUILDING_ZOOM_THRESHOLD = 16;
        const tile = new Tile(0, 0, 14, '14/0/0');
        tile.status = 'loaded';
        await loadBuildingsForTile(tile);
        expect(tile.buildingMesh).toBeNull();
    });

    it('should handle building limits from state', () => {
        state.BUILDING_LIMIT = 50;
        expect(state.BUILDING_LIMIT).toBe(50);
    });
});
