import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { encodeElevationTile } from '../../scripts/pack-tile-encoding';
import {
    decodeTerrainRgb,
    maxVerticalSeamDifference,
    scanElevationRgba,
} from '../../scripts/pack-elevation-validation';

const limits = {
    minMeters: -500,
    maxMeters: 6_000,
    maxGradientMeters: 500,
    maxSeamMeters: 500,
};

function encodeHeight(heightMeters: number): [number, number, number, number] {
    const value = Math.round((heightMeters + 10_000) * 10);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff, 255];
}

describe('Terrain-RGB pack validation', () => {
    it('decode l’altitude Terrain-RGB attendue', () => {
        const [r, g, b] = encodeHeight(4_478);
        expect(decodeTerrainRgb(r, g, b)).toBeCloseTo(4_478, 5);
    });

    it('signale valeurs impossibles et gradients anormaux', () => {
        const rgba = new Uint8Array([
            ...encodeHeight(500),
            ...encodeHeight(501),
            ...encodeHeight(8_000),
            ...encodeHeight(502),
        ]);
        const scan = scanElevationRgba(rgba, 2, 2, limits);
        expect(scan.impossiblePixels).toBe(1);
        expect(scan.abnormalGradients).toBeGreaterThan(0);
        expect(scan.maxGradientMeters).toBeGreaterThan(7_000);
    });

    it('mesure une rupture entre deux tuiles voisines', () => {
        const left = new Uint8Array([
            ...encodeHeight(1_000),
            ...encodeHeight(1_000),
        ]);
        const right = new Uint8Array([
            ...encodeHeight(2_500),
            ...encodeHeight(2_500),
        ]);
        expect(maxVerticalSeamDifference(left, right, 1, 2)).toBeCloseTo(
            1_500,
            5
        );
    });

    it('préserve exactement les canaux RGB avec le WebP sans perte', async () => {
        const pixels = Buffer.from([
            ...encodeHeight(400).slice(0, 3),
            ...encodeHeight(1_500).slice(0, 3),
            ...encodeHeight(4_478).slice(0, 3),
            ...encodeHeight(250).slice(0, 3),
        ]);
        const source = await sharp(pixels, {
            raw: { width: 2, height: 2, channels: 3 },
        })
            .png()
            .toBuffer();
        const encoded = await encodeElevationTile(source);
        const decoded = await sharp(encoded).raw().toBuffer();
        expect(decoded).toEqual(pixels);
    });
});
