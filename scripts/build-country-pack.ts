/**
 * build-country-pack.ts (v6 — Filtre Natural Earth, régions supportées)
 *
 * Génère UN SEUL fichier PMTiles v3 optimisé (Taille réduite).
 * - Filtre polygonal Natural Earth 1:10m (conservateur, ~50% de tuiles en moins)
 * - Supporte les pays (countryCode) ET les régions (bbox seule, sans code pays)
 * - Qualité WebP adaptative + compression PNG optimale
 *
 * Usage :
 *   npx tsx scripts/build-country-pack.ts --pack switzerland --maptiler-key YOUR_KEY
 *   npx tsx scripts/build-country-pack.ts --pack dolomites   --maptiler-key YOUR_KEY
 *
 * Ajouter un pack (pays ou région) : éditer PACKS ci-dessous
 *   - countryCode = code ISO 2 lettres → filtre polygone Natural Earth (ex: 'CH', 'FR')
 *   - countryCode absent → bbox seule (région sans frontière administrative)
 *
 * Note : le filtre Natural Earth est plus conservateur que le runtime de l'app
 * (qui fusionne OSM + NE pour CH). Les tuiles manquantes dans le pack tombent
 * sur le réseau au runtime — pas d'impact utilisateur.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import 'dotenv/config';
import { tileIdToZxy } from 'pmtiles';
import {
    lonToTileX,
    latToTileY,
    zxyToTileId,
    serializeDirectory,
    buildTwoLevelDirectory,
    buildHeader,
    HEADER_SIZE,
    deduplicateTiles,
} from './pmtiles-writer';
import {
    assertReadableRaster,
    encodeColorTile,
    encodeElevationTile,
    encodeOverlayTile,
} from './pack-tile-encoding';
import { COUNTRIES } from '../src/data/countries';

const OFFSET_ELEV = 100_000_000_000;
const OFFSET_OVERLAY = 200_000_000_000;

interface PackBounds {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
}

interface PackDef {
    id: string;
    name: string;
    bounds: PackBounds;
    /** Optional disjoint build areas used by bounded diagnostic packs. */
    areas?: PackBounds[];
    zooms: number[];
    source: 'swisstopo' | 'ign' | 'basemap_at' | 'opentopomap';
    version: number;
    countryCode?: string; // ISO 3166-1 alpha-2. Absent → région (bbox seule)
    outputFileName?: string;
    /** Source de tuiles pour les zooms bas (overview), ex: OpenTopoMap */
    overview?: {
        source: 'opentopomap';
        maxZoom: number; // exclusif
    };
}

const PACKS: Record<string, PackDef> = {
    switzerland: {
        id: 'switzerland',
        name: 'Switzerland HD',
        bounds: { minLat: 45.8, maxLat: 47.8, minLon: 5.9, maxLon: 10.5 },
        zooms: [8, 9, 10, 11, 12, 13, 14],
        source: 'swisstopo',
        version: 5,
        countryCode: 'CH',
    },
    switzerland_test: {
        id: 'switzerland',
        name: 'Switzerland Diagnostic Sample',
        bounds: { minLat: 45.9, maxLat: 47.45, minLon: 7.55, maxLon: 8.65 },
        areas: [
            // Alpine terrain around Zermatt/Matterhorn.
            { minLat: 45.9, maxLat: 46.1, minLon: 7.55, maxLon: 7.8 },
            // Flatter urban/lake terrain around Zurich.
            { minLat: 47.3, maxLat: 47.45, minLon: 8.45, maxLon: 8.65 },
        ],
        zooms: [12, 13, 14],
        source: 'swisstopo',
        version: 1,
        countryCode: 'CH',
        outputFileName: 'suntrail-pack-switzerland-sample-v1.pmtiles',
    },
    france_alps: {
        id: 'france_alps',
        name: 'France Alpes HD',
        bounds: { minLat: 43.5, maxLat: 46.5, minLon: 4.5, maxLon: 7.8 },
        zooms: [8, 9, 10, 11, 12, 13, 14],
        source: 'ign',
        version: 3,
        countryCode: 'FR',
    },
    austria: {
        id: 'austria',
        name: 'Austria HD',
        bounds: { minLat: 46.3, maxLat: 49.1, minLon: 9.4, maxLon: 17.3 },
        zooms: [8, 9, 10, 11, 12, 13, 14],
        source: 'basemap_at',
        version: 1,
        countryCode: 'AT',
        overview: { source: 'opentopomap', maxZoom: 12 },
    },
};

type TileType = 'color' | 'elevation' | 'overlay';
const RATE_LIMIT_MS = 50;

async function sha256File(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

// ── Polygone Natural Earth 1:10m (conservateur, ~50% de filtrage) ──────────

function isPointInPolygon(
    px: number,
    py: number,
    polygon: number[][]
): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0],
            yi = polygon[i][1];
        const xj = polygon[j][0],
            yj = polygon[j][1];
        if (
            yi > py !== yj > py &&
            px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
        ) {
            inside = !inside;
        }
    }
    return inside;
}

function isTileInCountryPolygon(
    tx: number,
    ty: number,
    zoom: number,
    code: string
): boolean {
    const def = COUNTRIES[code];
    if (!def) return false;
    const n = Math.pow(2, zoom);
    const points = [
        [tx + 0.5, ty + 0.5],
        [tx, ty],
        [tx + 1, ty],
        [tx, ty + 1],
        [tx + 1, ty + 1],
    ];
    let inside = 0;
    for (const [px, py] of points) {
        const lat =
            (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / n))) * 180) /
            Math.PI;
        const lon = (px / n) * 360 - 180;
        for (const ring of def.polygons) {
            if (ring.length >= 3 && isPointInPolygon(lon, lat, ring)) {
                inside++;
                break;
            }
        }
    }
    return inside >= 2;
}

// ── URLs ────────────────────────────────────────────────────────────────────

function getTileUrl(
    z: number,
    x: number,
    y: number,
    type: TileType,
    source: PackDef['source'],
    maptilerKey?: string
): string {
    if (type === 'color') {
        if (source === 'opentopomap') {
            const sub = ['a', 'b', 'c'][(x + y) % 3];
            return `https://${sub}.tile.opentopomap.org/${z}/${x}/${y}.png`;
        }
        if (source === 'swisstopo')
            return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${z}/${x}/${y}.jpeg`;
        if (source === 'basemap_at')
            return `https://mapsneu.wien.gv.at/basemap/geolandbasemap/normal/google3857/${z}/${y}/${x}.png`;
        return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`;
    }
    if (type === 'elevation')
        return `https://api.maptiler.com/tiles/terrain-rgb-v2/${z}/${x}/${y}.png?key=${maptilerKey}`;
    if (type === 'overlay') {
        if (source === 'swisstopo')
            return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/${z}/${x}/${y}.png`;
        return `https://tile.waymarkedtrails.org/hiking/${z}/${x}/${y}.png`;
    }
    throw new Error('Type inconnu');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
    const packId = process.argv.find((_, i, arr) => arr[i - 1] === '--pack');
    const maptilerKey =
        process.argv.find((_, i, arr) => arr[i - 1] === '--maptiler-key') ??
        process.env.VITE_MAPTILER_KEY;
    const cleanMode = process.argv.includes('--clean');
    const overwriteMode = process.argv.includes('--overwrite');
    const planMode = process.argv.includes('--plan');

    if (!packId || !PACKS[packId]) {
        console.error(
            `Usage: npx tsx scripts/build-country-pack.ts --pack <id> --maptiler-key <key>`
        );
        console.error(`Packs disponibles : ${Object.keys(PACKS).join(', ')}`);
        process.exit(1);
    }

    const pack = PACKS[packId];
    if (!maptilerKey && !planMode) {
        throw new Error(
            'Clé MapTiler absente: utiliser --maptiler-key ou VITE_MAPTILER_KEY.'
        );
    }
    const defaultCacheRoot = path.resolve(__dirname, '../.cache');
    const requestedCacheDir = process.argv.find(
        (_, i, arr) => arr[i - 1] === '--cache-dir'
    );
    const cacheDir = path.resolve(
        requestedCacheDir ??
            path.join(defaultCacheRoot, `pack-${packId}-v${pack.version}`)
    );
    const outputDir = path.resolve(__dirname, '../output');
    const requestedOutput = process.argv.find(
        (_, i, arr) => arr[i - 1] === '--output'
    );
    const outputPath = path.resolve(
        requestedOutput ??
            path.join(
                outputDir,
                pack.outputFileName ??
                    `suntrail-pack-${pack.id}-v${pack.version}.pmtiles`
            )
    );
    const partialOutputPath = `${outputPath}.partial`;

    if (cleanMode && !planMode) {
        const relativeCache = path.relative(defaultCacheRoot, cacheDir);
        if (
            relativeCache.startsWith('..') ||
            path.isAbsolute(relativeCache) ||
            !path.basename(cacheDir).startsWith('pack-')
        ) {
            throw new Error(
                `Refus de nettoyer un cache hors de ${defaultCacheRoot}: ${cacheDir}`
            );
        }
    }
    if (!planMode) {
        if (cleanMode && fs.existsSync(cacheDir))
            fs.rmSync(cacheDir, { recursive: true });
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        if (fs.existsSync(outputPath) && !overwriteMode) {
            throw new Error(
                `Sortie déjà présente: ${outputPath}. Utiliser --overwrite explicitement.`
            );
        }
    }

    const mode = pack.countryCode
        ? `Polygone Natural Earth ${pack.countryCode}`
        : 'Bbox seule (région)';
    console.log(`=== SunTrail Pack Builder v6 ===`);
    console.log(`Pack : ${pack.name} (${pack.id})`);
    console.log(`Mode : ${mode}`);

    const types: TileType[] = ['color', 'elevation', 'overlay'];
    const refs: { z: number; x: number; y: number; type: TileType }[] = [];
    const seenRefs = new Set<string>();

    for (const z of pack.zooms) {
        for (const area of pack.areas ?? [pack.bounds]) {
            const xMin = lonToTileX(area.minLon, z);
            const xMax = lonToTileX(area.maxLon, z);
            const yMin = latToTileY(area.maxLat, z);
            const yMax = latToTileY(area.minLat, z);
            for (let x = xMin; x <= xMax; x++) {
                for (let y = yMin; y <= yMax; y++) {
                    const include = pack.countryCode
                        ? isTileInCountryPolygon(x, y, z, pack.countryCode)
                        : true;
                    if (!include) continue;
                    for (const type of types) {
                        const key = `${type}/${z}/${x}/${y}`;
                        if (seenRefs.has(key)) continue;
                        seenRefs.add(key);
                        refs.push({ z, x, y, type });
                    }
                }
            }
        }
    }

    console.log(`Tuiles a traiter (apres filtrage) : ${refs.length}`);
    if (planMode) {
        console.log(`Mode plan: aucun téléchargement ni fichier écrit.`);
        return;
    }

    // Cache source : téléchargements bruts (peuvent être ré-encodés sans re-download)
    // Extension .raw quel que soit le format — sharp détecte automatiquement
    let dlDone = 0;
    const downloadFailures: { tile: string; reason: string }[] = [];
    for (const ref of refs) {
        const srcPath = path.join(
            cacheDir,
            `${ref.type}_${ref.z}_${ref.x}_${ref.y}.raw`
        );

        let sourceIsValid = false;
        if (fs.existsSync(srcPath)) {
            try {
                await assertReadableRaster(
                    fs.readFileSync(srcPath),
                    `${ref.type}/${ref.z}/${ref.x}/${ref.y}`
                );
                sourceIsValid = true;
            } catch {
                // A replacement is downloaded and only written after validation.
            }
        }

        if (!sourceIsValid) {
            try {
                const effectiveSource =
                    pack.overview && ref.z < pack.overview.maxZoom
                        ? pack.overview.source
                        : pack.source;
                const url = getTileUrl(
                    ref.z,
                    ref.x,
                    ref.y,
                    ref.type,
                    effectiveSource,
                    maptilerKey
                );
                const resp = await fetch(url);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const buf = Buffer.from(await resp.arrayBuffer());
                await assertReadableRaster(
                    buf,
                    `${ref.type}/${ref.z}/${ref.x}/${ref.y}`
                );
                fs.writeFileSync(srcPath, buf);
            } catch (e) {
                downloadFailures.push({
                    tile: `${ref.type}/${ref.z}/${ref.x}/${ref.y}`,
                    reason: e instanceof Error ? e.message : String(e),
                });
            }
            await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
        }
        dlDone++;
        if (dlDone % 500 === 0 || dlDone === refs.length) {
            process.stdout.write(
                `  Telechargement: ${dlDone}/${refs.length}\r`
            );
        }
    }

    if (downloadFailures.length > 0) {
        console.error(
            `\nEchec de ${downloadFailures.length} telechargement(s).`
        );
        for (const failure of downloadFailures.slice(0, 20)) {
            console.error(`  ${failure.tile}: ${failure.reason}`);
        }
        if (downloadFailures.length > 20) {
            console.error(
                `  ... ${downloadFailures.length - 20} autres erreurs`
            );
        }
        throw new Error(
            'Pack incomplet: relancer le build pour reprendre les telechargements manquants.'
        );
    }

    // Fusion : re-encoder depuis les sources avec la compression courante
    console.log(`\nCompression et fusion dans ${outputPath}...`);
    const tileBuffers: { tileId: number; data: Buffer }[] = [];
    let encDone = 0;
    for (const ref of refs) {
        const srcPath = path.join(
            cacheDir,
            `${ref.type}_${ref.z}_${ref.x}_${ref.y}.raw`
        );
        if (fs.existsSync(srcPath)) {
            const buf = fs.readFileSync(srcPath);
            let final: Buffer = buf;
            if (ref.type === 'color') {
                final = await encodeColorTile(buf);
            } else if (ref.type === 'elevation') {
                final = await encodeElevationTile(buf);
            } else {
                final = await encodeOverlayTile(buf);
            }

            let id = zxyToTileId(ref.z, ref.x, ref.y);
            if (ref.type === 'elevation') id += OFFSET_ELEV;
            else if (ref.type === 'overlay') id += OFFSET_OVERLAY;
            tileBuffers.push({ tileId: id, data: final });
        }
        encDone++;
        if (encDone % 500 === 0 || encDone === refs.length) {
            process.stdout.write(`  Encodage: ${encDone}/${refs.length}\r`);
        }
    }

    tileBuffers.sort((a, b) => a.tileId - b.tileId);
    const { entries, dataChunks } = deduplicateTiles(tileBuffers);
    if (entries.length === 0) throw new Error('Aucune tuile a ecrire.');
    const { rootDir, leafDirs } = buildTwoLevelDirectory(entries, 512);
    const leafDirData = Buffer.concat(leafDirs.map((d) => Buffer.from(d)));

    const metadata = Buffer.from(
        JSON.stringify({
            name: pack.name,
            packId: pack.id,
            packVersion: pack.version,
            offsets: { elevation: OFFSET_ELEV, overlay: OFFSET_OVERLAY },
            logicalMinZoom: pack.zooms[0],
            logicalMaxZoom: pack.zooms[pack.zooms.length - 1],
            elevationEncoding: 'terrain-rgb-v2-lossless-webp',
            generatedAt: new Date().toISOString(),
            areas: pack.areas,
        })
    );

    // Elevation and overlay resources use high Hilbert IDs in the same PMTiles
    // archive. The header must cover their derived pseudo zoom, otherwise the
    // standard PMTiles reader rejects them before consulting the directory.
    const archiveMaxZoom = tileIdToZxy(entries[entries.length - 1].tileId)[0];

    const header = buildHeader({
        rootDirOffset: HEADER_SIZE,
        rootDirLength: rootDir.length,
        metadataOffset: HEADER_SIZE + rootDir.length,
        metadataLength: metadata.length,
        leafDirOffset: HEADER_SIZE + rootDir.length + metadata.length,
        leafDirLength: leafDirData.length,
        tileDataOffset:
            HEADER_SIZE + rootDir.length + metadata.length + leafDirData.length,
        tileDataLength: dataChunks.reduce((sum, c) => sum + c.length, 0),
        numTiles: entries.length,
        numAddressedTiles: entries.reduce(
            (sum, entry) => sum + Math.max(1, entry.runLength),
            0
        ),
        numTileEntries: entries.length,
        numTileContents: dataChunks.length,
        minZoom: pack.zooms[0],
        maxZoom: archiveMaxZoom,
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

    const headerView = new DataView(header);
    headerView.setUint8(99, 0);

    const fd = fs.openSync(partialOutputPath, 'w');
    fs.writeSync(fd, new Uint8Array(header));
    fs.writeSync(fd, rootDir);
    fs.writeSync(fd, metadata);
    fs.writeSync(fd, leafDirData);
    for (const chunk of dataChunks) fs.writeSync(fd, chunk);
    fs.closeSync(fd);
    if (overwriteMode && fs.existsSync(outputPath)) fs.rmSync(outputPath);
    fs.renameSync(partialOutputPath, outputPath);

    const hash = await sha256File(outputPath);

    console.log(`\n✓ TERMINE : ${outputPath}`);
    console.log(
        `Taille finale : ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)} Mo`
    );
    console.log(`SHA-256 : ${hash}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
