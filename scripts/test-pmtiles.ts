import * as pmtiles from 'pmtiles';
import { readFileSync } from 'node:fs';

async function main() {
    const buf = readFileSync('output/suntrail-pack-switzerland-v1.pmtiles');
    const file = new File([buf], 'test.pmtiles');
    const archive = new pmtiles.PMTiles(new pmtiles.FileSource(file));

    try {
        const header = await archive.getHeader();
        console.log('Header OK:', header.minZoom, '-', header.maxZoom, '|', header.numTileEntries, 'tuiles');
        const tile = await archive.getZxy(12, 2165, 1490);
        console.log('Tuile 12/2165/1490:', tile ? tile.data.byteLength + ' bytes' : 'null');
    } catch (e) {
        console.error('ERREUR:', (e as Error).message);
    }
}

void main();
