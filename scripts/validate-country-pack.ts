import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
    PMTiles,
    tileIdToZxy,
    zxyToTileId,
    type RangeResponse,
    type Source,
} from 'pmtiles';
import {
    decodeTerrainRgb,
    maxHorizontalSeamDifference,
    maxVerticalSeamDifference,
    scanElevationRgba,
    type ElevationLimits,
} from './pack-elevation-validation';

const DEFAULT_ELEVATION_OFFSET = 100_000_000_000;
const DEFAULT_OVERLAY_OFFSET = 200_000_000_000;

interface TileCoordinate {
    z: number;
    x: number;
    y: number;
    key: string;
    sourcePath: string;
}

interface DecodedRaster {
    rgba: Uint8Array;
    width: number;
    height: number;
    format: string;
}

class LocalFileSource implements Source {
    constructor(private readonly filePath: string) {}

    getKey(): string {
        return this.filePath;
    }

    async getBytes(offset: number, length: number): Promise<RangeResponse> {
        const handle = await fs.promises.open(this.filePath, 'r');
        try {
            const buffer = Buffer.alloc(length);
            const { bytesRead } = await handle.read(buffer, 0, length, offset);
            return {
                data: buffer.buffer.slice(
                    buffer.byteOffset,
                    buffer.byteOffset + bytesRead
                ),
            };
        } finally {
            await handle.close();
        }
    }
}

function argument(name: string): string | undefined {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

function numericArgument(name: string, fallback: number): number {
    const raw = argument(name);
    const value = raw === undefined ? fallback : Number(raw);
    if (!Number.isFinite(value)) throw new Error(`${name}: nombre invalide`);
    return value;
}

function tileKey(z: number, x: number, y: number): string {
    return `${z}/${x}/${y}`;
}

function listCachedTiles(cacheDir: string, type: string): TileCoordinate[] {
    const matcher = new RegExp(`^${type}_(\\d+)_(\\d+)_(\\d+)\\.raw$`);
    return fs
        .readdirSync(cacheDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .flatMap((entry) => {
            const match = matcher.exec(entry.name);
            if (!match) return [];
            const [z, x, y] = match.slice(1).map(Number);
            return [
                {
                    z,
                    x,
                    y,
                    key: tileKey(z, x, y),
                    sourcePath: path.join(cacheDir, entry.name),
                },
            ];
        })
        .sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y);
}

function deterministicSample<T>(values: T[], count: number): T[] {
    if (values.length <= count) return values;
    const selected: T[] = [];
    for (let index = 0; index < count; index++) {
        selected.push(values[Math.floor((index * values.length) / count)]);
    }
    return selected;
}

function sampleCoordinates(
    values: TileCoordinate[],
    count: number
): TileCoordinate[] {
    const sampled = deterministicSample(values, count);
    const keys = new Set(sampled.map((value) => value.key));
    for (const zoom of new Set(values.map((value) => value.z))) {
        const representative = values.find((value) => value.z === zoom);
        if (representative && !keys.has(representative.key)) {
            sampled.push(representative);
            keys.add(representative.key);
        }
    }
    return sampled.sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y);
}

async function decodeRaster(buffer: Buffer): Promise<DecodedRaster> {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    const { data, info } = await image
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return {
        rgba: new Uint8Array(data),
        width: info.width,
        height: info.height,
        format: metadata.format ?? 'unknown',
    };
}

async function readArchiveLayer(
    archive: PMTiles,
    coordinate: TileCoordinate,
    offset: number
): Promise<Buffer | null> {
    const shiftedId =
        zxyToTileId(coordinate.z, coordinate.x, coordinate.y) + offset;
    const [z, x, y] = tileIdToZxy(shiftedId);
    const response = await archive.getZxy(z, x, y);
    return response?.data ? Buffer.from(response.data) : null;
}

function maximumHeightDelta(a: DecodedRaster, b: DecodedRaster): number {
    if (a.width !== b.width || a.height !== b.height)
        return Number.POSITIVE_INFINITY;
    let maximum = 0;
    for (let index = 0; index < a.rgba.length; index += 4) {
        if (a.rgba[index + 3] === 0 || b.rgba[index + 3] === 0) continue;
        const encodedA =
            a.rgba[index] * 65_536 +
            a.rgba[index + 1] * 256 +
            a.rgba[index + 2];
        const encodedB =
            b.rgba[index] * 65_536 +
            b.rgba[index + 1] * 256 +
            b.rgba[index + 2];
        maximum = Math.max(maximum, Math.abs(encodedA - encodedB) * 0.1);
    }
    return maximum;
}

function heightAtNormalized(
    raster: DecodedRaster,
    normalizedX: number,
    normalizedY: number
): number | null {
    const x = Math.max(
        0,
        Math.min(raster.width - 1, Math.round(normalizedX * (raster.width - 1)))
    );
    const y = Math.max(
        0,
        Math.min(
            raster.height - 1,
            Math.round(normalizedY * (raster.height - 1))
        )
    );
    const offset = (y * raster.width + x) * 4;
    if (raster.rgba[offset + 3] === 0) return null;
    return decodeTerrainRgb(
        raster.rgba[offset],
        raster.rgba[offset + 1],
        raster.rgba[offset + 2]
    );
}

async function main(): Promise<void> {
    const archivePath = path.resolve(
        argument('--archive') ??
            (() => {
                throw new Error('--archive est obligatoire');
            })()
    );
    const cacheDirRaw = argument('--cache-dir');
    const cacheDir = cacheDirRaw ? path.resolve(cacheDirRaw) : null;
    const reportPathRaw = argument('--report');
    const sampleCount = Math.max(1, numericArgument('--sample', 96));
    const limits: ElevationLimits = {
        minMeters: numericArgument('--min-height', -500),
        maxMeters: numericArgument('--max-height', 6_000),
        maxGradientMeters: numericArgument('--max-gradient', 500),
        maxSeamMeters: numericArgument('--max-seam', 500),
    };
    const maxCrossZoomMeters = numericArgument('--max-cross-zoom', 500);

    const stat = fs.statSync(archivePath);
    const archive = new PMTiles(new LocalFileSource(archivePath));
    const header = await archive.getHeader();
    const metadata = (await archive.getMetadata()) as Record<string, unknown>;
    const errors: string[] = [];
    const warnings: string[] = [];

    const sections = [
        [
            'root directory',
            header.rootDirectoryOffset,
            header.rootDirectoryLength,
        ],
        ['metadata', header.jsonMetadataOffset, header.jsonMetadataLength],
        [
            'leaf directories',
            header.leafDirectoryOffset,
            header.leafDirectoryLength,
        ],
        ['tile data', header.tileDataOffset, header.tileDataLength],
    ] as const;
    for (const [name, offset, length] of sections) {
        const actualLength = length ?? 0;
        if (
            offset < 0 ||
            actualLength < 0 ||
            offset + actualLength > stat.size
        ) {
            errors.push(
                `${name}: plage ${offset}-${offset + actualLength} hors fichier (${stat.size})`
            );
        }
    }

    const logicalMinZoom = Number(metadata.logicalMinZoom ?? header.minZoom);
    const logicalMaxZoom = Number(metadata.logicalMaxZoom ?? header.maxZoom);
    const hasLayerOffsets =
        typeof metadata.offsets === 'object' && metadata.offsets !== null;
    const offsets = (metadata.offsets ?? {}) as Record<string, unknown>;
    const elevationOffset = Number(
        offsets.elevation ?? DEFAULT_ELEVATION_OFFSET
    );
    const overlayOffset = Number(offsets.overlay ?? DEFAULT_OVERLAY_OFFSET);
    for (const [name, value] of [
        ['elevation', elevationOffset],
        ['overlay', overlayOffset],
    ] as const) {
        if (!Number.isSafeInteger(value) || value <= 0) {
            errors.push(`offset ${name} invalide: ${value}`);
        }
    }

    const maxLogicalTileId =
        zxyToTileId(logicalMaxZoom, 0, 0) + 4 ** logicalMaxZoom - 1;
    const colorRange = [0, maxLogicalTileId];
    const elevationRange = [
        elevationOffset,
        elevationOffset + maxLogicalTileId,
    ];
    const overlayRange = [overlayOffset, overlayOffset + maxLogicalTileId];
    if (hasLayerOffsets) {
        if (
            colorRange[1] >= elevationRange[0] ||
            elevationRange[1] >= overlayRange[0]
        ) {
            errors.push(
                'les plages d’identifiants couleur/élévation/overlay se chevauchent'
            );
        }
        const requiredArchiveZoom = tileIdToZxy(overlayRange[1])[0];
        if (header.maxZoom < requiredArchiveZoom) {
            errors.push(
                `maxZoom PMTiles ${header.maxZoom} < pseudo-zoom requis ${requiredArchiveZoom}`
            );
        }
    } else {
        warnings.push(
            'archive couleur uniquement: aucun offset de couche déclaré'
        );
    }

    const report: Record<string, unknown> = {
        archive: archivePath,
        sizeBytes: stat.size,
        header,
        metadata,
        logicalZoomRange: { min: logicalMinZoom, max: logicalMaxZoom },
        layerIdRanges: hasLayerOffsets
            ? {
                  color: colorRange,
                  elevation: elevationRange,
                  overlay: overlayRange,
              }
            : { color: colorRange },
        limits: { ...limits, maxCrossZoomMeters },
        errors,
        warnings,
    };

    if (cacheDir) {
        if (!fs.existsSync(cacheDir))
            throw new Error(`cache absent: ${cacheDir}`);
        const colorTiles = listCachedTiles(cacheDir, 'color');
        const elevationTiles = listCachedTiles(cacheDir, 'elevation');
        const overlayTiles = listCachedTiles(cacheDir, 'overlay');
        const colorKeys = new Set(colorTiles.map((tile) => tile.key));
        const elevationKeys = new Set(elevationTiles.map((tile) => tile.key));
        const overlayKeys = new Set(overlayTiles.map((tile) => tile.key));
        const commonKeys = new Set(
            [...colorKeys].filter(
                (key) => elevationKeys.has(key) && overlayKeys.has(key)
            )
        );
        const expectedAddressedTiles = commonKeys.size * 3;
        if (elevationTiles.length !== commonKeys.size) {
            warnings.push(
                `${elevationTiles.length - commonKeys.size} source(s) élévation orpheline(s) dans le cache`
            );
        }
        if (header.numAddressedTiles !== expectedAddressedTiles) {
            errors.push(
                `numAddressedTiles=${header.numAddressedTiles}, attendu ${expectedAddressedTiles} d’après le cache commun`
            );
        }

        const candidates = elevationTiles.filter((tile) =>
            commonKeys.has(tile.key)
        );
        if (!hasLayerOffsets) {
            errors.push('impossible de valider l’élévation: offsets absents');
        }
        const sampled = sampleCoordinates(candidates, sampleCount);
        const sourceByKey = new Map(candidates.map((tile) => [tile.key, tile]));
        let unreadableSources = 0;
        let missingArchiveTiles = 0;
        let unreadableArchiveTiles = 0;
        let impossiblePixels = 0;
        let abnormalGradients = 0;
        let noDataPixels = 0;
        let maximumGradientMeters = 0;
        let sourceImpossiblePixels = 0;
        let sourceAbnormalGradients = 0;
        let sourceNoDataPixels = 0;
        let maximumSourceGradientMeters = 0;
        let maximumSourceArchiveDeltaMeters = 0;
        let maximumSourceSeamMeters = 0;
        let maximumArchiveSeamMeters = 0;
        let seamPairs = 0;
        let crossZoomPairs = 0;
        let maximumSourceCrossZoomMeters = 0;
        let maximumArchiveCrossZoomMeters = 0;
        const sampledByZoom: Record<string, number> = {};

        for (const coordinate of sampled) {
            sampledByZoom[coordinate.z] =
                (sampledByZoom[coordinate.z] ?? 0) + 1;
            let source: DecodedRaster;
            try {
                source = await decodeRaster(
                    fs.readFileSync(coordinate.sourcePath)
                );
            } catch (error) {
                unreadableSources++;
                errors.push(
                    `${coordinate.key}: source illisible (${String(error)})`
                );
                continue;
            }

            const sourceScan = scanElevationRgba(
                source.rgba,
                source.width,
                source.height,
                limits
            );
            sourceImpossiblePixels += sourceScan.impossiblePixels;
            sourceAbnormalGradients += sourceScan.abnormalGradients;
            sourceNoDataPixels += sourceScan.noDataPixels;
            maximumSourceGradientMeters = Math.max(
                maximumSourceGradientMeters,
                sourceScan.maxGradientMeters
            );

            const archiveBuffer = await readArchiveLayer(
                archive,
                coordinate,
                elevationOffset
            );
            if (!archiveBuffer) {
                missingArchiveTiles++;
                continue;
            }
            let archived: DecodedRaster;
            try {
                archived = await decodeRaster(archiveBuffer);
            } catch (error) {
                unreadableArchiveTiles++;
                errors.push(
                    `${coordinate.key}: tuile archive illisible (${String(error)})`
                );
                continue;
            }

            const scan = scanElevationRgba(
                archived.rgba,
                archived.width,
                archived.height,
                limits
            );
            impossiblePixels += scan.impossiblePixels;
            abnormalGradients += scan.abnormalGradients;
            noDataPixels += scan.noDataPixels;
            maximumGradientMeters = Math.max(
                maximumGradientMeters,
                scan.maxGradientMeters
            );
            maximumSourceArchiveDeltaMeters = Math.max(
                maximumSourceArchiveDeltaMeters,
                maximumHeightDelta(source, archived)
            );

            if (coordinate.z > logicalMinZoom) {
                const parent = sourceByKey.get(
                    tileKey(
                        coordinate.z - 1,
                        Math.floor(coordinate.x / 2),
                        Math.floor(coordinate.y / 2)
                    )
                );
                if (parent) {
                    const parentSource = await decodeRaster(
                        fs.readFileSync(parent.sourcePath)
                    );
                    const parentArchiveBuffer = await readArchiveLayer(
                        archive,
                        parent,
                        elevationOffset
                    );
                    if (parentArchiveBuffer) {
                        const parentArchived =
                            await decodeRaster(parentArchiveBuffer);
                        const parentX = ((coordinate.x & 1) + 0.5) / 2;
                        const parentY = ((coordinate.y & 1) + 0.5) / 2;
                        const sourceChildHeight = heightAtNormalized(
                            source,
                            0.5,
                            0.5
                        );
                        const sourceParentHeight = heightAtNormalized(
                            parentSource,
                            parentX,
                            parentY
                        );
                        const archiveChildHeight = heightAtNormalized(
                            archived,
                            0.5,
                            0.5
                        );
                        const archiveParentHeight = heightAtNormalized(
                            parentArchived,
                            parentX,
                            parentY
                        );
                        if (
                            sourceChildHeight !== null &&
                            sourceParentHeight !== null &&
                            archiveChildHeight !== null &&
                            archiveParentHeight !== null
                        ) {
                            crossZoomPairs++;
                            maximumSourceCrossZoomMeters = Math.max(
                                maximumSourceCrossZoomMeters,
                                Math.abs(sourceChildHeight - sourceParentHeight)
                            );
                            maximumArchiveCrossZoomMeters = Math.max(
                                maximumArchiveCrossZoomMeters,
                                Math.abs(
                                    archiveChildHeight - archiveParentHeight
                                )
                            );
                        }
                    }
                }
            }

            for (const [dx, dy, direction] of [
                [1, 0, 'vertical'],
                [0, 1, 'horizontal'],
            ] as const) {
                const neighbour = sourceByKey.get(
                    tileKey(coordinate.z, coordinate.x + dx, coordinate.y + dy)
                );
                if (!neighbour) continue;
                const neighbourSource = await decodeRaster(
                    fs.readFileSync(neighbour.sourcePath)
                );
                const neighbourArchiveBuffer = await readArchiveLayer(
                    archive,
                    neighbour,
                    elevationOffset
                );
                if (!neighbourArchiveBuffer) continue;
                const neighbourArchived = await decodeRaster(
                    neighbourArchiveBuffer
                );
                if (
                    source.width !== neighbourSource.width ||
                    archived.width !== neighbourArchived.width
                )
                    continue;
                seamPairs++;
                if (direction === 'vertical') {
                    maximumSourceSeamMeters = Math.max(
                        maximumSourceSeamMeters,
                        maxVerticalSeamDifference(
                            source.rgba,
                            neighbourSource.rgba,
                            source.width,
                            source.height
                        )
                    );
                    maximumArchiveSeamMeters = Math.max(
                        maximumArchiveSeamMeters,
                        maxVerticalSeamDifference(
                            archived.rgba,
                            neighbourArchived.rgba,
                            archived.width,
                            archived.height
                        )
                    );
                } else {
                    maximumSourceSeamMeters = Math.max(
                        maximumSourceSeamMeters,
                        maxHorizontalSeamDifference(
                            source.rgba,
                            neighbourSource.rgba,
                            source.width,
                            source.height
                        )
                    );
                    maximumArchiveSeamMeters = Math.max(
                        maximumArchiveSeamMeters,
                        maxHorizontalSeamDifference(
                            archived.rgba,
                            neighbourArchived.rgba,
                            archived.width,
                            archived.height
                        )
                    );
                }
            }
        }

        if (missingArchiveTiles > 0)
            errors.push(
                `${missingArchiveTiles} tuile(s) élévation absente(s) de l’échantillon`
            );
        if (unreadableArchiveTiles > 0)
            errors.push(
                `${unreadableArchiveTiles} tuile(s) archive illisible(s)`
            );
        if (impossiblePixels > 0)
            errors.push(
                `${impossiblePixels} pixel(s) d’altitude impossible(s)`
            );
        if (abnormalGradients > 0)
            errors.push(`${abnormalGradients} gradient(s) anormal(aux)`);
        if (maximumSourceArchiveDeltaMeters > 0.11)
            errors.push(
                `écart source/archive jusqu’à ${maximumSourceArchiveDeltaMeters.toFixed(1)} m (encodage non fidèle)`
            );
        if (maximumArchiveSeamMeters > limits.maxSeamMeters)
            errors.push(
                `discontinuité inter-tuile jusqu’à ${maximumArchiveSeamMeters.toFixed(1)} m`
            );
        if (maximumArchiveCrossZoomMeters > maxCrossZoomMeters)
            errors.push(
                `incohérence inter-zoom jusqu’à ${maximumArchiveCrossZoomMeters.toFixed(1)} m`
            );
        if (sourceImpossiblePixels > 0)
            warnings.push(
                `${sourceImpossiblePixels} pixel(s) source hors bornes dans l’échantillon`
            );
        if (sourceAbnormalGradients > 0)
            warnings.push(
                `${sourceAbnormalGradients} gradient(s) source au-dessus du seuil prudent`
            );
        if (maximumSourceCrossZoomMeters > maxCrossZoomMeters)
            warnings.push(
                `écart inter-zoom source jusqu’à ${maximumSourceCrossZoomMeters.toFixed(1)} m`
            );

        report.cache = {
            path: cacheDir,
            counts: {
                color: colorTiles.length,
                elevation: elevationTiles.length,
                overlay: overlayTiles.length,
                common: commonKeys.size,
            },
            expectedAddressedTiles,
        };
        report.elevationSample = {
            requested: sampleCount,
            decoded:
                sampled.length -
                unreadableSources -
                missingArchiveTiles -
                unreadableArchiveTiles,
            sampledByZoom,
            unreadableSources,
            missingArchiveTiles,
            unreadableArchiveTiles,
            impossiblePixels,
            abnormalGradients,
            noDataPixels,
            maximumGradientMeters,
            sourceImpossiblePixels,
            sourceAbnormalGradients,
            sourceNoDataPixels,
            maximumSourceGradientMeters,
            maximumSourceArchiveDeltaMeters,
            seamPairs,
            maximumSourceSeamMeters,
            maximumArchiveSeamMeters,
            crossZoomPairs,
            maximumSourceCrossZoomMeters,
            maximumArchiveCrossZoomMeters,
        };
    }

    if (reportPathRaw) {
        const reportPath = path.resolve(reportPathRaw);
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    }

    console.log(JSON.stringify(report, null, 2));
    if (errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
