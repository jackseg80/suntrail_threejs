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

export interface ParentElevationRaster {
    pixels: Uint8ClampedArray<ArrayBuffer>;
    /** Unquantized heights, including a one-pixel halo for continuous edge normals. */
    sampleHeight: (x: number, y: number) => number;
}

/** Interpolate decoded heights, never individual Terrain-RGB channels. */
export function resampleParentElevation(
    source: Uint8ClampedArray,
    width: number,
    height: number,
    z: number,
    x: number,
    y: number,
    parentZoom: number
): ParentElevationRaster {
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

    const decode = (index: number): number =>
        ((source[index] << 16) | (source[index + 1] << 8) | source[index + 2]) *
            0.1 -
        10000;
    const valid = (index: number, value: number): boolean =>
        source[index + 3] !== 0 && value >= -1000 && value <= 9000;
    const stride = width + 2;
    const heights = new Float64Array(stride * (height + 2));
    for (let py = -1; py <= height; py++) {
        // Align texel centres across zoom levels, rather than their top-left corners.
        const sy = Math.max(
            0,
            Math.min(height - 1, sourceY + (py + 0.5) / parent.ratio - 0.5)
        );
        const y0 = Math.floor(sy);
        const y1 = Math.min(y0 + 1, height - 1);
        const fy = sy - y0;
        for (let px = -1; px <= width; px++) {
            const sx = Math.max(
                0,
                Math.min(width - 1, sourceX + (px + 0.5) / parent.ratio - 0.5)
            );
            const x0 = Math.floor(sx);
            const x1 = Math.min(x0 + 1, width - 1);
            const fx = sx - x0;
            const i00 = (y0 * width + x0) * 4;
            const i10 = (y0 * width + x1) * 4;
            const i01 = (y1 * width + x0) * 4;
            const i11 = (y1 * width + x1) * 4;
            const h00 = decode(i00);
            const h10 = decode(i10);
            const h01 = decode(i01);
            const h11 = decode(i11);
            const nearest = (Math.round(sy) * width + Math.round(sx)) * 4;
            // Never turn a void/invalid height into plausible terrain by averaging it.
            let altitude = decode(nearest);
            if (
                valid(i00, h00) &&
                valid(i10, h10) &&
                valid(i01, h01) &&
                valid(i11, h11)
            ) {
                const top = h00 + (h10 - h00) * fx;
                const bottom = h01 + (h11 - h01) * fx;
                altitude = top + (bottom - top) * fy;
            }
            heights[(py + 1) * stride + px + 1] = altitude;
            if (px < 0 || px >= width || py < 0 || py >= height) continue;
            const encoded = Math.round((altitude + 10000) * 10);
            const to = (py * width + px) * 4;
            output[to] = encoded >> 16;
            output[to + 1] = (encoded >> 8) & 255;
            output[to + 2] = encoded & 255;
            output[to + 3] = source[nearest + 3];
        }
    }
    return {
        pixels: output,
        sampleHeight: (x, y) =>
            heights[
                (Math.max(-1, Math.min(height, y)) + 1) * stride +
                    Math.max(-1, Math.min(width, x)) +
                    1
            ],
    };
}

/** Height interpolation is rounded once to Terrain-RGB's original 0.1 m precision. */
export function cropParentElevationPixels(
    source: Uint8ClampedArray,
    width: number,
    height: number,
    z: number,
    x: number,
    y: number,
    parentZoom: number
): Uint8ClampedArray<ArrayBuffer> {
    return resampleParentElevation(source, width, height, z, x, y, parentZoom)
        .pixels;
}
