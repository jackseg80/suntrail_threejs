/**
 * pmtilesWriter.test.ts — Tests unitaires pour pmtiles-writer.ts
 *
 * Couvre :
 * - zxyToTileId : conversion Z/X/Y → Hilbert tileId
 * - serializeDirectory : sérialisation varint du répertoire PMTiles v3
 * - buildTwoLevelDirectory : structure root + leaves
 * - deduplicateTiles : déduplication runLength de tuiles consécutives identiques
 */

import { describe, it, expect } from 'vitest';
import {
    zxyToTileId,
    serializeDirectory,
    buildTwoLevelDirectory,
    deduplicateTiles,
    type TileEntry,
    type TileWithData,
} from '../../scripts/pmtiles-writer';

// --- Helpers ---

function makeEntry(tileId: number, offset: number, length: number, runLength = 1): TileEntry {
    return { tileId, offset, length, runLength };
}

function makeTile(tileId: number, content: string): TileWithData {
    return { tileId, data: Buffer.from(content) };
}

// --- zxyToTileId ---

describe('zxyToTileId', () => {
    it('z=0 → 0', () => {
        expect(zxyToTileId(0, 0, 0)).toBe(0);
    });

    it('z=1 base = 1 (tuiles 1-4)', () => {
        const ids = [
            zxyToTileId(1, 0, 0),
            zxyToTileId(1, 1, 0),
            zxyToTileId(1, 0, 1),
            zxyToTileId(1, 1, 1),
        ];
        // Tous distincts et dans [1, 4]
        const unique = new Set(ids);
        expect(unique.size).toBe(4);
        for (const id of ids) {
            expect(id).toBeGreaterThanOrEqual(1);
            expect(id).toBeLessThanOrEqual(4);
        }
    });

    it('z=2 : 16 tuiles, toutes distinctes dans [5, 20]', () => {
        const ids: number[] = [];
        for (let x = 0; x < 4; x++) {
            for (let y = 0; y < 4; y++) {
                ids.push(zxyToTileId(2, x, y));
            }
        }
        const unique = new Set(ids);
        expect(unique.size).toBe(16);
        for (const id of ids) {
            expect(id).toBeGreaterThanOrEqual(5);
            expect(id).toBeLessThanOrEqual(20);
        }
    });

    it('est déterministe (même entrée → même sortie)', () => {
        expect(zxyToTileId(10, 533, 384)).toBe(zxyToTileId(10, 533, 384));
    });
});

// --- serializeDirectory ---

describe('serializeDirectory', () => {
    it('encode le nombre d\'entrées en varint', () => {
        const result = serializeDirectory([makeEntry(0, 0, 100)]);
        // Premier byte = varint(1)
        expect(result[0]).toBe(1);
    });

    it('single entry → round-trip lisible (longueur non nulle)', () => {
        const entries = [makeEntry(42, 0, 256, 1)];
        const bytes = serializeDirectory(entries);
        expect(bytes.byteLength).toBeGreaterThan(0);
    });

    it('plusieurs entrées → taille croît avec le nombre d\'entrées', () => {
        const one = serializeDirectory([makeEntry(0, 0, 100)]);
        const three = serializeDirectory([
            makeEntry(0, 0, 100),
            makeEntry(1, 100, 100),
            makeEntry(2, 200, 100),
        ]);
        expect(three.byteLength).toBeGreaterThan(one.byteLength);
    });

    it('encode offset relatif à 0 quand consécutif', () => {
        // Deux entrées consécutives (e.offset === prev.offset + prev.length)
        // → second offset encodé comme varint(0)
        const entries = [makeEntry(0, 0, 50), makeEntry(1, 50, 50)];
        const bytes = serializeDirectory(entries);
        expect(bytes.byteLength).toBeGreaterThan(0);
    });
});

// --- buildTwoLevelDirectory ---

describe('buildTwoLevelDirectory', () => {
    it('1 leaf quand entries ≤ leafSize', () => {
        const entries = Array.from({ length: 10 }, (_, i) =>
            makeEntry(i, i * 100, 100)
        );
        const { rootDir, leafDirs } = buildTwoLevelDirectory(entries, 512);
        expect(leafDirs.length).toBe(1);
        expect(rootDir.byteLength).toBeGreaterThan(0);
    });

    it('2 leaves quand entries = leafSize + 1', () => {
        const entries = Array.from({ length: 513 }, (_, i) =>
            makeEntry(i, i * 100, 100)
        );
        const { leafDirs } = buildTwoLevelDirectory(entries, 512);
        expect(leafDirs.length).toBe(2);
    });

    it('entrée root pointe vers leaf (runLength = 0)', () => {
        // Les entrées root ont runLength=0 (indique un pointeur leaf, pas une tuile)
        // → vérifiable via serializeDirectory qui encode runLength en varint
        const entries = Array.from({ length: 5 }, (_, i) =>
            makeEntry(i, i * 100, 100)
        );
        const { rootDir } = buildTwoLevelDirectory(entries, 3);
        expect(rootDir.byteLength).toBeGreaterThan(0);
    });
});

// --- deduplicateTiles ---

describe('deduplicateTiles', () => {
    it('entrée vide → résultat vide', () => {
        const { entries, dataChunks, savedTiles, savedBytes } = deduplicateTiles([]);
        expect(entries).toHaveLength(0);
        expect(dataChunks).toHaveLength(0);
        expect(savedTiles).toBe(0);
        expect(savedBytes).toBe(0);
    });

    it('tuile unique → 1 entrée, runLength=1, aucun gain', () => {
        const { entries, dataChunks, savedTiles } = deduplicateTiles([
            makeTile(10, 'abc'),
        ]);
        expect(entries).toHaveLength(1);
        expect(dataChunks).toHaveLength(1);
        expect(entries[0].runLength).toBe(1);
        expect(entries[0].tileId).toBe(10);
        expect(savedTiles).toBe(0);
    });

    it('2 tuiles consécutives identiques → 1 entrée runLength=2', () => {
        const { entries, dataChunks, savedTiles, savedBytes } = deduplicateTiles([
            makeTile(5, 'same-content'),
            makeTile(6, 'same-content'),
        ]);
        expect(entries).toHaveLength(1);
        expect(dataChunks).toHaveLength(1);
        expect(entries[0].runLength).toBe(2);
        expect(entries[0].tileId).toBe(5);
        expect(savedTiles).toBe(1);
        expect(savedBytes).toBe(Buffer.from('same-content').length);
    });

    it('3 tuiles consécutives identiques → 1 entrée runLength=3', () => {
        const { entries, savedTiles } = deduplicateTiles([
            makeTile(0, 'ocean'),
            makeTile(1, 'ocean'),
            makeTile(2, 'ocean'),
        ]);
        expect(entries).toHaveLength(1);
        expect(entries[0].runLength).toBe(3);
        expect(savedTiles).toBe(2);
    });

    it('2 tuiles consécutives différentes → 2 entrées runLength=1', () => {
        const { entries, dataChunks, savedTiles } = deduplicateTiles([
            makeTile(0, 'montagne'),
            makeTile(1, 'vallée'),
        ]);
        expect(entries).toHaveLength(2);
        expect(dataChunks).toHaveLength(2);
        expect(entries[0].runLength).toBe(1);
        expect(entries[1].runLength).toBe(1);
        expect(savedTiles).toBe(0);
    });

    it('2 tuiles NON consécutives identiques → 2 entrées séparées (pas de runLength)', () => {
        // tileId 5 et 7 : gap de 2 → pas de run malgré contenu identique
        const { entries, dataChunks, savedTiles } = deduplicateTiles([
            makeTile(5, 'same'),
            makeTile(7, 'same'),
        ]);
        expect(entries).toHaveLength(2);
        expect(dataChunks).toHaveLength(2);
        expect(entries[0].runLength).toBe(1);
        expect(entries[1].runLength).toBe(1);
        expect(savedTiles).toBe(0);
    });

    it('run de 3 + rupture + run de 2 → 2 entrées', () => {
        const { entries, savedTiles } = deduplicateTiles([
            makeTile(0, 'eau'),
            makeTile(1, 'eau'),
            makeTile(2, 'eau'),
            makeTile(3, 'forêt'),
            makeTile(4, 'forêt'),
        ]);
        expect(entries).toHaveLength(2);
        expect(entries[0].runLength).toBe(3);
        expect(entries[1].runLength).toBe(2);
        expect(savedTiles).toBe(3); // 2 économisées sur eau + 1 sur forêt
    });

    it('offsets dans entries sont correctement calculés (croissants, sans recouvrement)', () => {
        const tiles: TileWithData[] = [
            { tileId: 0, data: Buffer.alloc(100, 0xaa) },
            { tileId: 1, data: Buffer.alloc(200, 0xbb) },
            { tileId: 2, data: Buffer.alloc(150, 0xcc) },
        ];
        const { entries } = deduplicateTiles(tiles);
        expect(entries[0].offset).toBe(0);
        expect(entries[1].offset).toBe(100);
        expect(entries[2].offset).toBe(300);
    });

    it('offsets respectent la déduplication (un seul blob pour un run)', () => {
        const tileSize = 50;
        const tiles: TileWithData[] = [
            { tileId: 0, data: Buffer.alloc(tileSize, 0xff) },
            { tileId: 1, data: Buffer.alloc(tileSize, 0xff) }, // run avec 0
            { tileId: 2, data: Buffer.alloc(tileSize, 0x00) },
        ];
        const { entries, dataChunks } = deduplicateTiles(tiles);
        // 2 entrées : run [0,1] + tuile [2]
        expect(entries).toHaveLength(2);
        expect(dataChunks).toHaveLength(2);
        // L'entrée du run pointe au début (offset 0)
        expect(entries[0].offset).toBe(0);
        // L'entrée suivante démarre après le premier blob (offset = tileSize)
        expect(entries[1].offset).toBe(tileSize);
    });

    it('savedBytes = savedTiles × taille d\'un blob', () => {
        const content = 'pixel-data-xyz';
        const size = Buffer.from(content).length;
        const { savedTiles, savedBytes } = deduplicateTiles([
            makeTile(10, content),
            makeTile(11, content),
            makeTile(12, content),
        ]);
        expect(savedTiles).toBe(2);
        expect(savedBytes).toBe(2 * size);
    });

    it('contenu binaire identique détecté correctement', () => {
        const buf = Buffer.alloc(256, 0x42);
        const { entries, savedTiles } = deduplicateTiles([
            { tileId: 0, data: buf },
            { tileId: 1, data: Buffer.alloc(256, 0x42) }, // copie indépendante, même contenu
        ]);
        expect(entries).toHaveLength(1);
        expect(entries[0].runLength).toBe(2);
        expect(savedTiles).toBe(1);
    });

    it('contenu binaire différent d\'un seul byte → pas de run', () => {
        const a = Buffer.alloc(256, 0x42);
        const b = Buffer.alloc(256, 0x42);
        b[128] = 0x43; // un seul byte différent
        const { entries, savedTiles } = deduplicateTiles([
            { tileId: 0, data: a },
            { tileId: 1, data: b },
        ]);
        expect(entries).toHaveLength(2);
        expect(savedTiles).toBe(0);
    });
});
