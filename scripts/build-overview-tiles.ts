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
import {
  lonToTileX, latToTileY, zxyToTileId,
  serializeDirectory, buildHeader, HEADER_SIZE,
  type TileEntry,
} from './pmtiles-writer';

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
    bounds: EUROPE_BOUNDS,
    centerLon: 8.2,
    centerLat: 46.8,
    centerZoom: 8,
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
