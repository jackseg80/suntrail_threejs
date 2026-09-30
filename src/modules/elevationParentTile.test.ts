import { describe, expect, it } from 'vitest';
import {
    cropParentElevationPixels,
    elevationParentTile,
    resampleParentElevation,
} from './elevationParentTile';

function encodeHeight(value: number, alpha = 255): number[] {
    const encoded = Math.round((value + 10000) * 10);
    return [encoded >> 16, (encoded >> 8) & 255, encoded & 255, alpha];
}

function makePlane(width = 32): Uint8ClampedArray {
    const source = new Uint8ClampedArray(width * width * 4);
    for (let y = 0; y < width; y++) {
        for (let x = 0; x < width; x++) {
            source.set(encodeHeight(100 + x * 4 + y * 8), (y * width + x) * 4);
        }
    }
    return source;
}

function decodeHeight(pixels: Uint8ClampedArray, i: number): number {
    return (
        ((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]) * 0.1 - 10000
    );
}

describe('reduced elevation parent', () => {
    it('preserves the slope of a plane when enlarging z12 elevation to z14', () => {
        const width = 32;
        const source = makePlane(width);
        const child = cropParentElevationPixels(
            source,
            width,
            width,
            14,
            1,
            1,
            12
        );
        const height = (x: number, y: number) => {
            const i = (y * width + x) * 4;
            return (
                ((child[i] << 16) | (child[i + 1] << 8) | child[i + 2]) * 0.1 -
                10000
            );
        };
        // Parent pixels are 4 m apart; child pixels are 1 m apart.
        for (let x = 2; x < width - 2; x++) {
            expect((height(x + 1, 16) - height(x - 1, 16)) / 2).toBeCloseTo(
                1,
                8
            );
        }
    });
    it('selects the correct z12 ancestor for a z14 tile', () => {
        expect(elevationParentTile(14, 8535, 5802, 12)).toEqual({
            z: 12,
            x: 2133,
            y: 1450,
            ratio: 4,
            childX: 3,
            childY: 2,
        });
    });

    it('selects the correct quadrant and aligns pixel centres', () => {
        const source = makePlane(8);
        const child = cropParentElevationPixels(source, 8, 8, 13, 1, 1, 12);
        expect(decodeHeight(child, 0)).toBeCloseTo(
            100 + 3.75 * 4 + 3.75 * 8,
            8
        );
        expect(decodeHeight(child, 4)).toBeCloseTo(
            100 + 4.25 * 4 + 3.75 * 8,
            8
        );
        expect(decodeHeight(child, child.length - 4)).toBeCloseTo(
            100 + 7 * 4 + 7 * 8,
            8
        );
    });

    it('retains exact samples at the source zoom', () => {
        const source = makePlane();
        expect(cropParentElevationPixels(source, 32, 32, 12, 0, 0, 12)).toEqual(
            source
        );
    });

    it('interpolates altitudes safely across a red/green channel carry', () => {
        const source = new Uint8ClampedArray(8 * 8 * 4);
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                source.set(
                    encodeHeight(x < 4 ? 3107.1 : 3107.2),
                    (y * 8 + x) * 4
                );
            }
        }
        const child = cropParentElevationPixels(source, 8, 8, 14, 2, 1, 12);
        for (let i = 0; i < child.length; i += 4) {
            expect(decodeHeight(child, i)).toBeGreaterThanOrEqual(
                3107.1 - 1e-8
            );
            expect(decodeHeight(child, i)).toBeLessThanOrEqual(3107.2 + 1e-8);
        }
    });

    it('does not blend transparent no-data into valid terrain', () => {
        const source = makePlane(8);
        source.set(encodeHeight(-10000, 0), (4 * 8 + 4) * 4);
        const child = cropParentElevationPixels(source, 8, 8, 14, 2, 2, 12);
        expect([...child.slice(0, 4)]).toEqual([0, 0, 0, 0]);
        expect(decodeHeight(child, 4 * 4)).toBeCloseTo(100 + 5 * 4 + 4 * 8, 8);
        expect(child[4 * 4 + 3]).toBe(255);
    });

    it('preserves opaque invalid sentinels without averaging them', () => {
        const source = makePlane(8);
        source.set([0, 0, 0, 255], (4 * 8 + 4) * 4);
        const child = cropParentElevationPixels(source, 8, 8, 14, 2, 2, 12);
        expect([...child.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    });

    it.each([13, 14])(
        'keeps normals continuous at child edges for z%i',
        (zoom) => {
            const left = resampleParentElevation(
                makePlane(),
                32,
                32,
                zoom,
                0,
                0,
                12
            );
            const right = resampleParentElevation(
                makePlane(),
                32,
                32,
                zoom,
                1,
                0,
                12
            );
            const spacing = 4 / 2 ** (zoom - 12);
            expect(
                (left.sampleHeight(32, 16) - left.sampleHeight(30, 16)) /
                    (2 * spacing)
            ).toBeCloseTo(1, 8);
            expect(
                (right.sampleHeight(1, 16) - right.sampleHeight(-1, 16)) /
                    (2 * spacing)
            ).toBeCloseTo(1, 8);
            expect(
                right.sampleHeight(0, 16) - left.sampleHeight(31, 16)
            ).toBeCloseTo(spacing, 8);
        }
    );

    it('rejects a raster whose dimensions cannot be divided by the zoom ratio', () => {
        expect(() =>
            cropParentElevationPixels(
                new Uint8ClampedArray(7 * 7 * 4),
                7,
                7,
                14,
                3,
                3,
                12
            )
        ).toThrow('Invalid elevation parent raster');
    });
});
