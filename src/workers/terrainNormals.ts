/** Physical terrain normals. Parent rasters supply a smooth, unquantized height sampler. */
export function terrainNormalPixels(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    pixelSizeMeters: number,
    compact: boolean,
    sampleHeight?: (x: number, y: number) => number
): Uint8ClampedArray<ArrayBuffer> {
    const output = new Uint8ClampedArray(width * height * 4);
    const getHeight =
        sampleHeight ??
        ((x: number, y: number) => {
            const ix = Math.max(0, Math.min(width - 1, x));
            const iy = Math.max(0, Math.min(height - 1, y));
            const i = (iy * width + ix) * 4;
            return (
                ((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) * 0.1 -
                10000
            );
        });
    const invPixelSize = 1 / pixelSizeMeters;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const vx =
                (getHeight(x - 1, y) - getHeight(x + 1, y)) * invPixelSize;
            const vz =
                (getHeight(x, y - 1) - getHeight(x, y + 1)) * invPixelSize;
            const invLength = 1 / Math.sqrt(vx * vx + 4 + vz * vz);
            output[i] = (vx * invLength * 0.5 + 0.5) * 255;
            // Terrain is Y-up. Keep both horizontal components in RG so shallow
            // slopes retain their precision; reconstruct positive Y on the GPU.
            output[i + 1] = ((compact ? vz : 2) * invLength * 0.5 + 0.5) * 255;
            output[i + 2] = compact ? 255 : (vz * invLength * 0.5 + 0.5) * 255;
            output[i + 3] = 255;
        }
    }
    return output;
}
