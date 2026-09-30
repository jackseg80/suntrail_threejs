/** Reproduce parent-elevation lighting stripes, using synthetic and cached Swiss DEMs. */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { performance } from 'node:perf_hooks';
import { resampleParentElevation } from '../src/modules/elevationParentTile';
import { terrainNormalPixels } from '../src/workers/terrainNormals';

function arg(name: string, fallback: string): string {
    const index = process.argv.indexOf(name);
    return index < 0 ? fallback : process.argv[index + 1];
}
const output = path.resolve(arg('--output-dir', 'output/terrain-moire'));
const cache = arg('--cache-dir', '');
fs.mkdirSync(output, { recursive: true });

function nearest(
    source: Uint8ClampedArray,
    width: number,
    height: number,
    x: number,
    y: number
): Uint8ClampedArray {
    const pixels = new Uint8ClampedArray(source.length);
    for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
            const sx = ((x % 4) * width) / 4 + Math.floor(px / 4);
            const sy = ((y % 4) * height) / 4 + Math.floor(py / 4);
            const i = (sy * width + sx) * 4;
            pixels.set(source.subarray(i, i + 4), (py * width + px) * 4);
        }
    }
    return pixels;
}

function normalStats(pixels: Uint8ClampedArray, width: number, height: number) {
    let neighbourDelta = 0;
    let pairs = 0;
    let flat = 0;
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = (y * width + x) * 4;
            if (
                Math.abs(pixels[i] - 127.5) <= 0.5 &&
                Math.abs(pixels[i + 2] - 127.5) <= 0.5
            )
                flat++;
            for (const j of [i + 4, i + width * 4]) {
                for (let c = 0; c < 3; c++)
                    neighbourDelta += Math.abs(pixels[i + c] - pixels[j + c]);
                pairs++;
            }
        }
    }
    return {
        meanNeighbourNormalDeltaByte: neighbourDelta / (pairs * 3),
        flatPixelFraction: flat / ((width - 2) * (height - 2)),
    };
}

function shade(normals: Uint8ClampedArray): Buffer {
    const pixels = Buffer.alloc((normals.length / 4) * 3);
    for (let i = 0; i < normals.length; i += 4) {
        const nx = normals[i] / 127.5 - 1;
        const ny = normals[i + 1] / 127.5 - 1;
        const nz = normals[i + 2] / 127.5 - 1;
        const value = Math.round(
            Math.max(
                0,
                Math.min(
                    1,
                    0.25 + 0.75 * (nx * 0.4 + ny * 0.8 + nz * 0.4472136)
                )
            ) * 255
        );
        pixels.fill(value, (i / 4) * 3, (i / 4) * 3 + 3);
    }
    return pixels;
}

async function compareNativeEncoding(
    name: string,
    source: Uint8ClampedArray,
    width: number,
    height: number,
    pixelSize: number
) {
    const full = terrainNormalPixels(source, width, height, pixelSize, false);
    const compact = terrainNormalPixels(source, width, height, pixelSize, true);
    const before = new Uint8ClampedArray(full.length);
    const after = new Uint8ClampedArray(full.length);
    for (let i = 0; i < full.length; i += 4) {
        const x = full[i] / 127.5 - 1;
        const up = full[i + 1] / 127.5 - 1;
        const legacyZ =
            Math.sqrt(Math.max(0, 1 - x * x - up * up)) *
            (full[i + 2] >= 127.5 ? 1 : -1);
        const z = compact[i + 1] / 127.5 - 1;
        const newUp = Math.sqrt(Math.max(0, 1 - x * x - z * z));
        before.set([full[i], full[i + 1], (legacyZ * 0.5 + 0.5) * 255, 255], i);
        after.set(
            [compact[i], (newUp * 0.5 + 0.5) * 255, compact[i + 1], 255],
            i
        );
    }
    const labels = Buffer.from(
        `<svg width="${width * 2}" height="28"><rect width="100%" height="100%" fill="white"/><g font-family="Arial" font-size="14"><text x="8" y="19">Avant : RG = X, verticale</text><text x="${width + 8}" y="19">Apres : RG = X, Z</text></g></svg>`
    );
    await sharp({
        create: {
            width: width * 2,
            height: height + 28,
            channels: 3,
            background: 'white',
        },
    })
        .composite([
            { input: labels, left: 0, top: 0 },
            {
                input: await sharp(shade(before), {
                    raw: { width, height, channels: 3 },
                })
                    .png()
                    .toBuffer(),
                left: 0,
                top: 28,
            },
            {
                input: await sharp(shade(after), {
                    raw: { width, height, channels: 3 },
                })
                    .png()
                    .toBuffer(),
                left: width,
                top: 28,
            },
        ])
        .png()
        .toFile(path.join(output, `${name}-native-normal-encoding.png`));
    return {
        name,
        width,
        height,
        before: normalStats(before, width, height),
        after: normalStats(after, width, height),
    };
}

async function compare(
    name: string,
    source: Uint8ClampedArray,
    width: number,
    height: number,
    x: number,
    y: number,
    pixelSize: number
) {
    const start = performance.now();
    const legacy = nearest(source, width, height, x, y);
    const oldNormals = terrainNormalPixels(
        legacy,
        width,
        height,
        pixelSize,
        false
    );
    const legacyMs = performance.now() - start;
    const correctedStart = performance.now();
    const raster = resampleParentElevation(source, width, height, 14, x, y, 12);
    const newNormals = terrainNormalPixels(
        raster.pixels,
        width,
        height,
        pixelSize,
        false,
        raster.sampleHeight
    );
    const correctedMs = performance.now() - correctedStart;
    const before = await sharp(shade(oldNormals), {
        raw: { width, height, channels: 3 },
    })
        .png()
        .toBuffer();
    const after = await sharp(shade(newNormals), {
        raw: { width, height, channels: 3 },
    })
        .png()
        .toBuffer();
    const labels = Buffer.from(
        `<svg width="${width * 2}" height="28"><rect width="100%" height="100%" fill="white"/><g font-family="Arial" font-size="14" fill="black"><text x="8" y="19">Avant : altitude repetee</text><text x="${width + 8}" y="19">Apres : altitude interpolee</text></g></svg>`
    );
    await sharp({
        create: {
            width: width * 2,
            height: height + 28,
            channels: 3,
            background: 'white',
        },
    })
        .composite([
            { input: labels, left: 0, top: 0 },
            { input: before, left: 0, top: 28 },
            { input: after, left: width, top: 28 },
        ])
        .png()
        .toFile(path.join(output, `${name}.png`));
    return {
        name,
        tile: `14/${x}/${y}`,
        width,
        height,
        before: normalStats(oldNormals, width, height),
        after: normalStats(newNormals, width, height),
        singleRunDesktopMs: { legacy: legacyMs, corrected: correctedMs },
    };
}

async function main() {
    const width = 128;
    const synthetic = new Uint8ClampedArray(width * width * 4);
    for (let y = 0; y < width; y++) {
        for (let x = 0; x < width; x++) {
            const value = Math.round((10100 + x * 4 + y * 8) * 10);
            synthetic.set(
                [value >> 16, (value >> 8) & 255, value & 255, 255],
                (y * width + x) * 4
            );
        }
    }
    const reports = [
        await compare('synthetic-plane', synthetic, width, width, 1, 1, 1),
    ];
    const nativeEncodingReports = [];
    if (cache) {
        for (const [name, lat, lon] of [
            ['yverdon', 46.745, 6.68],
            ['davos', 46.795, 9.82],
            ['delemont', 47.34855, 7.37831],
        ] as const) {
            const x = Math.floor(((lon + 180) / 360) * 2 ** 14);
            const radians = (lat * Math.PI) / 180;
            const y = Math.floor(
                ((1 -
                    Math.log(Math.tan(radians) + 1 / Math.cos(radians)) /
                        Math.PI) /
                    2) *
                    2 ** 14
            );
            const filename = path.join(
                cache,
                `elevation_12_${Math.floor(x / 4)}_${Math.floor(y / 4)}.raw`
            );
            const decoded = await sharp(filename)
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });
            const pixelSize =
                ((40075016.686 / 2 ** 14) * Math.cos(radians)) /
                decoded.info.width;
            reports.push(
                await compare(
                    name,
                    new Uint8ClampedArray(decoded.data),
                    decoded.info.width,
                    decoded.info.height,
                    x,
                    y,
                    pixelSize
                )
            );
            const native = await sharp(
                path.join(cache, `elevation_14_${x}_${y}.raw`)
            )
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });
            nativeEncodingReports.push(
                await compareNativeEncoding(
                    name,
                    new Uint8ClampedArray(native.data),
                    native.info.width,
                    native.info.height,
                    ((40075016.686 / 2 ** 14) * Math.cos(radians)) /
                        native.info.width
                )
            );
        }
    }
    const report = {
        generatedAt: new Date().toISOString(),
        method: 'Same z12 DEM, legacy nearest-neighbour expansion vs height-domain interpolation with unquantized halo normals. Synthetic Lambert lighting, not an application or S23 capture.',
        reports,
        nativeEncodingMethod:
            'Same native z14 DEM, historical vs corrected compact normal decoding. CPU analogue of GLSL with synthetic Lambert lighting; no height or color changes.',
        nativeEncodingReports,
    };
    fs.writeFileSync(
        path.join(output, 'report.json'),
        JSON.stringify(report, null, 2)
    );
    console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
