import {
    IDBFactory as FakeIDBFactory,
    IDBObjectStore as FakeIDBObjectStore,
} from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    GUIDANCE_PLAN_STORE_NAME,
    ROUTE_DATABASE_VERSION,
    ROUTE_STORE_NAME,
    RouteRepository,
} from './RouteRepository';
import {
    createPreparedRouteFromComputation,
    type PreparedRouteV1,
} from './preparedRoute';
import { buildGuidancePlan } from '../guidance/guidancePlan';

function buildRoute(id: string, favorite = false): PreparedRouteV1 {
    return createPreparedRouteFromComputation({
        id,
        name: `Route ${id}`,
        activityProfile: 'foot-hiking',
        waypoints: [
            { lat: 46.5, lon: 7.5 },
            { lat: 46.6, lon: 7.6 },
        ],
        computation: {
            name: `Route ${id}`,
            geometry: [
                { lat: 46.5, lon: 7.5, ele: 1000 },
                { lat: 46.6, lon: 7.6, ele: 1200 },
            ],
            distance: 4,
            duration: 75,
            ascent: 250,
            descent: 50,
            routingSource: 'ors',
            guidanceQuality: 'full',
            technicalDifficulty: {
                status: 'known',
                source: 'ors',
                sacLevel: 2,
                coveragePercent: 100,
                reason: 'complete',
            },
            dataCoverage: {
                trailDifficulty: 100,
                steepness: 100,
                surface: 100,
                wayType: 100,
            },
        },
        plannedStartAt: null,
        plannedPaceKmh: 4,
        favorite,
        now: '2026-08-09T10:00:00.000Z',
    });
}

function openDatabase(
    factory: IDBFactory,
    name: string,
    version: number,
    upgrade?: (database: IDBDatabase, transaction: IDBTransaction) => void
): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = factory.open(name, version);
        request.onupgradeneeded = () =>
            upgrade?.(request.result, request.transaction!);
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

describe('RouteRepository with a fresh fake-indexeddb factory', () => {
    it('supports CRUD and deterministic favorite-first listing', async () => {
        const repository = new RouteRepository(
            new FakeIDBFactory(),
            'routes-crud'
        );
        await repository.save(buildRoute('route-1'));
        await repository.save(buildRoute('route-2', true));

        expect((await repository.get('route-1'))?.name).toBe('Route route-1');
        expect((await repository.list()).map((route) => route.id)).toEqual([
            'route-2',
            'route-1',
        ]);

        await repository.delete('route-1');
        expect(await repository.get('route-1')).toBeNull();
        await repository.close();
    });

    it('writes batches atomically by validating every record first', async () => {
        const repository = new RouteRepository(
            new FakeIDBFactory(),
            'routes-atomic'
        );
        const invalid = {
            ...buildRoute('route-bad'),
            geometry: [],
        } as PreparedRouteV1;

        await expect(
            repository.saveMany([buildRoute('route-good'), invalid])
        ).rejects.toThrow(/geometry/);
        expect(await repository.list()).toEqual([]);
    });

    it('serializes concurrent IndexedDB transactions without losing routes', async () => {
        const repository = new RouteRepository(
            new FakeIDBFactory(),
            'routes-concurrent'
        );
        await Promise.all([
            repository.save(buildRoute('route-1')),
            repository.save(buildRoute('route-2')),
            repository.save(buildRoute('route-3')),
        ]);
        expect(await repository.list()).toHaveLength(3);
    });

    it('upgrades a version 1 database additively and creates indexes', async () => {
        const factory = new FakeIDBFactory();
        const legacyDatabase = await openDatabase(
            factory,
            'routes-upgrade',
            1,
            (database) => {
                database.createObjectStore(ROUTE_STORE_NAME, {
                    keyPath: 'id',
                });
            }
        );
        const transaction = legacyDatabase.transaction(
            ROUTE_STORE_NAME,
            'readwrite'
        );
        transaction.objectStore(ROUTE_STORE_NAME).put(buildRoute('route-1'));
        await transactionDone(transaction);
        legacyDatabase.close();

        const repository = new RouteRepository(factory, 'routes-upgrade');
        await repository.open();
        expect(await repository.get('route-1')).not.toBeNull();
        await repository.close();

        const upgraded = await openDatabase(
            factory,
            'routes-upgrade',
            ROUTE_DATABASE_VERSION
        );
        const store = upgraded
            .transaction(ROUTE_STORE_NAME, 'readonly')
            .objectStore(ROUTE_STORE_NAME);
        expect(Array.from(store.indexNames)).toEqual(
            expect.arrayContaining(['updatedAt', 'favorite', 'name'])
        );
        expect(Array.from(upgraded.objectStoreNames)).toContain(
            GUIDANCE_PLAN_STORE_NAME
        );
        upgraded.close();
    });

    it('migrates a v2 route database and stores the guidance plan separately', async () => {
        const factory = new FakeIDBFactory();
        const database = await openDatabase(
            factory,
            'routes-guidance-upgrade',
            2,
            (legacy) => {
                const store = legacy.createObjectStore(ROUTE_STORE_NAME, {
                    keyPath: 'id',
                });
                store.createIndex('updatedAt', 'updatedAt');
                store.createIndex('favorite', 'favorite');
                store.createIndex('name', 'name');
            }
        );
        const transaction = database.transaction(ROUTE_STORE_NAME, 'readwrite');
        const route = buildRoute('route-with-plan');
        transaction.objectStore(ROUTE_STORE_NAME).put(route);
        await transactionDone(transaction);
        database.close();

        const repository = new RouteRepository(
            factory,
            'routes-guidance-upgrade'
        );
        const plan = buildGuidancePlan(route, {
            now: '2026-08-11T00:00:00.000Z',
        });
        await repository.saveRouteWithPlan(route, plan);
        expect(await repository.getGuidancePlan(route.id)).toEqual(plan);

        await repository.delete(route.id);
        expect(await repository.getGuidancePlan(route.id)).toBeNull();
        await repository.close();
    });

    it('skips corrupt records in lists and lets callers delete them', async () => {
        const factory = new FakeIDBFactory();
        const repository = new RouteRepository(factory, 'routes-corrupt');
        await repository.save(buildRoute('route-valid'));
        await repository.close();
        const database = await openDatabase(
            factory,
            'routes-corrupt',
            ROUTE_DATABASE_VERSION
        );
        const transaction = database.transaction(ROUTE_STORE_NAME, 'readwrite');
        transaction
            .objectStore(ROUTE_STORE_NAME)
            .put({ id: 'route-corrupt', schemaVersion: 1, geometry: [] });
        await transactionDone(transaction);
        database.close();

        expect((await repository.list()).map((route) => route.id)).toEqual([
            'route-valid',
        ]);
        expect(repository.getDiagnostics().corruptedIds).toEqual([
            'route-corrupt',
        ]);
        await expect(repository.get('route-corrupt')).rejects.toMatchObject({
            code: 'corrupt-record',
        });
        await repository.delete('route-corrupt');
        expect(repository.getDiagnostics().corruptedIds).toEqual([]);
    });

    it('normalizes quota errors into a recoverable repository error', async () => {
        const repository = new RouteRepository(
            new FakeIDBFactory(),
            'routes-quota'
        );
        await repository.open();
        vi.spyOn(FakeIDBObjectStore.prototype, 'put').mockImplementation(() => {
            throw new DOMException('Quota reached', 'QuotaExceededError');
        });

        await expect(repository.save(buildRoute('route-1'))).rejects.toEqual(
            expect.objectContaining({ code: 'quota' })
        );
    });

    it('closes its connection so a later database upgrade is not blocked', async () => {
        const factory = new FakeIDBFactory();
        const repository = new RouteRepository(factory, 'routes-close');
        await repository.open();
        await repository.close();
        const upgraded = await openDatabase(
            factory,
            'routes-close',
            ROUTE_DATABASE_VERSION + 1
        );
        expect(upgraded.version).toBe(ROUTE_DATABASE_VERSION + 1);
        upgraded.close();
    });
});
