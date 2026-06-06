import * as THREE from 'three';
import { state } from './state';
import type { BBox } from './geo';
import { getPow2, getTileBounds, worldToLngLat } from './geo';
import type { VisibleTileRef } from './tileLoader';

const MAX_TILES_TOTAL = 2000;
const WARN_TILES = 500;
const WARN_TILES_HARD = 1000;
const ESTIMATE_KB_PER_TILE = 80;

export interface ZoneSelection {
    bbox: BBox;
    tilesByLod: Map<number, VisibleTileRef[]>;
    totalTiles: number;
    totalSizeMB: string;
    tooLarge: boolean;
    hardWarning: boolean;
    warning: boolean;
}

export function getVisibleTilesBBox(
    tiles: Map<string, { tx: number; ty: number; zoom: number }>
): BBox | null {
    let north = -Infinity;
    let south = Infinity;
    let east = -Infinity;
    let west = Infinity;

    for (const t of tiles.values()) {
        const bounds = getTileBounds(t);
        if (bounds.north > north) north = bounds.north;
        if (bounds.south < south) south = bounds.south;
        if (bounds.east > east) east = bounds.east;
        if (bounds.west < west) west = bounds.west;
    }

    if (!isFinite(north)) return null;
    return { minLat: south, maxLat: north, minLon: west, maxLon: east };
}

export function getViewportBBox(): BBox | null {
    const camera = state.camera;
    if (!camera) return null;

    const ndcCorners = [
        new THREE.Vector3(-1, -1, 0.5),
        new THREE.Vector3(1, -1, 0.5),
        new THREE.Vector3(1, 1, 0.5),
        new THREE.Vector3(-1, 1, 0.5),
    ];

    const origin = state.originTile;
    const baseY = state.controls?.target?.y ?? 0;

    const worldPoints: Array<{ lat: number; lon: number }> = [];

    for (const ndc of ndcCorners) {
        const vec = ndc.clone().unproject(camera);
        const dir = vec.sub(camera.position).normalize();
        const t = (baseY - camera.position.y) / dir.y;
        if (t > 0 && isFinite(t)) {
            const hit = camera.position.clone().addScaledVector(dir, t);
            const geo = worldToLngLat(hit.x, hit.z, origin);
            worldPoints.push(geo);
        }
    }

    if (worldPoints.length < 4) return null;

    let minLat = Infinity,
        maxLat = -Infinity,
        minLon = Infinity,
        maxLon = -Infinity;
    for (const p of worldPoints) {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lon < minLon) minLon = p.lon;
        if (p.lon > maxLon) maxLon = p.lon;
    }

    return { minLat, maxLat, minLon, maxLon };
}

function lngLatToTileExact(
    lon: number,
    lat: number,
    zoom: number
): { x: number; y: number } {
    const n = getPow2(zoom);
    const x = ((lon + 180) / 360) * n;
    const latRad = (lat * Math.PI) / 180;
    const y =
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
            2) *
        n;
    return { x, y };
}

function getTilesForBBox(bbox: BBox, zoom: number): VisibleTileRef[] {
    const n = getPow2(zoom);
    const topLeft = lngLatToTileExact(bbox.minLon, bbox.maxLat, zoom);
    const bottomRight = lngLatToTileExact(bbox.maxLon, bbox.minLat, zoom);

    const minTx = Math.max(0, Math.floor(topLeft.x));
    const maxTx = Math.min(n - 1, Math.floor(bottomRight.x));
    const minTy = Math.max(0, Math.floor(topLeft.y));
    const maxTy = Math.min(n - 1, Math.floor(bottomRight.y));

    const tiles: VisibleTileRef[] = [];
    for (let tx = minTx; tx <= maxTx; tx++) {
        for (let ty = minTy; ty <= maxTy; ty++) {
            tiles.push({ tx, ty, zoom });
        }
    }
    return tiles;
}

function estimateMultiLODSizeMB(totalTiles: number): string {
    const kb = totalTiles * ESTIMATE_KB_PER_TILE;
    return kb < 1024 ? `~${kb} Ko` : `~${(kb / 1024).toFixed(1)} Mo`;
}

export function computeZoneSelection(
    bbox: BBox,
    minLod: number,
    maxLod: number
): ZoneSelection {
    const tilesByLod = new Map<number, VisibleTileRef[]>();
    let totalTiles = 0;

    for (let lod = minLod; lod <= maxLod; lod++) {
        const tiles = getTilesForBBox(bbox, lod);
        tilesByLod.set(lod, tiles);
        totalTiles += tiles.length;
    }

    return {
        bbox,
        tilesByLod,
        totalTiles,
        totalSizeMB: estimateMultiLODSizeMB(totalTiles),
        tooLarge: totalTiles > MAX_TILES_TOTAL,
        hardWarning: totalTiles > WARN_TILES_HARD,
        warning: totalTiles > WARN_TILES,
    };
}
