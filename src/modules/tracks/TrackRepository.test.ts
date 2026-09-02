import {
    IDBFactory as FakeIDBFactory,
    IDBObjectStore as FakeIDBObjectStore,
} from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    TRACK_CHUNK_STORE_NAME,
    TRACK_DATABASE_VERSION,
    TRACK_STORE_NAME,
    TrackRepository,
} from './TrackRepository';
import {
    STORED_TRACK_SCHEMA_VERSION,
    computeTrackBounds,
    type StoredTrackV1,
} from './storedTrack';

function buildTrack(id: string, pointCount = 3): StoredTrackV1 {
    const geometry = Array.from({ length: pointCount }, (_, index) => ({
        lat: 46 + index / 100_000,
        lon: 7 + index / 100_000,
        ele: 1000 + index,
        timestamp: 1_700_000_000_000 + index * 1000,
        accuracy: 3 + (index % 2),
    }));
    return {
        schemaVersion: STORED_TRACK_SCHEMA_VERSION,
        id,
        origin: { type: 'recording', sourceId: id },
        name: `Crêt 🥾 ${id}`,
        color: '#ef4444',
        geometry,
        stats: {
            distanceKm: pointCount / 100,
            ascentMeters: pointCount,
            descentMeters: 0,
            durationSeconds: pointCount - 1,
            pointCount,
            provenance: 'recording',
        },
        bounds: computeTrackBounds(geometry),
        quality: {
            geometry: 'full',
            timing: 'full',
            elevation: 'full',
            accuracy: 'full',
        },
        createdAt: '2026-09-02T08:00:00.000Z',
        updatedAt: '2026-09-02T08:00:00.000Z',
    };
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = factory.open(name, TRACK_DATABASE_VERSION);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

afterEach(() => vi.restoreAllMocks());

describe('TrackRepository', () => {
    it('supports CRUD, Unicode names and deterministic ordering', async () => {
        const repository = new TrackRepository(
            new FakeIDBFactory(),
            'tracks-crud'
        );
        const older = buildTrack('recording:old');
        const newer = {
            ...buildTrack('recording:new'),
            updatedAt: '2026-09-02T09:00:00.000Z',
        };
        await Promise.all([repository.save(older), repository.save(newer)]);
        expect((await repository.get(older.id))?.name).toBe(
            'Crêt 🥾 recording:old'
        );
        expect((await repository.list()).map((track) => track.id)).toEqual([
            newer.id,
            older.id,
        ]);
        await repository.rename(older.id, 'Dent d’Oche 🌄');
        expect((await repository.get(older.id))?.name).toBe('Dent d’Oche 🌄');
        await repository.delete(newer.id);
        expect(await repository.get(newer.id)).toBeNull();
    });

    it('round-trips a large geometry across ordered chunks', async () => {
        const repository = new TrackRepository(
            new FakeIDBFactory(),
            'tracks-large'
        );
        const track = buildTrack('recording:large', 12_345);
        await repository.save(track);
        const restored = await repository.get(track.id);
        expect(restored?.geometry).toHaveLength(12_345);
        expect(restored?.geometry[12_344]).toEqual(track.geometry[12_344]);
    });

    it('overwrites idempotently and removes obsolete chunks', async () => {
        const repository = new TrackRepository(
            new FakeIDBFactory(),
            'tracks-idempotent'
        );
        await repository.save(buildTrack('recording:same', 2_500));
        await repository.save(buildTrack('recording:same', 2));
        expect((await repository.get('recording:same'))?.geometry).toHaveLength(
            2
        );
        expect(await repository.list()).toHaveLength(1);
    });

    it('serializes concurrent saves without losing tracks', async () => {
        const repository = new TrackRepository(
            new FakeIDBFactory(),
            'tracks-concurrent'
        );
        await Promise.all(
            Array.from({ length: 12 }, (_, index) =>
                repository.save(buildTrack(`recording:${index}`, 1_200))
            )
        );
        expect(await repository.list()).toHaveLength(12);
    });

    it('keeps the previous value when a replacement transaction aborts', async () => {
        const repository = new TrackRepository(
            new FakeIDBFactory(),
            'tracks-rollback'
        );
        const original = buildTrack('recording:rollback', 2_100);
        await repository.save(original);
        const put = vi.spyOn(FakeIDBObjectStore.prototype, 'put');
        put.mockImplementationOnce(() => {
            throw new DOMException('interrupted', 'AbortError');
        });
        await expect(
            repository.save({ ...buildTrack(original.id, 2), name: 'changed' })
        ).rejects.toMatchObject({ code: 'transaction' });
        expect((await repository.get(original.id))?.geometry).toHaveLength(
            2_100
        );
    });

    it('normalizes quota failures without deleting the existing track', async () => {
        const repository = new TrackRepository(
            new FakeIDBFactory(),
            'tracks-quota'
        );
        await repository.save(buildTrack('recording:safe'));
        vi.spyOn(FakeIDBObjectStore.prototype, 'put').mockImplementation(() => {
            throw new DOMException('full', 'QuotaExceededError');
        });
        await expect(
            repository.save(buildTrack('recording:new'))
        ).rejects.toMatchObject({ code: 'quota' });
        vi.restoreAllMocks();
        expect(await repository.get('recording:safe')).not.toBeNull();
    });

    it('reports missing chunks as corruption and preserves the raw record', async () => {
        const factory = new FakeIDBFactory();
        const repository = new TrackRepository(factory, 'tracks-corrupt');
        await repository.save(buildTrack('recording:corrupt', 1_500));
        await repository.close();
        const database = await openDatabase(factory, 'tracks-corrupt');
        const transaction = database.transaction(
            TRACK_CHUNK_STORE_NAME,
            'readwrite'
        );
        transaction
            .objectStore(TRACK_CHUNK_STORE_NAME)
            .delete('recording:corrupt:00000001');
        await transactionDone(transaction);
        database.close();
        expect(await repository.list()).toEqual([]);
        expect(repository.getDiagnostics().corruptedIds).toEqual([
            'recording:corrupt',
        ]);
        await expect(repository.get('recording:corrupt')).rejects.toMatchObject(
            { code: 'corrupt-record' }
        );
    });

    it('classifies an unknown record schema separately from corruption', async () => {
        const factory = new FakeIDBFactory();
        const repository = new TrackRepository(factory, 'tracks-version');
        await repository.save(buildTrack('recording:future'));
        await repository.close();
        const database = await openDatabase(factory, 'tracks-version');
        const transaction = database.transaction(TRACK_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(TRACK_STORE_NAME);
        const header = await new Promise<any>((resolve) => {
            const request = store.get('recording:future');
            request.onsuccess = () => resolve(request.result);
        });
        store.put({ ...header, schemaVersion: 99 });
        await transactionDone(transaction);
        database.close();
        expect(await repository.list()).toEqual([]);
        expect(repository.getDiagnostics().unknownVersionIds).toEqual([
            'recording:future',
        ]);
    });

    it('stores migration metadata independently from track data', async () => {
        const repository = new TrackRepository(
            new FakeIDBFactory(),
            'tracks-meta'
        );
        await repository.setMeta('migration', { completedIds: ['a'] });
        expect(await repository.getMeta('migration')).toEqual({
            completedIds: ['a'],
        });
    });
});
