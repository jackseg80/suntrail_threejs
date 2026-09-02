import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import type { GPXHistoryEntry } from '../gpxHistoryService';
import { TrackRepository } from './TrackRepository';
import { TrackService } from './trackService';

function legacy(index: number): GPXHistoryEntry {
    return {
        id: `old-${index}`,
        name: `Ancienne ${index} 🥾`,
        color: '#123456',
        source: index % 2 === 0 ? 'rec' : 'import',
        timestamp: 1_700_000_000_000 + index,
        locationName: `Lieu ${index}`,
        countryName: 'Suisse',
        stats: {
            distance: index + 1,
            dPlus: index * 10,
            dMinus: index * 5,
            pointCount: 500 + index,
        },
        simplifiedPoints: [
            { lat: 46 + index / 100, lon: 7, ele: 1000 },
            { lat: 46.1 + index / 100, lon: 7.1, ele: 1100 },
        ],
        centerLat: 46.05,
        centerLon: 7.05,
        bounds: {
            minLat: 46,
            maxLat: 46.2,
            minLon: 7,
            maxLon: 7.2,
        },
    };
}

describe('TrackService legacy migration', () => {
    it('copies five entries once without deleting or rewriting the source', async () => {
        const entries = Array.from({ length: 5 }, (_, index) => legacy(index));
        const sourceSnapshot = JSON.stringify(entries);
        const repository = new TrackRepository(
            new FakeIDBFactory(),
            'migration-five'
        );
        const service = new TrackService(repository);
        await service.migrateLegacy(entries);
        await service.migrateLegacy(entries);
        const migrated = await repository.list();
        expect(migrated).toHaveLength(5);
        expect(
            migrated.every((track) => track.quality.geometry === 'approximate')
        ).toBe(true);
        expect(migrated[0].quality.timing).toBe('unknown');
        expect(migrated[0].stats.originalPointCount).toBeGreaterThan(500);
        expect(migrated[0].place).toEqual(
            expect.objectContaining({ countryName: 'Suisse' })
        );
        expect(JSON.stringify(entries)).toBe(sourceSnapshot);
    });

    it('resumes after an interrupted entry and never duplicates completed IDs', async () => {
        const repository = new TrackRepository(
            new FakeIDBFactory(),
            'migration-resume'
        );
        const service = new TrackService(repository);
        const save = vi.spyOn(repository, 'save');
        save.mockRejectedValueOnce(
            new DOMException('interrupted', 'AbortError')
        );
        await expect(
            service.migrateLegacy([legacy(0), legacy(1)])
        ).rejects.toThrow();
        vi.restoreAllMocks();
        await service.migrateLegacy([legacy(0), legacy(1)]);
        expect(await repository.list()).toHaveLength(2);
    });

    it('accepts an empty source and marks migration complete', async () => {
        const repository = new TrackRepository(
            new FakeIDBFactory(),
            'migration-empty'
        );
        const service = new TrackService(repository);
        await service.migrateLegacy([]);
        expect(await repository.list()).toEqual([]);
    });

    it('isolates a corrupt legacy entry without blocking valid data', async () => {
        const repository = new TrackRepository(
            new FakeIDBFactory(),
            'migration-corrupt'
        );
        const service = new TrackService(repository);
        const corrupt = legacy(0);
        corrupt.simplifiedPoints[0].lat = Number.NaN;
        await service.migrateLegacy([corrupt, legacy(1)]);
        expect((await repository.list()).map((track) => track.id)).toEqual([
            'legacy:old-1',
        ]);
    });
});
