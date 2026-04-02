/**
 * build-overview-tiles.ts
 *
 * Script one-shot pour générer le fichier europe-overview.pmtiles contenant :
 *   - LOD 5-7 : Europe entière (OpenTopoMap)
 *   - LOD 8-10 : Suisse (OpenTopoMap — cohérent avec getColorUrl qui force OTM à LOD ≤ 10)
 *   - LOD 11 : Suisse (SwissTopo pixelkarte-farbe — source par défaut de l'app)
 *
 * Usage : npm run build-overview
 * Prérequis : sharp (devDep)
 * Sortie : public/tiles/europe-overview.pmtiles (~30 MB)
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// --- Configuration ---

const OUTPUT = path.resolve(__dirname, '../public/tiles/europe-overview.pmtiles');
const WEBP_QUALITY = 80;
const RATE_LIMIT_MS = 100;
const MAX_RETRIES = 3;

// Europe élargie : Islande → Moscou, Portugal → Crète
const EUROPE_BOUNDS = {
  minLat: 34,
  maxLat: 72,
  minLon: -25,
  maxLon: 45,
};

// Suisse (avec marge pour les tuiles-frontière)
const SWISS_BOUNDS = {
  minLat: 45.8,
  maxLat: 47.9,
  minLon: 5.9,
  maxLon: 10.6,
};

// Définition des couches à générer
interface LayerDef {
  name: string;
  zooms: number[];
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  source: 'opentopomap' | 'swisstopo';
}

const LAYERS: LayerDef[] = [
  { name: 'Europe LOD 5-7',  zooms: [5, 6, 7],       bounds: EUROPE_BOUNDS, source: 'opentopomap' },
  { name: 'Suisse LOD 8-10', zooms: [8, 9, 10],      bounds: SWISS_BOUNDS,  source: 'opentopomap' },
  { name: 'Suisse LOD 11',   zooms: [11],             bounds: SWISS_BOUNDS,  source: 'swisstopo' },
];

// --- Utilitaires géo ---

function lonToTileX(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function latToTileY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
}

// --- PMTiles v3 binary writer ---

function zxyToTileId(z: number, x: number, y: number): number {
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

function writeVarint(buf: number[], val: number): void {
  let v = val;
  while (v >= 0x80) {
    buf.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  buf.push(v & 0x7f);
}

function setUint64(view: DataView, offset: number, val: number): void {
  const lo = val & 0xffffffff;
  const hi = Math.floor(val / 0x100000000) & 0xffffffff;
  view.setUint32(offset, lo, true);
  view.setUint32(offset + 4, hi, true);
}

interface TileEntry {
  tileId: number;
  offset: number;
  length: number;
  runLength: number;
}

function serializeDirectory(entries: TileEntry[]): Uint8Array {
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

function buildHeader(opts: {
  rootDirOffset: number;
  rootDirLength: number;
  metadataOffset: number;
  metadataLength: number;
  tileDataOffset: number;
  tileDataLength: number;
  numTiles: number;
  minZoom: number;
  maxZoom: number;
}): ArrayBuffer {
  const buf = new ArrayBuffer(127);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

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

  // Bounds = Europe (enveloppe globale)
  view.setInt32(102, Math.round(EUROPE_BOUNDS.minLon * 10000000), true);
  view.setInt32(106, Math.round(EUROPE_BOUNDS.minLat * 10000000), true);
  view.setInt32(110, Math.round(EUROPE_BOUNDS.maxLon * 10000000), true);
  view.setInt32(114, Math.round(EUROPE_BOUNDS.maxLat * 10000000), true);

  // Center = Suisse (point d'intérêt principal)
  view.setUint8(118, 8);
  view.setInt32(119, Math.round(8.2 * 10000000), true);  // lon ~Lucerne
  view.setInt32(123, Math.round(46.8 * 10000000), true);  // lat ~Lucerne

  return buf;
}

// --- Tile refs ---

interface TileRef {
  z: number;
  x: number;
  y: number;
  source: 'opentopomap' | 'swisstopo';
}

function computeAllTileRefs(): TileRef[] {
  const refs: TileRef[] = [];
  for (const layer of LAYERS) {
    for (const z of layer.zooms) {
      const xMin = lonToTileX(layer.bounds.minLon, z);
      const xMax = lonToTileX(layer.bounds.maxLon, z);
      const yMin = latToTileY(layer.bounds.maxLat, z);
      const yMax = latToTileY(layer.bounds.minLat, z);
      for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
          refs.push({ z, x, y, source: layer.source });
        }
      }
    }
  }
  return refs;
}

// --- Download ---

function getTileUrl(ref: TileRef): string {
  if (ref.source === 'swisstopo') {
    return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${ref.z}/${ref.x}/${ref.y}.jpeg`;
  }
  const sub = ['a', 'b', 'c'][(ref.x + ref.y) % 3];
  return `https://${sub}.tile.opentopomap.org/${ref.z}/${ref.x}/${ref.y}.png`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function downloadTile(ref: TileRef): Promise<Buffer> {
  const url = getTileUrl(ref);
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'SunTrail3D-BuildScript/1.0 (one-time tile bundling)',
        },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
      return Buffer.from(await resp.arrayBuffer());
    } catch (e) {
      if (attempt === MAX_RETRIES) throw e;
      console.warn(`  Retry ${attempt}/${MAX_RETRIES} for ${ref.z}/${ref.x}/${ref.y}`);
      await sleep(500 * attempt);
    }
  }
  throw new Error('unreachable');
}

async function convertToWebP(imgBuffer: Buffer): Promise<Buffer> {
  return sharp(imgBuffer).webp({ quality: WEBP_QUALITY }).toBuffer();
}

// --- Main ---

async function main() {
  console.log('=== SunTrail Overview Tiles Builder ===\n');

  const refs = computeAllTileRefs();
  const totalCount = refs.length;

  console.log(`Total tuiles : ${totalCount}`);
  for (const layer of LAYERS) {
    const count = refs.filter((r) => layer.zooms.includes(r.z) && r.source === layer.source).length;
    console.log(`  ${layer.name} (${layer.source}) : ${count} tuiles`);
  }
  console.log();

  // 1. Télécharger et convertir
  const tileBuffers: { ref: TileRef; data: Buffer }[] = [];
  let done = 0;

  for (const ref of refs) {
    const raw = await downloadTile(ref);
    const webp = await convertToWebP(raw);
    tileBuffers.push({ ref, data: webp });
    done++;
    if (done % 50 === 0 || done === totalCount) {
      const pct = ((done / totalCount) * 100).toFixed(1);
      const sizeMB = (tileBuffers.reduce((s, t) => s + t.data.length, 0) / 1024 / 1024).toFixed(1);
      console.log(`  ${done}/${totalCount} (${pct}%) — ${sizeMB} MB`);
    }
    // Rate limit (SwissTopo n'a pas de limite stricte, mais restons polis)
    await sleep(RATE_LIMIT_MS);
  }

  // 2. Trier par tile ID (Hilbert)
  const sorted = tileBuffers
    .map((t) => ({
      tileId: zxyToTileId(t.ref.z, t.ref.x, t.ref.y),
      data: t.data,
    }))
    .sort((a, b) => a.tileId - b.tileId);

  // 3. Construire les données de tuiles
  let tileDataSize = 0;
  const entries: TileEntry[] = [];
  for (const tile of sorted) {
    entries.push({
      tileId: tile.tileId,
      offset: tileDataSize,
      length: tile.data.length,
      runLength: 1,
    });
    tileDataSize += tile.data.length;
  }

  // 4. Sérialiser le directory
  const rootDir = serializeDirectory(entries);

  // 5. Métadonnées
  const allZooms = LAYERS.flatMap((l) => l.zooms);
  const metadata = Buffer.from(JSON.stringify({
    name: 'SunTrail Overview (Europe + CH)',
    description: 'LOD 5-7 Europe (OpenTopoMap) + LOD 8-11 Suisse (OTM + SwissTopo)',
    format: 'webp',
    generator: 'build-overview-tiles.ts',
    generatedAt: new Date().toISOString(),
  }));

  // 6. Offsets
  const HEADER_SIZE = 127;
  const rootDirOffset = HEADER_SIZE;
  const rootDirLength = rootDir.length;
  const metadataOffset = rootDirOffset + rootDirLength;
  const metadataLength = metadata.length;
  const tileDataOffset = metadataOffset + metadataLength;

  // 7. Header
  const header = buildHeader({
    rootDirOffset,
    rootDirLength,
    metadataOffset,
    metadataLength,
    tileDataOffset,
    tileDataLength: tileDataSize,
    numTiles: entries.length,
    minZoom: Math.min(...allZooms),
    maxZoom: Math.max(...allZooms),
  });

  // 8. Écrire le fichier
  const fd = fs.openSync(OUTPUT, 'w');
  fs.writeSync(fd, new Uint8Array(header));
  fs.writeSync(fd, rootDir);
  fs.writeSync(fd, metadata);
  for (const tile of sorted) {
    fs.writeSync(fd, tile.data);
  }
  fs.closeSync(fd);

  const finalSize = fs.statSync(OUTPUT).size;
  console.log(`\n✓ Fichier généré : ${OUTPUT}`);
  console.log(`  Taille : ${(finalSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Tuiles : ${entries.length}`);
  console.log(`  Header : ${HEADER_SIZE} bytes`);
  console.log(`  Directory : ${rootDirLength} bytes`);
  console.log(`  Metadata : ${metadataLength} bytes`);
  console.log(`  Tile data : ${(tileDataSize / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((e) => {
  console.error('ERREUR :', e);
  process.exit(1);
});
