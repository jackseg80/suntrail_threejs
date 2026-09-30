import { describe, expect, it } from 'vitest';
import { resampleParentElevation } from '../modules/elevationParentTile';
import { terrainNormalPixels } from './terrainNormals';

function plane(width: number, sx: number, sy: number): Uint8ClampedArray {
    const pixels = new Uint8ClampedArray(width * width * 4);
    for (let y = 0; y < width; y++) {
        for (let x = 0; x < width; x++) {
            const encoded = Math.round((10000 + 100 + x * sx + y * sy) * 10);
            pixels.set(
                [encoded >> 16, (encoded >> 8) & 255, encoded & 255, 255],
                (y * width + x) * 4
            );
        }
    }
    return pixels;
}

describe('physical terrain normals', () => {
    it('keeps shallow terrain slopes accurate after compact GPU reconstruction', () => {
        // A 4 m rise over 48 m is a 4.76 degree slope, not a flat field.
        const normals = terrainNormalPixels(plane(8, 0, 4), 8, 8, 48, true);
        const i = (4 * 8 + 4) * 4;
        const x = normals[i] / 127.5 - 1;
        const z = normals[i + 1] / 127.5 - 1;
        const y = Math.sqrt(Math.max(0, 1 - x * x - z * z));
        const slopeDegrees = (Math.atan2(Math.hypot(x, z), y) * 180) / Math.PI;
        expect(slopeDegrees).toBeCloseTo(
            (Math.atan(4 / 48) * 180) / Math.PI,
            0
        );
    });
    it.each([-1, 1])(
        'keeps the direction of both horizontal slopes (%i)',
        (direction) => {
            const pixels = terrainNormalPixels(
                plane(8, direction * 4, -direction * 4),
                8,
                8,
                16,
                true
            );
            const i = (4 * 8 + 4) * 4;
            const x = pixels[i] / 127.5 - 1;
            const z = pixels[i + 1] / 127.5 - 1;
            const up = Math.sqrt(Math.max(0, 1 - x * x - z * z));
            expect(x / up).toBeCloseTo(-direction * 0.25, 2);
            expect(z / up).toBeCloseTo(direction * 0.25, 2);
        }
    );
    it.each([13, 14])(
        'keeps a z12 plane uniformly lit at z%i inside the available parent data',
        (zoom) => {
            const raster = resampleParentElevation(
                plane(32, 4, 8),
                32,
                32,
                zoom,
                1,
                1,
                12
            );
            const spacing = 4 / 2 ** (zoom - 12);
            const normals = terrainNormalPixels(
                raster.pixels,
                32,
                32,
                spacing,
                false,
                raster.sampleHeight
            );
            const length = Math.sqrt(6);
            const expected = [-1 / length, 1 / length, -2 / length].map(
                (value) => Math.round((value * 0.5 + 0.5) * 255)
            );
            // At z13 this quadrant touches the parent's far edges. No neighbouring
            // parent is available there, so interpolation clamps its outer texels.
            const limit = zoom === 13 ? 30 : 32;
            for (let y = 0; y < limit; y++) {
                for (let x = 0; x < limit; x++) {
                    const i = (y * 32 + x) * 4;
                    expect([...normals.slice(i, i + 3)]).toEqual(expected);
                }
            }
        }
    );

    it('retains the direct raster normal calculation for legacy packs', () => {
        const normals = terrainNormalPixels(plane(8, 2, 0), 8, 8, 2, false);
        const i = (4 * 8 + 4) * 4;
        const length = Math.sqrt(2);
        expect([...normals.slice(i, i + 4)]).toEqual([
            Math.round(((-1 / length) * 0.5 + 0.5) * 255),
            Math.round(((1 / length) * 0.5 + 0.5) * 255),
            128,
            255,
        ]);
    });

    it.each([-4, 4])(
        'encodes both horizontal components in compact normals for slope %i',
        (slope) => {
            const pixels = plane(8, 0, slope);
            const full = terrainNormalPixels(pixels, 8, 8, 4, false);
            const compact = terrainNormalPixels(pixels, 8, 8, 4, true);
            const i = (4 * 8 + 4) * 4;
            expect(compact[i]).toBe(full[i]);
            expect(compact[i + 1]).toBe(full[i + 2]);
            expect(compact[i + 2]).toBe(255);
        }
    );
});
