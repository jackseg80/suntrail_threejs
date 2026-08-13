import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
    CORRIDOR_MANIFEST_STORE_NAME,
    CorridorManifestRepository,
    type CorridorManifestV1,
} from './CorridorManifestRepository';

function manifest(
    id: string,
    overrides: Partial<CorridorManifestV1> = {}
): CorridorManifestV1 {
    return {
        schemaVersion: 1,
        id,
        routeId: `route-${id}`,
        entitlement: 'free',
        active: true,
        radiusMeters: 1_000,
        minLod: 5,
        maxLod: 14,
        status: 'completed',
        createdAt: '2026-08-13T10:00:00.000Z',
        updatedAt: '2026-08-13T10:00:00.000Z',
        processedResourceCount: 1,
        successfulResourceCount: 1,
        failedResourceCount: 0,
        totalResourceCount: 1,
        sizeBytes: 128,
        resources: [
            {
                zoom: 14,
                tx: 8_510,
                ty: 5_790,
                type: 'color',
                url: `https://tiles.test/${id}`,
                state: 'available',
                sizeBytes: 128,
                managed: true,
            },
        ],
        ...overrides,
    };
}

describe('CorridorManifestRepository', () => {
    it('persiste et relit un manifeste après fermeture de la connexion', async () => {
        const factory = new FakeIDBFactory();
        const first = new CorridorManifestRepository(
            factory,
            'corridor-persistence'
        );
        await first.save(manifest('one'));
        await first.close();

        const reopened = new CorridorManifestRepository(
            factory,
            'corridor-persistence'
        );
        expect(await reopened.get('one')).toEqual(manifest('one'));
        await reopened.close();
    });

    it('applique activation et remplacement dans une transaction unique', async () => {
        const repository = new CorridorManifestRepository(
            new FakeIDBFactory(),
            'corridor-replacement'
        );
        await repository.save(manifest('old'));
        await repository.applyChanges([manifest('new')], ['old']);

        expect((await repository.list()).map((item) => item.id)).toEqual([
            'new',
        ]);
    });

    it('rejette un manifeste incohérent avant toute écriture', async () => {
        const repository = new CorridorManifestRepository(
            new FakeIDBFactory(),
            'corridor-invalid'
        );
        const invalid = manifest('invalid', {
            totalResourceCount: 2,
        });

        await expect(repository.save(invalid)).rejects.toMatchObject({
            code: 'corrupt-record',
        });
        expect(await repository.list()).toEqual([]);
    });

    it('crée les index nécessaires sans toucher à la base des routes', async () => {
        const factory = new FakeIDBFactory();
        const repository = new CorridorManifestRepository(
            factory,
            'corridor-indexes'
        );
        await repository.save(manifest('indexed'));
        await repository.close();

        const request = factory.open('corridor-indexes', 1);
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const store = database
            .transaction(CORRIDOR_MANIFEST_STORE_NAME, 'readonly')
            .objectStore(CORRIDOR_MANIFEST_STORE_NAME);
        expect(Array.from(store.indexNames)).toEqual(
            expect.arrayContaining(['routeId', 'active', 'updatedAt'])
        );
        database.close();
    });
});
