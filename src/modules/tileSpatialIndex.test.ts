import { describe, it, expect, beforeEach } from 'vitest';
import { insertTile, removeTile, queryTiles, clearIndex, CELL_SIZE } from './tileSpatialIndex';

function makeTile(worldX: number, worldZ: number, tileSizeMeters: number, key: string, zoom = 14) {
    return {
        worldX, worldZ, tileSizeMeters, key, zoom,
        status: 'loaded',
        pixelData: new Uint8ClampedArray(4),
        bounds: {
            containsPoint(p: { x: number; y: number; z: number }) {
                const half = tileSizeMeters / 2;
                return p.x >= worldX - half && p.x <= worldX + half &&
                       p.z >= worldZ - half && p.z <= worldZ + half;
            }
        }
    };
}

describe('tileSpatialIndex', () => {
    beforeEach(() => {
        clearIndex();
    });

    it('should find an inserted tile by position', () => {
        const tile = makeTile(1000, 1000, 2000, 'tile1');
        insertTile(tile);

        const results = queryTiles(1000, 1000);
        expect(results).toContain(tile);
    });

    it('should not find a tile at a distant position', () => {
        const tile = makeTile(1000, 1000, 2000, 'tile1');
        insertTile(tile);

        const results = queryTiles(50000, 50000);
        expect(results).not.toContain(tile);
    });

    it('should remove a tile from the index', () => {
        const tile = makeTile(1000, 1000, 2000, 'tile1');
        insertTile(tile);
        removeTile(tile);

        const results = queryTiles(1000, 1000);
        expect(results).not.toContain(tile);
    });

    it('should handle multiple tiles in the same cell', () => {
        const tile1 = makeTile(500, 500, 1000, 'tile1', 14);
        const tile2 = makeTile(600, 600, 1000, 'tile2', 15);
        insertTile(tile1);
        insertTile(tile2);

        const results = queryTiles(550, 550);
        expect(results).toContain(tile1);
        expect(results).toContain(tile2);
    });

    it('should handle tiles spanning multiple cells', () => {
        // Large tile that spans many cells
        const tile = makeTile(0, 0, CELL_SIZE * 4, 'big-tile');
        insertTile(tile);

        // Query at tile edge
        const results = queryTiles(CELL_SIZE * 1.5, 0);
        expect(results).toContain(tile);
    });

    it('should return empty array for empty index', () => {
        const results = queryTiles(0, 0);
        expect(results).toEqual([]);
    });

    it('should clear all tiles', () => {
        insertTile(makeTile(0, 0, 2000, 'tile1'));
        insertTile(makeTile(5000, 5000, 2000, 'tile2'));
        clearIndex();

        expect(queryTiles(0, 0)).toEqual([]);
        expect(queryTiles(5000, 5000)).toEqual([]);
    });

    it('should handle very large tiles (low zoom) without grid explosion', () => {
        // At zoom 6, tileSizeMeters ≈ 626,000m — would create 313×313 cells without guard
        const hugeTile = makeTile(0, 0, 626000, 'zoom6-tile', 6);
        insertTile(hugeTile);

        // Should be found via largeTiles linear scan
        const results = queryTiles(0, 0);
        expect(results).toContain(hugeTile);

        // Remove works
        removeTile(hugeTile);
        const after = queryTiles(0, 0);
        expect(after).not.toContain(hugeTile);
    });

    it('should prefer higher zoom tile when both are returned', () => {
        const tile14 = makeTile(1000, 1000, 2500, 'tile14', 14);
        const tile16 = makeTile(1000, 1000, 600, 'tile16', 16);
        insertTile(tile14);
        insertTile(tile16);

        const results = queryTiles(1000, 1000);
        // Both should be returned — caller selects by zoom
        expect(results.length).toBeGreaterThanOrEqual(1);
        const best = results.reduce((a, b) => a.zoom > b.zoom ? a : b);
        expect(best.zoom).toBe(16);
    });
});
