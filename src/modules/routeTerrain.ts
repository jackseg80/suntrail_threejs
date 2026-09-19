import * as THREE from 'three';
import { state } from './state';
import { EARTH_CIRCUMFERENCE, getPow2, decodeTerrainRGB } from './geo';
import { loadTileData, cancelTileLoad } from './tileLoader';

/**
 * Relief dédié à l'analyse solaire du parcours.
 *
 * L'analyse solaire a besoin des altitudes CPU (`pixelData`) pour calculer les
 * ombres de relief. Ces pixels ne sont chargés que pour les tuiles visibles en
 * 3D : en 2D ou à LOD ≤ 10, aucune altitude n'est téléchargée et l'analyse
 * retombait sur « soleil par défaut ». Ce module précharge, à la demande et de
 * façon bornée, l'altitude le long du tracé, indépendamment de la vue.
 */

export interface RouteTerrainSampler {
    altitudeAt(worldX: number, worldZ: number): number | null;
    readonly lod: number;
    readonly tileCount: number;
}

const CANDIDATE_LODS = [14, 13, 12, 11, 10, 9, 8];
const MAX_TILES = 36; // tuiles (marge 1 comprise) avant de descendre d'un LOD
const MAX_CONCURRENT = 2;
const CACHE_MAX_TILES = 96;
const GRID = 128; // grille stockée (sous-échantillonnée depuis 256)
const MAX_INT16 = 32767;
const MIN_INT16 = -32768;

interface CachedTile {
    data: Int16Array;
}

const tileCache = new Map<string, CachedTile>();

function cacheGet(key: string): CachedTile | undefined {
    const value = tileCache.get(key);
    if (value) {
        // LRU : replacer en fin d'ordre d'insertion
        tileCache.delete(key);
        tileCache.set(key, value);
    }
    return value;
}

function cacheSet(key: string, value: CachedTile): void {
    tileCache.set(key, value);
    while (tileCache.size > CACHE_MAX_TILES) {
        const oldest = tileCache.keys().next().value;
        if (oldest === undefined) break;
        tileCache.delete(oldest);
    }
}

export function clearRouteTerrainCache(): void {
    tileCache.clear();
}

export function isRouteTerrainPrefetchEnabled(): boolean {
    return state.PERFORMANCE_PRESET !== 'eco' && state.RESOLUTION > 2;
}

function originNorm(): { ox: number; oy: number } {
    const origin = state.originTile;
    const unit = 1.0 / getPow2(origin.z);
    return {
        ox: (origin.x + 0.5) * unit,
        oy: (origin.y + 0.5) * unit,
    };
}

function worldToTile(
    worldX: number,
    worldZ: number,
    lod: number,
    ox: number,
    oy: number
): { tx: number; ty: number } {
    const n = getPow2(lod);
    const xNorm = worldX / EARTH_CIRCUMFERENCE + ox;
    const yNorm = worldZ / EARTH_CIRCUMFERENCE + oy;
    return { tx: Math.floor(xNorm * n), ty: Math.floor(yNorm * n) };
}

/**
 * Choisit le LOD d'altitude le plus fin qui garde la couverture du tracé sous
 * le plafond de tuiles, et renvoie la liste des tuiles (marge d'une tuile pour
 * les reliefs qui projettent de l'ombre).
 */
export function routeTerrainLodsForPoints(
    points: THREE.Vector3[],
    originTile: { x: number; y: number; z: number },
    maxTiles = MAX_TILES
): { lod: number; tiles: Array<{ tx: number; ty: number }> } {
    const unit = 1.0 / getPow2(originTile.z);
    const ox = (originTile.x + 0.5) * unit;
    const oy = (originTile.y + 0.5) * unit;

    const boundsFor = (lod: number) => {
        let minTx = Infinity;
        let maxTx = -Infinity;
        let minTy = Infinity;
        let maxTy = -Infinity;
        for (const p of points) {
            const { tx, ty } = worldToTile(p.x, p.z, lod, ox, oy);
            if (tx < minTx) minTx = tx;
            if (tx > maxTx) maxTx = tx;
            if (ty < minTy) minTy = ty;
            if (ty > maxTy) maxTy = ty;
        }
        return {
            minTx: minTx - 1,
            maxTx: maxTx + 1,
            minTy: minTy - 1,
            maxTy: maxTy + 1,
        };
    };

    const build = (lod: number, b: ReturnType<typeof boundsFor>) => {
        const n = getPow2(lod);
        const tiles: Array<{ tx: number; ty: number }> = [];
        for (let ty = b.minTy; ty <= b.maxTy; ty++) {
            for (let tx = b.minTx; tx <= b.maxTx; tx++) {
                if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
                tiles.push({ tx, ty });
            }
        }
        return { lod, tiles };
    };

    let coarsest = {
        lod: CANDIDATE_LODS[CANDIDATE_LODS.length - 1],
        bounds: boundsFor(CANDIDATE_LODS[CANDIDATE_LODS.length - 1]),
    };
    for (const lod of CANDIDATE_LODS) {
        const b = boundsFor(lod);
        if (!Number.isFinite(b.minTx)) return { lod, tiles: [] };
        const count = (b.maxTx - b.minTx + 1) * (b.maxTy - b.minTy + 1);
        if (count <= maxTiles) return build(lod, b);
        coarsest = { lod, bounds: b };
    }
    return build(coarsest.lod, coarsest.bounds);
}

function buildGrid(pixelData: ArrayBuffer): Int16Array {
    const src = new Uint8Array(pixelData);
    const srcRes = Math.max(1, Math.round(Math.sqrt(src.length / 4)));
    const grid = new Int16Array(GRID * GRID);
    const factor = srcRes / GRID;
    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            const sx = Math.min(srcRes - 1, Math.floor(gx * factor));
            const sy = Math.min(srcRes - 1, Math.floor(gy * factor));
            const i = (sy * srcRes + sx) * 4;
            // L'analyse solaire travaille sur l'altitude physique. Le facteur
            // d'exagération ne concerne que le rendu 3D et fausserait ici
            // l'horizon (notamment lorsque le soleil est bas).
            const value = decodeTerrainRGB(src[i], src[i + 1], src[i + 2], 1);
            grid[gy * GRID + gx] = Math.max(
                MIN_INT16,
                Math.min(MAX_INT16, Math.round(value))
            );
        }
    }
    return grid;
}

/** Échantillonnage bilinéaire d'une grille carrée (exporté pour les tests). */
export function bilinearSample(
    data: Int16Array,
    relX: number,
    relY: number
): number {
    const res = Math.max(1, Math.round(Math.sqrt(data.length)));
    const fx = Math.max(0, Math.min(res - 1, relX * (res - 1)));
    const fy = Math.max(0, Math.min(res - 1, relY * (res - 1)));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, res - 1);
    const y1 = Math.min(y0 + 1, res - 1);
    const dx = fx - x0;
    const dy = fy - y0;
    const h00 = data[y0 * res + x0];
    const h10 = data[y0 * res + x1];
    const h01 = data[y1 * res + x0];
    const h11 = data[y1 * res + x1];
    return (
        h00 * (1 - dx) * (1 - dy) +
        h10 * dx * (1 - dy) +
        h01 * (1 - dx) * dy +
        h11 * dx * dy
    );
}

function createSampler(lod: number, tileCount: number): RouteTerrainSampler {
    const n = getPow2(lod);
    return {
        lod,
        tileCount,
        altitudeAt(worldX: number, worldZ: number): number | null {
            const { ox, oy } = originNorm();
            const xNorm = worldX / EARTH_CIRCUMFERENCE + ox;
            const yNorm = worldZ / EARTH_CIRCUMFERENCE + oy;
            const tx = Math.floor(xNorm * n);
            const ty = Math.floor(yNorm * n);
            const cached = cacheGet(`${lod}_${tx}_${ty}`);
            if (!cached) return null;
            const relX = xNorm * n - tx;
            const relY = yNorm * n - ty;
            return bilinearSample(cached.data, relX, relY);
        },
    };
}

/**
 * Précharge l'altitude le long du tracé puis renvoie un sampler.
 * Renvoie `null` lorsque le préchargement est désactivé (eco) ou impossible.
 */
export async function prefetchRouteTerrain(
    points: THREE.Vector3[],
    signal?: AbortSignal
): Promise<RouteTerrainSampler | null> {
    if (!isRouteTerrainPrefetchEnabled() || !state.originTile) return null;
    if (points.length === 0) return null;

    const { lod, tiles } = routeTerrainLodsForPoints(points, state.originTile);
    if (tiles.length === 0) return null;

    let loaded = 0;
    let index = 0;

    const loadOne = async (): Promise<void> => {
        while (!signal?.aborted) {
            const i = index++;
            if (i >= tiles.length) return;
            const { tx, ty } = tiles[i];
            const key = `${lod}_${tx}_${ty}`;
            if (cacheGet(key)) continue;

            let taskId: number | null = null;
            try {
                const { promise, taskId: id } = await loadTileData(
                    tx,
                    ty,
                    lod,
                    false, // forcer l'altitude même en 2D
                    null,
                    true // pas de couleur : altitude seule
                );
                taskId = id;
                if (signal?.aborted) {
                    cancelTileLoad(taskId);
                    return;
                }
                const response = await promise;
                if (signal?.aborted) return;
                if (response?.pixelData) {
                    cacheSet(key, { data: buildGrid(response.pixelData) });
                    loaded++;
                }
            } catch {
                // Tuile manquante (hors ligne, clé absente) : couverture partielle
            } finally {
                if (signal?.aborted && taskId !== null) cancelTileLoad(taskId);
            }
        }
    };

    await Promise.all(
        Array.from({ length: Math.min(MAX_CONCURRENT, tiles.length) }, loadOne)
    );

    return createSampler(lod, loaded);
}
