/**
 * pmtiles-writer.ts
 *
 * Utilitaires partagés pour la génération de fichiers PMTiles v3.
 * Utilisé par build-overview-tiles.ts et build-country-pack.ts.
 */

// --- Utilitaires géo ---

export function lonToTileX(lon: number, zoom: number): number {
    return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

export function latToTileY(lat: number, zoom: number): number {
    const latRad = (lat * Math.PI) / 180;
    return Math.floor(
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
        Math.pow(2, zoom)
    );
}

// --- PMTiles v3 binary writer ---

/** Convertit Z/X/Y en Hilbert tile ID (PMTiles v3 standard). */
export function zxyToTileId(z: number, x: number, y: number): number {
    if (z === 0) return 0;
    const n = 1 << z;
    let rx: number, ry: number, s: number, d = 0;
    let tx = x, ty = y;
    for (s = n >> 1; s > 0; s >>= 1) {
        rx = (tx & s) > 0 ? 1 : 0;
        ry = (ty & s) > 0 ? 1 : 0;
        d += s * s * ((3 * rx) ^ ry);
        if (ry === 0) {
            if (rx === 1) {
                tx = s - 1 - tx;
                ty = s - 1 - ty;
            }
            [tx, ty] = [ty, tx];
        }
    }
    const base = ((1 << (2 * z)) - 1) / 3;
    return base + d;
}

export function writeVarint(buf: number[], val: number): void {
    let v = val;
    while (v >= 0x80) {
        buf.push((v & 0x7f) | 0x80);
        v >>>= 7;
    }
    buf.push(v & 0x7f);
}

export function setUint64(view: DataView, offset: number, val: number): void {
    const lo = val & 0xffffffff;
    const hi = Math.floor(val / 0x100000000) & 0xffffffff;
    view.setUint32(offset, lo, true);
    view.setUint32(offset + 4, hi, true);
}

export interface TileEntry {
    tileId: number;
    offset: number;
    length: number;
    runLength: number;
}

export function serializeDirectory(entries: TileEntry[]): Uint8Array {
    const buf: number[] = [];
    writeVarint(buf, entries.length);

    let lastId = 0;
    for (const e of entries) {
        writeVarint(buf, e.tileId - lastId);
        lastId = e.tileId;
    }
    for (const e of entries) writeVarint(buf, e.runLength);
    for (const e of entries) writeVarint(buf, e.length);

    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (i > 0 && e.offset === entries[i - 1].offset + entries[i - 1].length) {
            writeVarint(buf, 0);
        } else {
            writeVarint(buf, e.offset + 1);
        }
    }
    return new Uint8Array(buf);
}

export interface BuildHeaderOpts {
    rootDirOffset: number;
    rootDirLength: number;
    metadataOffset: number;
    metadataLength: number;
    tileDataOffset: number;
    tileDataLength: number;
    numTiles: number;
    minZoom: number;
    maxZoom: number;
    bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number };
    centerLon: number;
    centerLat: number;
    centerZoom: number;
}

export function buildHeader(opts: BuildHeaderOpts): ArrayBuffer {
    const buf = new ArrayBuffer(127);
    const view = new DataView(buf);
    const bytes = new Uint8Array(buf);

    // Magic "PMTiles" + version 3
    bytes.set([0x50, 0x4d, 0x54, 0x69, 0x6c, 0x65, 0x73, 3]);

    setUint64(view, 8, opts.rootDirOffset);
    setUint64(view, 16, opts.rootDirLength);
    setUint64(view, 24, opts.metadataOffset);
    setUint64(view, 32, opts.metadataLength);
    setUint64(view, 40, 0); // leaf dir offset
    setUint64(view, 48, 0); // leaf dir length
    setUint64(view, 56, opts.tileDataOffset);
    setUint64(view, 64, opts.tileDataLength);
    setUint64(view, 72, opts.numTiles);
    setUint64(view, 80, opts.numTiles);
    setUint64(view, 88, opts.numTiles);

    view.setUint8(96, 1);  // clustered
    view.setUint8(97, 0);  // internal compression = none
    view.setUint8(98, 0);  // tile compression = none (WebP est déjà compressé)
    view.setUint8(99, 4);  // tile type = webp
    view.setUint8(100, opts.minZoom);
    view.setUint8(101, opts.maxZoom);

    view.setInt32(102, Math.round(opts.bounds.minLon * 10000000), true);
    view.setInt32(106, Math.round(opts.bounds.minLat * 10000000), true);
    view.setInt32(110, Math.round(opts.bounds.maxLon * 10000000), true);
    view.setInt32(114, Math.round(opts.bounds.maxLat * 10000000), true);

    view.setUint8(118, opts.centerZoom);
    view.setInt32(119, Math.round(opts.centerLon * 10000000), true);
    view.setInt32(123, Math.round(opts.centerLat * 10000000), true);

    return buf;
}

export const HEADER_SIZE = 127;
