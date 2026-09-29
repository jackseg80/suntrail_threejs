import { describe, expect, it } from 'vitest';
import {
    cropParentElevationPixels,
    elevationParentTile,
} from './elevationParentTile';

describe('reduced elevation parent', () => {
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

    it('copies only the requested quadrant without interpolating Terrain-RGB', () => {
        const source = new Uint8ClampedArray(8 * 8 * 4);
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const i = (y * 8 + x) * 4;
                source.set([1 + (x >= 4 ? 1 : 0), y, x, 255], i);
            }
        }
        const child = cropParentElevationPixels(source, 8, 8, 13, 1, 1, 12);
        const first = [...child.slice(0, 4)];
        const last = [...child.slice(-4)];
        expect(first).toEqual([2, 4, 4, 255]);
        expect(last).toEqual([2, 7, 7, 255]);
        expect([...child.slice(4, 8)]).toEqual(first);
        expect([...child.slice(8 * 4, 8 * 4 + 4)]).toEqual([2, 4, 4, 255]);
    });

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
