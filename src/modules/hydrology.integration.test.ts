import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { loadHydrologyForTile } from './hydrology';
import { state } from './state';
import { Tile } from './terrain';
import { fetchLandcoverPBF } from './landcover';

vi.mock('./analysis', () => ({
    getAltitudeAt: vi.fn(() => 1000),
}));

vi.mock('./landcover', () => ({
    fetchLandcoverPBF: vi.fn(),
}));

vi.mock('./geo', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./geo')>();
    return {
        ...actual,
        isPositionInSwitzerland: vi.fn(() => true),
        decodeTerrainRGB: vi.fn(() => 0),
        getTileBounds: vi.fn(() => ({
            north: 90,
            south: -90,
            east: 180,
            west: -180,
        })),
    };
});

function makeTile(zoom = 14): Tile {
    const tile = new Tile(0, 0, zoom, `${zoom}/0/0`);
    tile.mesh = new THREE.Mesh();
    tile.status = 'loaded';
    tile.lngLatToLocal = vi.fn().mockReturnValue({ x: 10, z: 10 });
    tile.worldX = 1000;
    tile.worldZ = 1000;
    return tile;
}

function mockWaterFeature() {
    (fetchLandcoverPBF as any).mockResolvedValue({
        forests: [],
        water: [
            {
                type: 3,
                geometry: [
                    [
                        { x: 1000, y: 1000 },
                        { x: 2000, y: 1000 },
                        { x: 2000, y: 2000 },
                        { x: 1000, y: 2000 },
                        { x: 1000, y: 1000 },
                    ],
                ],
                extent: 4096,
                bbox: { minX: 1000, maxX: 2000, minY: 1000, maxY: 2000 },
                properties: { class: 'lake' },
            },
        ],
    });
}

describe('Hydrology Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.SHOW_HYDROLOGY = true;
        state.isUserInteracting = false;
        state.originTile = { x: 0, y: 0, z: 0 };
    });

    it('should load hydrology from PBF and add it to tile', async () => {
        const tile = makeTile();
        mockWaterFeature();

        await loadHydrologyForTile(tile);

        expect(fetchLandcoverPBF).toHaveBeenCalled();
        expect(tile.waterMaskTex).toBeDefined();
        expect(tile.waterMaskTex).not.toBeNull();
    });

    it('should skip when SHOW_HYDROLOGY is false', async () => {
        state.SHOW_HYDROLOGY = false;
        const tile = makeTile();
        await loadHydrologyForTile(tile);
        expect(fetchLandcoverPBF).not.toHaveBeenCalled();
    });

    it('should skip when zoom is below 14', async () => {
        const tile = makeTile(13);
        await loadHydrologyForTile(tile);
        expect(fetchLandcoverPBF).not.toHaveBeenCalled();
    });

    it('should skip when tile is disposed', async () => {
        const tile = makeTile();
        tile.status = 'disposed';
        await loadHydrologyForTile(tile);
        expect(fetchLandcoverPBF).not.toHaveBeenCalled();
    });

    it('should skip when waterMaskTex is already present', async () => {
        const tile = makeTile();
        tile.waterMaskTex = new THREE.Texture();
        await loadHydrologyForTile(tile);
        expect(fetchLandcoverPBF).not.toHaveBeenCalled();
    });

    it('should skip when PBF returns no water features', async () => {
        const tile = makeTile();
        (fetchLandcoverPBF as any).mockResolvedValue({
            forests: [],
            water: [],
        });
        await loadHydrologyForTile(tile);
        expect(fetchLandcoverPBF).toHaveBeenCalled();
        expect(tile.waterMaskTex).toBeNull();
    });

    it('should skip when PBF returns null', async () => {
        const tile = makeTile();
        (fetchLandcoverPBF as any).mockResolvedValue(null);
        await loadHydrologyForTile(tile);
        expect(fetchLandcoverPBF).toHaveBeenCalled();
        expect(tile.waterMaskTex).toBeNull();
    });
});
