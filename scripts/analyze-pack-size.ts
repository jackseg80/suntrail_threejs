import fs from 'node:fs';
import path from 'node:path';
import { bytesToHeader, readVarint, tileIdToZxy } from 'pmtiles';

interface DirectoryEntry {
    tileId: number;
    offset: number;
    length: number;
    runLength: number;
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
    return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
}

function readExactly(fd: number, offset: number, length: number): Buffer {
    const buffer = Buffer.allocUnsafe(length);
    const bytesRead = fs.readSync(fd, buffer, 0, length, offset);
    if (bytesRead !== length) {
        throw new Error(
            `Archive tronquée: ${bytesRead}/${length} octets à ${offset}`
        );
    }
    return buffer;
}

function deserializeDirectory(buffer: Buffer): DirectoryEntry[] {
    const cursor = { buf: new Uint8Array(toArrayBuffer(buffer)), pos: 0 };
    const count = readVarint(cursor);
    const entries: DirectoryEntry[] = [];
    let lastId = 0;

    for (let i = 0; i < count; i++) {
        lastId += readVarint(cursor);
        entries.push({ tileId: lastId, offset: 0, length: 0, runLength: 1 });
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

function layerForTileId(tileId: number): 'color' | 'elevation' | 'overlay' {
    if (tileId >= 200_000_000_000) return 'overlay';
    if (tileId >= 100_000_000_000) return 'elevation';
    return 'color';
}

const archiveArg = process.argv.find(
    (_, index, args) => args[index - 1] === '--archive'
);
if (!archiveArg) {
    throw new Error(
        'Usage: npx tsx scripts/analyze-pack-size.ts --archive <pack.pmtiles>'
    );
}

const archivePath = path.resolve(archiveArg);
const stat = fs.statSync(archivePath);
const fd = fs.openSync(archivePath, 'r');

try {
    const header = bytesToHeader(toArrayBuffer(readExactly(fd, 0, 127)));
    if (header.internalCompression !== 0) {
        throw new Error(
            `Compression interne ${header.internalCompression} non prise en charge par cet audit`
        );
    }

    const root = deserializeDirectory(
        readExactly(fd, header.rootDirectoryOffset, header.rootDirectoryLength)
    );
    const tileEntries: DirectoryEntry[] = [];
    for (const entry of root) {
        if (entry.runLength > 0) {
            tileEntries.push(entry);
            continue;
        }
        tileEntries.push(
            ...deserializeDirectory(
                readExactly(
                    fd,
                    header.leafDirectoryOffset + entry.offset,
                    entry.length
                )
            )
        );
    }

    const layers = {
        color: { entries: 0, addressedTiles: 0, contentBytes: 0 },
        elevation: { entries: 0, addressedTiles: 0, contentBytes: 0 },
        overlay: { entries: 0, addressedTiles: 0, contentBytes: 0 },
    };
    const byZoom: Record<
        string,
        Record<
            string,
            { entries: number; addressedTiles: number; contentBytes: number }
        >
    > = {};
    const seenContents = new Set<string>();
    for (const entry of tileEntries) {
        const layerName = layerForTileId(entry.tileId);
        const layer = layers[layerName];
        const logicalTileId =
            entry.tileId -
            (layerName === 'elevation'
                ? 100_000_000_000
                : layerName === 'overlay'
                  ? 200_000_000_000
                  : 0);
        const [zoom] = tileIdToZxy(logicalTileId);
        const zoomStats = (byZoom[String(zoom)] ??= {
            color: { entries: 0, addressedTiles: 0, contentBytes: 0 },
            elevation: { entries: 0, addressedTiles: 0, contentBytes: 0 },
            overlay: { entries: 0, addressedTiles: 0, contentBytes: 0 },
        })[layerName];
        layer.entries++;
        layer.addressedTiles += Math.max(1, entry.runLength);
        zoomStats.entries++;
        zoomStats.addressedTiles += Math.max(1, entry.runLength);
        const contentKey = `${entry.offset}:${entry.length}`;
        if (!seenContents.has(contentKey)) {
            seenContents.add(contentKey);
            layer.contentBytes += entry.length;
            zoomStats.contentBytes += entry.length;
        }
    }

    const directoryAndMetadataBytes = header.tileDataOffset;
    const accountedTileBytes = Object.values(layers).reduce(
        (sum, layer) => sum + layer.contentBytes,
        0
    );
    console.log(
        JSON.stringify(
            {
                archive: archivePath,
                archiveBytes: stat.size,
                tileDataBytes: header.tileDataLength,
                directoryAndMetadataBytes,
                accountedTileBytes,
                unaccountedTileBytes:
                    header.tileDataLength - accountedTileBytes,
                layers,
                byZoom,
            },
            null,
            2
        )
    );
} finally {
    fs.closeSync(fd);
}
