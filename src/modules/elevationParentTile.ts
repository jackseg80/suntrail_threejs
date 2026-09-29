/** Position of a requested elevation tile inside a coarser parent tile. */
export function elevationParentTile(
    z: number,
    x: number,
    y: number,
    parentZoom: number
): {
    z: number;
    x: number;
    y: number;
    ratio: number;
    childX: number;
    childY: number;
} {
    if (
        !Number.isInteger(z) ||
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        !Number.isInteger(parentZoom) ||
        parentZoom < 0 ||
        parentZoom > z ||
        z > 22
    ) {
        throw new Error('Invalid elevation parent coordinates');
    }
    const ratio = 2 ** (z - parentZoom);
    return {
        z: parentZoom,
        x: Math.floor(x / ratio),
        y: Math.floor(y / ratio),
        ratio,
        childX: x % ratio,
        childY: y % ratio,
    };
}

/** Expand the matching quadrant with nearest-neighbour RGB copies, never RGB interpolation. */
export function cropParentElevationPixels(
    source: Uint8ClampedArray,
    width: number,
    height: number,
    z: number,
    x: number,
    y: number,
    parentZoom: number
): Uint8ClampedArray<ArrayBuffer> {
    const parent = elevationParentTile(z, x, y, parentZoom);
    if (
        width <= 0 ||
        height <= 0 ||
        width % parent.ratio !== 0 ||
        height % parent.ratio !== 0 ||
        source.length !== width * height * 4
    ) {
        throw new Error('Invalid elevation parent raster');
    }
    const output = new Uint8ClampedArray(new ArrayBuffer(source.length));
    const sourceX = (parent.childX * width) / parent.ratio;
    const sourceY = (parent.childY * height) / parent.ratio;
    for (let py = 0; py < height; py++) {
        const sy = sourceY + Math.floor(py / parent.ratio);
        for (let px = 0; px < width; px++) {
            const sx = sourceX + Math.floor(px / parent.ratio);
            const from = (sy * width + sx) * 4;
            const to = (py * width + px) * 4;
            output[to] = source[from];
            output[to + 1] = source[from + 1];
            output[to + 2] = source[from + 2];
            output[to + 3] = source[from + 3];
        }
    }
    return output;
}
