/** Copy only the raw source tiles addressed by a bounded diagnostic pack. */
import fs from 'node:fs';
import path from 'node:path';
import { bytesToHeader } from 'pmtiles';

const [archivePath, sourceCache, targetCache] = process.argv.slice(2);
if (!archivePath || !sourceCache || !targetCache) {
    throw new Error(
        'Usage: tsx scripts/prepare-moire-validation-cache.ts <sample.pmtiles> <source-cache> <new-cache>'
    );
}
if (fs.existsSync(targetCache))
    throw new Error(`Cache cible déjà présent: ${targetCache}`);
const archive = fs.readFileSync(archivePath);
const header = bytesToHeader(
    archive.buffer.slice(archive.byteOffset, archive.byteOffset + 127)
);
const metadata = JSON.parse(
    archive
        .subarray(
            header.jsonMetadataOffset,
            header.jsonMetadataOffset + header.jsonMetadataLength
        )
        .toString('utf8')
);
if (!Array.isArray(metadata.areas))
    throw new Error('Réservé aux packs de diagnostic bornés');
const names = new Set<string>();
for (let z = metadata.logicalMinZoom; z <= metadata.logicalMaxZoom; z++) {
    const n = 2 ** z;
    const tx = (lon: number) => Math.floor(((lon + 180) / 360) * n);
    const ty = (lat: number) => {
        const radians = (lat * Math.PI) / 180;
        return Math.floor(
            ((1 -
                Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) /
                2) *
                n
        );
    };
    for (const area of metadata.areas) {
        for (let x = tx(area.minLon); x <= tx(area.maxLon); x++) {
            for (let y = ty(area.maxLat); y <= ty(area.minLat); y++) {
                for (const type of ['color', 'elevation', 'overlay'])
                    names.add(`${type}_${z}_${x}_${y}.raw`);
            }
        }
    }
}
for (const name of names) {
    if (!fs.existsSync(path.join(sourceCache, name)))
        throw new Error(`Source absente: ${name}`);
}
fs.mkdirSync(targetCache, { recursive: true });
for (const name of names)
    fs.copyFileSync(path.join(sourceCache, name), path.join(targetCache, name));
console.log(`${names.size} sources copiées dans ${path.resolve(targetCache)}`);
