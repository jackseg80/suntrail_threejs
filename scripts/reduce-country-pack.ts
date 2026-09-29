/** Copy a validated lossless pack while omitting elevation above a chosen zoom. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { bytesToHeader, readVarint, tileIdToZxy } from 'pmtiles';
import {
    buildHeader,
    buildTwoLevelDirectory,
    HEADER_SIZE,
    zxyToTileId,
    type TileEntry,
} from './pmtiles-writer';
import { elevationParentTile } from '../src/modules/elevationParentTile';

interface CopyEntry extends TileEntry {
    sourceOffset: number;
}

function arg(name: string): string {
    const index = process.argv.indexOf(name);
    if (index < 0 || !process.argv[index + 1])
        throw new Error(`${name} est obligatoire`);
    return process.argv[index + 1];
}

function readExactly(fd: number, offset: number, length: number): Buffer {
    const bytes = Buffer.allocUnsafe(length);
    let read = 0;
    while (read < length) {
        const count = fs.readSync(
            fd,
            bytes,
            read,
            length - read,
            offset + read
        );
        if (count === 0)
            throw new Error(`Archive tronquée à ${offset} (${length} octets)`);
        read += count;
    }
    return bytes;
}

function writeAll(fd: number, bytes: Uint8Array): void {
    let written = 0;
    while (written < bytes.length) {
        written += fs.writeSync(fd, bytes, written, bytes.length - written);
    }
}

function directory(buffer: Buffer): TileEntry[] {
    const cursor = {
        buf: new Uint8Array(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength
        ),
        pos: 0,
    };
    const count = readVarint(cursor);
    const entries: TileEntry[] = [];
    let tileId = 0;
    for (let i = 0; i < count; i++) {
        tileId += readVarint(cursor);
        entries.push({ tileId, offset: 0, length: 0, runLength: 0 });
    }
    for (const entry of entries) entry.runLength = readVarint(cursor);
    for (const entry of entries) entry.length = readVarint(cursor);
    for (let i = 0; i < entries.length; i++) {
        const value = readVarint(cursor);
        entries[i].offset =
            value === 0 && i > 0
                ? entries[i - 1].offset + entries[i - 1].length
                : value - 1;
    }
    return entries;
}

async function main(): Promise<void> {
    const archivePath = path.resolve(arg('--archive'));
    const outputPath = path.resolve(arg('--output'));
    const elevationMaxZoom = Number(arg('--elevation-max-zoom'));
    const packVersion = Number(arg('--pack-version'));
    const plan = process.argv.includes('--plan');
    const trimUncovered = process.argv.includes('--trim-uncovered-diagnostic');
    if (
        !Number.isSafeInteger(elevationMaxZoom) ||
        !Number.isSafeInteger(packVersion) ||
        packVersion < 1
    )
        throw new Error('Zoom ou version invalide');
    if (archivePath === outputPath)
        throw new Error('La sortie doit être différente de la source');
    if (!plan && fs.existsSync(outputPath))
        throw new Error(`Sortie déjà présente: ${outputPath}`);
    const partialPath = `${outputPath}.partial`;
    if (!plan && fs.existsSync(partialPath))
        throw new Error(`Sortie partielle déjà présente: ${partialPath}`);

    const sourceFd = fs.openSync(archivePath, 'r');
    try {
        const sourceSize = fs.fstatSync(sourceFd).size;
        const headerBytes = readExactly(sourceFd, 0, HEADER_SIZE);
        const header = bytesToHeader(
            headerBytes.buffer.slice(
                headerBytes.byteOffset,
                headerBytes.byteOffset + headerBytes.byteLength
            ) as ArrayBuffer
        );
        if (header.internalCompression !== 0 || header.tileCompression !== 0)
            throw new Error('Compression PMTiles interne non prise en charge');
        if (header.tileDataOffset + header.tileDataLength > sourceSize)
            throw new Error('Données source hors de l’archive');
        const metadata = JSON.parse(
            readExactly(
                sourceFd,
                header.jsonMetadataOffset,
                header.jsonMetadataLength
            ).toString('utf8')
        ) as Record<string, unknown>;
        const minZoom = Number(metadata.logicalMinZoom);
        const maxZoom = Number(metadata.logicalMaxZoom);
        const offsets = metadata.offsets as Record<string, number> | undefined;
        if (
            metadata.elevationEncoding !== 'terrain-rgb-v2-lossless-webp' ||
            !Number.isInteger(minZoom) ||
            !Number.isInteger(maxZoom) ||
            elevationMaxZoom < minZoom ||
            elevationMaxZoom >= maxZoom ||
            offsets?.elevation !== 100_000_000_000 ||
            offsets?.overlay !== 200_000_000_000 ||
            metadata.elevationMaxZoom !== undefined
        )
            throw new Error(
                'Source non compatible avec une réduction sans perte'
            );
        if (trimUncovered && !Array.isArray(metadata.areas))
            throw new Error(
                'La suppression de bordures est réservée aux échantillons diagnostic'
            );

        const root = directory(
            readExactly(
                sourceFd,
                header.rootDirectoryOffset,
                header.rootDirectoryLength
            )
        );
        const sourceEntries = root.flatMap((entry) =>
            entry.runLength > 0
                ? [entry]
                : directory(
                      readExactly(
                          sourceFd,
                          header.leafDirectoryOffset + entry.offset,
                          entry.length
                      )
                  )
        );
        const selectEntries = (excludedIds: Set<number>) => {
            const entries: CopyEntry[] = [];
            let dataLength = 0;
            let dropped = 0;
            for (const entry of sourceEntries) {
                if (
                    entry.offset < 0 ||
                    entry.length <= 0 ||
                    entry.offset + entry.length > header.tileDataLength
                )
                    throw new Error(
                        `Entrée source hors plage: ${entry.tileId}`
                    );
                let runStart = -1;
                let runLength = 0;
                const flush = () => {
                    if (runLength === 0) return;
                    entries.push({
                        tileId: runStart,
                        offset: dataLength,
                        length: entry.length,
                        runLength,
                        sourceOffset: header.tileDataOffset + entry.offset,
                    });
                    dataLength += entry.length;
                    runLength = 0;
                };
                for (let n = 0; n < entry.runLength; n++) {
                    const id = entry.tileId + n;
                    const isElevation =
                        id >= offsets.elevation && id < offsets.overlay;
                    const keep =
                        !excludedIds.has(id) &&
                        (!isElevation ||
                            tileIdToZxy(id - offsets.elevation)[0] <=
                                elevationMaxZoom);
                    if (keep) {
                        if (runLength === 0) runStart = id;
                        runLength++;
                    } else {
                        if (isElevation) dropped++;
                        flush();
                    }
                }
                flush();
            }
            return { entries, dataLength, dropped };
        };
        let { entries, dataLength, dropped } = selectEntries(new Set());

        const elevationIds = new Set<number>();
        for (const entry of entries) {
            if (
                entry.tileId < offsets.elevation ||
                entry.tileId >= offsets.overlay
            )
                continue;
            for (let n = 0; n < entry.runLength; n++)
                elevationIds.add(entry.tileId + n);
        }
        let missingParents = 0;
        const missingParentCoordinates = new Set<string>();
        const uncoveredColorIds = new Set<number>();
        for (const entry of entries) {
            if (entry.tileId >= offsets.elevation) continue;
            for (let n = 0; n < entry.runLength; n++) {
                const [z, x, y] = tileIdToZxy(entry.tileId + n);
                if (z <= elevationMaxZoom) continue;
                const parent = elevationParentTile(z, x, y, elevationMaxZoom);
                if (
                    !elevationIds.has(
                        offsets.elevation +
                            zxyToTileId(parent.z, parent.x, parent.y)
                    )
                ) {
                    missingParents++;
                    uncoveredColorIds.add(entry.tileId + n);
                    missingParentCoordinates.add(
                        `${parent.z}/${parent.x}/${parent.y}`
                    );
                }
            }
        }
        if (trimUncovered && uncoveredColorIds.size > 0) {
            const excludedIds = new Set<number>();
            for (const colorId of uncoveredColorIds) {
                excludedIds.add(colorId);
                excludedIds.add(colorId + offsets.overlay);
            }
            ({ entries, dataLength, dropped } = selectEntries(excludedIds));
        }
        const summary = {
            archive: archivePath,
            output: outputPath,
            elevationMaxZoom,
            packVersion,
            inputAddressedTiles: header.numAddressedTiles,
            outputAddressedTiles: entries.reduce(
                (sum, entry) => sum + entry.runLength,
                0
            ),
            droppedElevationTiles: dropped,
            missingParents: trimUncovered ? 0 : missingParents,
            missingParentCoordinates: [...missingParentCoordinates].sort(),
            trimmedColorTiles: trimUncovered ? uncoveredColorIds.size : 0,
            trimmedOverlayTiles: trimUncovered ? uncoveredColorIds.size : 0,
            diagnosticTrim: trimUncovered,
            estimatedDataBytes: dataLength,
        };
        console.log(JSON.stringify(summary, null, 2));
        if (missingParents && !trimUncovered)
            throw new Error(
                `${missingParents} tuile(s) couleur sans parent z${elevationMaxZoom}`
            );
        if (plan) return;

        const outputMetadata = Buffer.from(
            JSON.stringify({
                ...metadata,
                packVersion,
                elevationMaxZoom,
                ...(trimUncovered
                    ? { diagnosticTrimmedColorTiles: uncoveredColorIds.size }
                    : {}),
                generatedAt: new Date().toISOString(),
            })
        );
        const { rootDir, leafDirs } = buildTwoLevelDirectory(entries, 512);
        const leafData = Buffer.concat(
            leafDirs.map((leaf) => Buffer.from(leaf))
        );
        const outputHeader = buildHeader({
            rootDirOffset: HEADER_SIZE,
            rootDirLength: rootDir.length,
            metadataOffset: HEADER_SIZE + rootDir.length,
            metadataLength: outputMetadata.length,
            leafDirOffset: HEADER_SIZE + rootDir.length + outputMetadata.length,
            leafDirLength: leafData.length,
            tileDataOffset:
                HEADER_SIZE +
                rootDir.length +
                outputMetadata.length +
                leafData.length,
            tileDataLength: dataLength,
            numTiles: entries.length,
            numAddressedTiles: summary.outputAddressedTiles,
            numTileEntries: entries.length,
            numTileContents: entries.length,
            minZoom: header.minZoom,
            maxZoom: tileIdToZxy(entries[entries.length - 1].tileId)[0],
            bounds: {
                minLon: header.minLon,
                minLat: header.minLat,
                maxLon: header.maxLon,
                maxLat: header.maxLat,
            },
            centerLon: header.centerLon,
            centerLat: header.centerLat,
            centerZoom: header.centerZoom,
        });
        new DataView(outputHeader).setUint8(99, header.tileType);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        const outputFd = fs.openSync(partialPath, 'wx');
        try {
            writeAll(outputFd, new Uint8Array(outputHeader));
            writeAll(outputFd, rootDir);
            writeAll(outputFd, outputMetadata);
            writeAll(outputFd, leafData);
            for (const entry of entries) {
                writeAll(
                    outputFd,
                    readExactly(sourceFd, entry.sourceOffset, entry.length)
                );
            }
        } finally {
            fs.closeSync(outputFd);
        }
        fs.renameSync(partialPath, outputPath);
        const hash = crypto.createHash('sha256');
        for await (const chunk of fs.createReadStream(outputPath))
            hash.update(chunk);
        console.log(
            `Terminé: ${fs.statSync(outputPath).size} octets, SHA-256 ${hash.digest('hex')}`
        );
    } finally {
        fs.closeSync(sourceFd);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
