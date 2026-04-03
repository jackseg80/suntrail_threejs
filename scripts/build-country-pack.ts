/**
 * build-country-pack.ts
 *
 * Génère un fichier PMTiles v3 pour un pack pays (LOD 12-14).
 * Sources : SwissTopo (Suisse), IGN (France Alpes) — APIs publiques gratuites.
 *
 * Supporte la reprise après interruption : les tuiles sont cachées dans
 * un dossier temporaire (.cache/pack-{id}/) et réutilisées au redémarrage.
 *
 * Usage :
 *   npx tsx scripts/build-country-pack.ts --pack switzerland
 *   npx tsx scripts/build-country-pack.ts --pack france_alps
 *   npx tsx scripts/build-country-pack.ts --pack switzerland --clean   (repart de zéro)
 *
 * Prérequis : sharp (devDep)
 * Sortie : output/suntrail-pack-{id}-v{version}.pmtiles
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
    lonToTileX, latToTileY, zxyToTileId,
    serializeDirectory, buildHeader, HEADER_SIZE,
    type TileEntry,
} from './pmtiles-writer';

// --- Pack definitions ---

interface PackDef {
    id: string;
    name: string;
    bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
    zooms: number[];
    source: 'swisstopo' | 'ign';
    version: number;
}

const PACKS: Record<string, PackDef> = {
    switzerland: {
        id: 'switzerland',
        name: 'Switzerland HD',
        bounds: { minLat: 45.8, maxLat: 47.8, minLon: 5.9, maxLon: 10.5 },
        zooms: [12, 13, 14],
        source: 'swisstopo',
        version: 1,
    },
    france_alps: {
        id: 'france_alps',
        name: 'France Alpes HD',
        bounds: { minLat: 43.5, maxLat: 46.5, minLon: 4.5, maxLon: 7.8 },
        zooms: [12, 13, 14],
        source: 'ign',
        version: 1,
    },
};

const WEBP_QUALITY = 85;
const RATE_LIMIT_MS = 200;
const MAX_RETRIES = 3;

// --- Region check (4 corners) ---

function isTileFullyInRegion(
    tx: number, ty: number, zoom: number,
    bounds: PackDef['bounds']
): boolean {
    const n = Math.pow(2, zoom);
    const latN = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n))) * 180 / Math.PI;
    const latS = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + 1) / n))) * 180 / Math.PI;
    const lonW = tx / n * 360 - 180;
    const lonE = (tx + 1) / n * 360 - 180;
    const check = (lat: number, lon: number) =>
        lat > bounds.minLat && lat < bounds.maxLat && lon > bounds.minLon && lon < bounds.maxLon;
    return check(latN, lonW) && check(latN, lonE) && check(latS, lonW) && check(latS, lonE);
}

// --- Tile refs ---

interface TileRef {
    z: number;
    x: number;
    y: number;
}

function computeTileRefs(pack: PackDef): TileRef[] {
    const refs: TileRef[] = [];
    for (const z of pack.zooms) {
        const xMin = lonToTileX(pack.bounds.minLon, z);
        const xMax = lonToTileX(pack.bounds.maxLon, z);
        const yMin = latToTileY(pack.bounds.maxLat, z);
        const yMax = latToTileY(pack.bounds.minLat, z);
        for (let x = xMin; x <= xMax; x++) {
            for (let y = yMin; y <= yMax; y++) {
                // Seulement les tuiles entièrement dans la région
                if (isTileFullyInRegion(x, y, z, pack.bounds)) {
                    refs.push({ z, x, y });
                }
            }
        }
    }
    return refs;
}

// --- Tile cache (reprise après interruption) ---

function getTileCacheDir(packId: string): string {
    return path.resolve(__dirname, `../.cache/pack-${packId}`);
}

function getTileCachePath(cacheDir: string, ref: TileRef): string {
    return path.join(cacheDir, `${ref.z}_${ref.x}_${ref.y}.webp`);
}

function isTileCached(cacheDir: string, ref: TileRef): boolean {
    const p = getTileCachePath(cacheDir, ref);
    return fs.existsSync(p) && fs.statSync(p).size > 100; // >100 bytes = valide
}

function saveTileToCache(cacheDir: string, ref: TileRef, data: Buffer): void {
    const p = getTileCachePath(cacheDir, ref);
    fs.writeFileSync(p, data);
}

function loadTileFromCache(cacheDir: string, ref: TileRef): Buffer {
    return fs.readFileSync(getTileCachePath(cacheDir, ref));
}

// --- Download ---

function getTileUrl(ref: TileRef, source: PackDef['source']): string {
    if (source === 'swisstopo') {
        return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${ref.z}/${ref.x}/${ref.y}.jpeg`;
    }
    // IGN PLANIGNV2
    return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX=${ref.z}&TILEROW=${ref.y}&TILECOL=${ref.x}`;
}

async function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

async function downloadTile(ref: TileRef, source: PackDef['source']): Promise<Buffer> {
    const url = getTileUrl(ref, source);
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const resp = await fetch(url, {
                headers: {
                    'User-Agent': 'SunTrail3D-BuildScript/1.0 (one-time country pack generation)',
                },
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${ref.z}/${ref.x}/${ref.y}`);
            return Buffer.from(await resp.arrayBuffer());
        } catch (e) {
            if (attempt === MAX_RETRIES) throw e;
            console.warn(`  Retry ${attempt}/${MAX_RETRIES} for ${ref.z}/${ref.x}/${ref.y}`);
            await sleep(500 * Math.pow(2, attempt - 1));
        }
    }
    throw new Error('unreachable');
}

async function convertToWebP(imgBuffer: Buffer): Promise<Buffer> {
    return sharp(imgBuffer).webp({ quality: WEBP_QUALITY }).toBuffer();
}

// --- Main ---

async function main() {
    // Parse arguments
    const packArg = process.argv.find((_, i, arr) => arr[i - 1] === '--pack');
    const cleanMode = process.argv.includes('--clean');

    if (!packArg || !PACKS[packArg]) {
        console.error(`Usage: npx tsx scripts/build-country-pack.ts --pack <${Object.keys(PACKS).join('|')}> [--clean]`);
        process.exit(1);
    }

    const pack = PACKS[packArg];
    const outputDir = path.resolve(__dirname, '../output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `suntrail-pack-${pack.id}-v${pack.version}.pmtiles`);

    // Cache directory for resume support
    const cacheDir = getTileCacheDir(pack.id);
    if (cleanMode && fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true });
        console.log(`Cache nettoyé : ${cacheDir}`);
    }
    fs.mkdirSync(cacheDir, { recursive: true });

    console.log(`=== SunTrail Country Pack Builder ===`);
    console.log(`Pack : ${pack.name} (${pack.id})`);
    console.log(`Source : ${pack.source}`);
    console.log(`LODs : ${pack.zooms.join(', ')}`);
    console.log(`Bounds : lat [${pack.bounds.minLat}, ${pack.bounds.maxLat}] lon [${pack.bounds.minLon}, ${pack.bounds.maxLon}]`);
    console.log(`Cache : ${cacheDir}`);
    console.log();

    // 1. Compute tile refs
    const refs = computeTileRefs(pack);
    const cached = refs.filter(r => isTileCached(cacheDir, r));
    const toDownload = refs.filter(r => !isTileCached(cacheDir, r));

    console.log(`Total tuiles (4-corners filter) : ${refs.length}`);
    for (const z of pack.zooms) {
        const total = refs.filter(r => r.z === z).length;
        const done = cached.filter(r => r.z === z).length;
        console.log(`  LOD ${z} : ${total} tuiles (${done} en cache)`);
    }
    console.log(`\nDéjà en cache : ${cached.length} — À télécharger : ${toDownload.length}`);
    if (toDownload.length > 0) {
        const eta = Math.round(toDownload.length * RATE_LIMIT_MS / 1000 / 60);
        console.log(`Temps estimé : ~${eta} minutes`);
    }
    console.log();

    // 2. Download missing tiles
    let done = 0;
    let errors = 0;

    for (const ref of toDownload) {
        try {
            const raw = await downloadTile(ref, pack.source);
            const webp = await convertToWebP(raw);
            saveTileToCache(cacheDir, ref, webp);
        } catch (e) {
            errors++;
            console.error(`  SKIP ${ref.z}/${ref.x}/${ref.y}: ${(e as Error).message}`);
        }
        done++;
        if (done % 100 === 0 || done === toDownload.length) {
            const pct = ((done / toDownload.length) * 100).toFixed(1);
            console.log(`  ${done}/${toDownload.length} (${pct}%) — ${errors} errors`);
        }
        await sleep(RATE_LIMIT_MS);
    }

    // 3. Load all tiles from cache
    console.log('\nChargement des tuiles depuis le cache...');
    const tileBuffers: { ref: TileRef; data: Buffer }[] = [];
    let loadErrors = 0;

    for (const ref of refs) {
        try {
            if (isTileCached(cacheDir, ref)) {
                const data = loadTileFromCache(cacheDir, ref);
                tileBuffers.push({ ref, data });
            }
        } catch {
            loadErrors++;
        }
    }

    console.log(`  ${tileBuffers.length} tuiles chargées (${loadErrors} erreurs de lecture)`);

    if (tileBuffers.length === 0) {
        console.error('Aucune tuile disponible. Arrêt.');
        process.exit(1);
    }

    // 4. Sort by Hilbert tile ID
    const sorted = tileBuffers
        .map((t) => ({
            tileId: zxyToTileId(t.ref.z, t.ref.x, t.ref.y),
            data: t.data,
        }))
        .sort((a, b) => a.tileId - b.tileId);

    // 5. Build tile data
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

    // 6. Serialize directory
    const rootDir = serializeDirectory(entries);

    // 7. Metadata
    const metadata = Buffer.from(JSON.stringify({
        name: `SunTrail Pack: ${pack.name}`,
        description: `Country pack LOD ${pack.zooms[0]}-${pack.zooms[pack.zooms.length - 1]} (${pack.source})`,
        format: 'webp',
        packId: pack.id,
        packVersion: pack.version,
        source: pack.source,
        generator: 'build-country-pack.ts',
        generatedAt: new Date().toISOString(),
    }));

    // 8. Offsets
    const rootDirOffset = HEADER_SIZE;
    const rootDirLength = rootDir.length;
    const metadataOffset = rootDirOffset + rootDirLength;
    const metadataLength = metadata.length;
    const tileDataOffset = metadataOffset + metadataLength;

    // 9. Header
    const header = buildHeader({
        rootDirOffset,
        rootDirLength,
        metadataOffset,
        metadataLength,
        tileDataOffset,
        tileDataLength: tileDataSize,
        numTiles: entries.length,
        minZoom: Math.min(...pack.zooms),
        maxZoom: Math.max(...pack.zooms),
        bounds: {
            minLon: pack.bounds.minLon,
            minLat: pack.bounds.minLat,
            maxLon: pack.bounds.maxLon,
            maxLat: pack.bounds.maxLat,
        },
        centerLon: (pack.bounds.minLon + pack.bounds.maxLon) / 2,
        centerLat: (pack.bounds.minLat + pack.bounds.maxLat) / 2,
        centerZoom: pack.zooms[0],
    });

    // 10. Write PMTiles file
    const fd = fs.openSync(outputPath, 'w');
    fs.writeSync(fd, new Uint8Array(header));
    fs.writeSync(fd, rootDir);
    fs.writeSync(fd, metadata);
    for (const tile of sorted) {
        fs.writeSync(fd, tile.data);
    }
    fs.closeSync(fd);

    const finalSize = fs.statSync(outputPath).size;
    console.log(`\n✓ Pack généré : ${outputPath}`);
    console.log(`  Taille : ${(finalSize / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  Tuiles : ${entries.length} (${errors + loadErrors} erreurs ignorées)`);
    console.log(`  Header : ${HEADER_SIZE} bytes`);
    console.log(`  Directory : ${rootDirLength} bytes`);
    console.log(`  Metadata : ${metadataLength} bytes`);
    console.log(`  Tile data : ${(tileDataSize / 1024 / 1024).toFixed(1)} MB`);
    console.log(`\nCache conservé dans ${cacheDir}`);
    console.log(`Pour le supprimer : npm run build-pack -- --pack ${pack.id} --clean`);
}

main().catch((e) => {
    console.error('ERREUR :', e);
    process.exit(1);
});
