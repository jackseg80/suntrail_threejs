/**
 * build-country-pack.ts (v3 — Single File Full Offline)
 *
 * Génère UN SEUL fichier PMTiles v3 contenant 3 calques de données :
 *   - Calque 0 : Couleur (WebP)
 *   - Calque 1 : Élévation (PNG Terrain-RGB) -> Offset +100,000,000,000
 *   - Calque 2 : Overlay (PNG Chemins)      -> Offset +200,000,000,000
 *
 * Usage :
 *   npx tsx scripts/build-country-pack.ts --pack switzerland --maptiler-key YOUR_KEY
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
    lonToTileX, latToTileY, zxyToTileId,
    serializeDirectory, buildTwoLevelDirectory, buildHeader, HEADER_SIZE,
    deduplicateTiles,
} from './pmtiles-writer';

// --- Offsets pour fusionner 3 types dans 1 seul index d'IDs ---
const OFFSET_ELEV = 100_000_000_000;
const OFFSET_OVERLAY = 200_000_000_000;

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
        zooms: [8, 9, 10, 11, 12, 13, 14],
        source: 'swisstopo',
        version: 3,
    },
    france_alps: {
        id: 'france_alps',
        name: 'France Alpes HD',
        bounds: { minLat: 43.5, maxLat: 46.5, minLon: 4.5, maxLon: 7.8 },
        zooms: [8, 9, 10, 11, 12, 13, 14],
        source: 'ign',
        version: 3,
    },
};

type TileType = 'color' | 'elevation' | 'overlay';
const RATE_LIMIT_MS = 100;

function getTileUrl(z: number, x: number, y: number, type: TileType, source: PackDef['source'], maptilerKey?: string): string {
    if (type === 'color') {
        if (source === 'swisstopo') return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${z}/${x}/${y}.jpeg`;
        return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`;
    }
    if (type === 'elevation') {
        if (!maptilerKey) throw new Error('Maptiler Key requise');
        return `https://api.maptiler.com/tiles/terrain-rgb-v2/${z}/${x}/${y}.png?key=${maptilerKey}`;
    }
    if (type === 'overlay') {
        if (source === 'swisstopo') return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/${z}/${x}/${y}.png`;
        return `https://tile.waymarkedtrails.org/hiking/${z}/${x}/${y}.png`;
    }
    throw new Error('Type inconnu');
}

async function main() {
    const packId = process.argv.find((_, i, arr) => arr[i - 1] === '--pack');
    const maptilerKey = process.argv.find((_, i, arr) => arr[i - 1] === '--maptiler-key');
    const cleanMode = process.argv.includes('--clean');

    if (!packId || !PACKS[packId]) {
        console.error(`Usage: npx tsx scripts/build-country-pack.ts --pack <id> --maptiler-key <key> [--clean]`);
        process.exit(1);
    }

    const pack = PACKS[packId];
    const cacheDir = path.resolve(__dirname, `../.cache/pack-${packId}-v3`);
    const outputDir = path.resolve(__dirname, '../output');
    const outputPath = path.join(outputDir, `suntrail-pack-${pack.id}-v${pack.version}.pmtiles`);

    if (cleanMode && fs.existsSync(cacheDir)) fs.rmSync(cacheDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    console.log(`=== SunTrail Pack Builder: SINGLE FILE MODE ===`);
    console.log(`Pack : ${pack.name} v${pack.version}`);

    // 1. Collecter toutes les tuiles nécessaires
    const types: TileType[] = ['color', 'elevation', 'overlay'];
    const refs: { z: number, x: number, y: number, type: TileType }[] = [];
    
    for (const z of pack.zooms) {
        const xMin = lonToTileX(pack.bounds.minLon, z);
        const xMax = lonToTileX(pack.bounds.maxLon, z);
        const yMin = latToTileY(pack.bounds.maxLat, z);
        const yMax = latToTileY(pack.bounds.minLat, z);
        for (let x = xMin; x <= xMax; x++) {
            for (let y = yMin; y <= yMax; y++) {
                // Filtre simple pour la démo, on pourrait affiner avec isTileFullyInRegion
                for (const type of types) refs.push({ z, x, y, type });
            }
        }
    }

    console.log(`Total tuiles à traiter : ${refs.length}`);

    // 2. Téléchargement & Cache
    let done = 0;
    for (const ref of refs) {
        const ext = ref.type === 'color' ? 'webp' : 'png';
        const cachePath = path.join(cacheDir, `${ref.type}_${ref.z}_${ref.x}_${ref.y}.${ext}`);
        
        if (!fs.existsSync(cachePath)) {
            try {
                const url = getTileUrl(ref.z, ref.x, ref.y, ref.type, pack.source, maptilerKey);
                const resp = await fetch(url);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const buf = Buffer.from(await resp.arrayBuffer());

                let final = buf;
                if (ref.type === 'color') {
                    final = await sharp(buf).webp({ quality: 80 }).toBuffer();
                } else if (ref.type === 'elevation') {
                    final = await sharp(buf).png({ compressionLevel: 9 }).toBuffer();
                } else {
                    final = await sharp(buf).png({ palette: true }).toBuffer();
                }
                fs.writeFileSync(cachePath, final);
            } catch (e) {
                // Silencieusement ignorer les erreurs (tuiles hors limites MapTiler/IGN)
            }
            await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
        }
        done++;
        if (done % 500 === 0) console.log(`  Progress: ${done}/${refs.length}`);
    }

    // 3. Fusion dans PMTiles
    console.log(`\nFusion dans ${outputPath}...`);
    const tileBuffers: { tileId: number; data: Buffer }[] = [];
    
    for (const ref of refs) {
        const ext = ref.type === 'color' ? 'webp' : 'png';
        const cachePath = path.join(cacheDir, `${ref.type}_${ref.z}_${ref.x}_${ref.y}.${ext}`);
        if (fs.existsSync(cachePath)) {
            let id = zxyToTileId(ref.z, ref.x, ref.y);
            if (ref.type === 'elevation') id += OFFSET_ELEV;
            else if (ref.type === 'overlay') id += OFFSET_OVERLAY;
            
            tileBuffers.push({ tileId: id, data: fs.readFileSync(cachePath) });
        }
    }

    tileBuffers.sort((a, b) => a.tileId - b.tileId);
    const { entries, dataChunks } = deduplicateTiles(tileBuffers);
    const { rootDir, leafDirs } = buildTwoLevelDirectory(entries, 512);
    const leafDirData = Buffer.concat(leafDirs.map(d => Buffer.from(d)));

    const metadata = Buffer.from(JSON.stringify({
        name: pack.name,
        description: "Full Offline Pack (Color + Elevation + Overlay)",
        attribution: "SwissTopo, MapTiler, WaymarkedTrails",
        offsets: { elevation: OFFSET_ELEV, overlay: OFFSET_OVERLAY }
    }));

    const header = buildHeader({
        rootDirOffset: HEADER_SIZE,
        rootDirLength: rootDir.length,
        metadataOffset: HEADER_SIZE + rootDir.length,
        metadataLength: metadata.length,
        leafDirOffset: HEADER_SIZE + rootDir.length + metadata.length,
        leafDirLength: leafDirData.length,
        tileDataOffset: HEADER_SIZE + rootDir.length + metadata.length + leafDirData.length,
        tileDataLength: dataChunks.reduce((sum, c) => sum + c.length, 0),
        numTiles: entries.length,
        minZoom: pack.zooms[0],
        maxZoom: pack.zooms[pack.zooms.length - 1],
        bounds: { minLon: pack.bounds.minLon, minLat: pack.bounds.minLat, maxLon: pack.bounds.maxLon, maxLat: pack.bounds.maxLat },
        centerLon: (pack.bounds.minLon + pack.bounds.maxLon) / 2,
        centerLat: (pack.bounds.minLat + pack.bounds.maxLat) / 2,
        centerZoom: pack.zooms[0]
    });

    // PMTiles header: tile_type 0=unknown (mixte car wep+png)
    const headerView = new DataView(header);
    headerView.setUint8(99, 0); 

    const fd = fs.openSync(outputPath, 'w');
    fs.writeSync(fd, new Uint8Array(header));
    fs.writeSync(fd, rootDir);
    fs.writeSync(fd, metadata);
    fs.writeSync(fd, leafDirData);
    for (const chunk of dataChunks) fs.writeSync(fd, chunk);
    fs.closeSync(fd);

    console.log(`\n✓ TERMINÉ : ${outputPath}`);
    console.log(`Taille finale : ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)} MB`);
}

main().catch(console.error);
