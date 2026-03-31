/**
 * tileSpatialIndex.ts — Grid-based spatial index for fast tile lookup.
 * Replaces O(n) iteration over activeTiles with O(1) average-case lookups.
 *
 * At low zoom (LOD 6-10), tiles are enormous (600km+) — they go into a
 * separate `largeTiles` set scanned linearly (few tiles, no grid explosion).
 */

const CELL_SIZE = 2000; // metres — covers typical tile sizes at LOD 14+
const MAX_CELLS_PER_DIM = 8; // tiles spanning more cells go to largeTiles

interface SpatialTile {
    worldX: number;
    worldZ: number;
    tileSizeMeters: number;
    key: string;
    status: string;
    zoom: number;
    bounds?: { containsPoint(p: { x: number; y: number; z: number }): boolean };
    pixelData: Uint8ClampedArray | null;
    [k: string]: any;
}

function cellKey(x: number, z: number): string {
    return `${Math.floor(x / CELL_SIZE)},${Math.floor(z / CELL_SIZE)}`;
}

const grid = new Map<string, Set<SpatialTile>>();
const tileCells = new Map<string, string[]>(); // tile.key -> list of cell keys
const largeTiles = new Set<SpatialTile>(); // tiles too large for the grid

export function insertTile(tile: SpatialTile): void {
    const half = tile.tileSizeMeters / 2;
    const minCX = Math.floor((tile.worldX - half) / CELL_SIZE);
    const maxCX = Math.floor((tile.worldX + half) / CELL_SIZE);
    const minCZ = Math.floor((tile.worldZ - half) / CELL_SIZE);
    const maxCZ = Math.floor((tile.worldZ + half) / CELL_SIZE);

    // Guard: tiles spanning too many cells (low zoom) go to largeTiles
    if ((maxCX - minCX) > MAX_CELLS_PER_DIM || (maxCZ - minCZ) > MAX_CELLS_PER_DIM) {
        largeTiles.add(tile);
        tileCells.set(tile.key, []); // empty = marker for largeTiles
        return;
    }

    const cells: string[] = [];
    for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cz = minCZ; cz <= maxCZ; cz++) {
            const ck = `${cx},${cz}`;
            let set = grid.get(ck);
            if (!set) { set = new Set(); grid.set(ck, set); }
            set.add(tile);
            cells.push(ck);
        }
    }
    tileCells.set(tile.key, cells);
}

export function removeTile(tile: SpatialTile): void {
    // Try largeTiles first
    if (largeTiles.delete(tile)) {
        tileCells.delete(tile.key);
        return;
    }
    const cells = tileCells.get(tile.key);
    if (cells) {
        for (const ck of cells) {
            const set = grid.get(ck);
            if (set) {
                set.delete(tile);
                if (set.size === 0) grid.delete(ck);
            }
        }
        tileCells.delete(tile.key);
    }
}

export function queryTiles(worldX: number, worldZ: number): SpatialTile[] {
    const ck = cellKey(worldX, worldZ);
    const set = grid.get(ck);
    const results = set ? Array.from(set) : [];
    // Also include large tiles (few, linear scan OK)
    for (const t of largeTiles) results.push(t);
    return results;
}

export function clearIndex(): void {
    grid.clear();
    tileCells.clear();
    largeTiles.clear();
}

/** Exposed for testing */
export { CELL_SIZE };
