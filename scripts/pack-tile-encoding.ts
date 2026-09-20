import sharp from 'sharp';

export async function encodeColorTile(source: Buffer): Promise<Buffer> {
    return sharp(source).webp({ quality: 60 }).toBuffer();
}

/**
 * Terrain-RGB stores a base-256 integer across the RGB channels. Lossy image
 * compression can therefore turn a one-level red-channel error into a
 * 6,553.6 m altitude error. The elevation payload must remain bit-exact after
 * decode, so this intentionally uses lossless WebP.
 */
export async function encodeElevationTile(source: Buffer): Promise<Buffer> {
    return sharp(source).webp({ lossless: true, effort: 6 }).toBuffer();
}

export async function encodeOverlayTile(source: Buffer): Promise<Buffer> {
    return sharp(source).png({ palette: true, colors: 64 }).toBuffer();
}

export async function assertReadableRaster(
    source: Buffer,
    label: string
): Promise<void> {
    const metadata = await sharp(source).metadata();
    if (
        !metadata.width ||
        !metadata.height ||
        metadata.width < 1 ||
        metadata.height < 1
    ) {
        throw new Error(`${label}: raster sans dimensions valides`);
    }
}
