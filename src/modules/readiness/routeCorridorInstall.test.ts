import { describe, expect, it, vi } from 'vitest';
import type { RouteCorridorPlanV1 } from './routeCorridor';
import type {
    CorridorDownloadOptions,
    CorridorDownloadResource,
    CorridorDownloadResult,
} from './routeCorridorDownload';
import type {
    CorridorManifestStore,
    CorridorManifestV1,
} from './CorridorManifestRepository';
import { RouteCorridorInstallService } from './routeCorridorInstall';

class MemoryManifestStore implements CorridorManifestStore {
    private readonly records = new Map<string, CorridorManifestV1>();

    constructor(initial: CorridorManifestV1[] = []) {
        for (const manifest of initial) {
            this.records.set(manifest.id, structuredClone(manifest));
        }
    }

    async list(): Promise<CorridorManifestV1[]> {
        return [...this.records.values()].map((value) =>
            structuredClone(value)
        );
    }

    async get(id: string): Promise<CorridorManifestV1 | null> {
        const value = this.records.get(id);
        return value ? structuredClone(value) : null;
    }

    async save(manifest: CorridorManifestV1): Promise<void> {
        this.records.set(manifest.id, structuredClone(manifest));
    }

    async applyChanges(
        upserts: CorridorManifestV1[],
        deleteIds: string[]
    ): Promise<void> {
        for (const manifest of upserts) {
            this.records.set(manifest.id, structuredClone(manifest));
        }
        for (const id of deleteIds) this.records.delete(id);
    }
}

function plan(routeId = 'route-new'): RouteCorridorPlanV1 {
    return {
        schemaVersion: 1,
        routeId,
        radiusMeters: 1_000,
        minLod: 14,
        maxLod: 14,
        tiles: [{ zoom: 14, tx: 8_510, ty: 5_790 }],
        tileCount: 1,
        estimatedSizeBytes: 80 * 1024,
    };
}

function resource(url: string): CorridorDownloadResource {
    return {
        zoom: 14,
        tx: 8_510,
        ty: 5_790,
        type: 'color',
        url,
    };
}

function oldFreeManifest(): CorridorManifestV1 {
    return {
        schemaVersion: 1,
        id: 'old-free',
        routeId: 'route-old',
        entitlement: 'free',
        active: true,
        radiusMeters: 1_000,
        minLod: 14,
        maxLod: 14,
        status: 'completed',
        createdAt: '2026-08-13T09:00:00.000Z',
        updatedAt: '2026-08-13T09:00:00.000Z',
        processedResourceCount: 2,
        successfulResourceCount: 2,
        failedResourceCount: 0,
        totalResourceCount: 2,
        sizeBytes: 200,
        resources: [
            {
                ...resource('https://tiles.test/shared'),
                state: 'available',
                sizeBytes: 100,
                managed: true,
            },
            {
                ...resource('https://tiles.test/old-exclusive'),
                state: 'available',
                sizeBytes: 100,
                managed: true,
            },
        ],
    };
}

function downloader(
    queue: CorridorDownloadResource[],
    cache: Set<string>,
    status: CorridorDownloadResult['status'] = 'completed'
) {
    return vi.fn(
        async (
            _plan: RouteCorridorPlanV1,
            options: CorridorDownloadOptions = {}
        ): Promise<CorridorDownloadResult> => {
            let successful = 0;
            let failed = 0;
            let sizeBytes = 0;
            const processed =
                status === 'cancelled' ? queue.slice(0, 1) : queue;
            for (const item of processed) {
                const blob =
                    status === 'partial' && item.url.endsWith('/new')
                        ? null
                        : new Blob(['x'.repeat(120)]);
                if (blob) {
                    successful++;
                    sizeBytes += blob.size;
                    cache.add(item.url);
                } else {
                    failed++;
                }
                options.onResourceSettled?.(item, blob);
            }
            return {
                status,
                processedResourceCount: successful + failed,
                successfulResourceCount: successful,
                failedResourceCount: failed,
                totalResourceCount: queue.length,
                sizeBytes,
            };
        }
    );
}

describe('RouteCorridorInstallService', () => {
    it('demande une confirmation avant de remplacer le corridor Free actif', async () => {
        const store = new MemoryManifestStore([oldFreeManifest()]);
        const queue = [resource('https://tiles.test/new')];
        const download = downloader(queue, new Set());
        const service = new RouteCorridorInstallService(store, {
            buildQueue: vi.fn(() => queue),
            download,
            hasOfflineResource: vi.fn(async () => false),
        });

        await expect(
            service.install(plan(), { isPro: false })
        ).resolves.toEqual({
            status: 'replacement-required',
            existingManifest: oldFreeManifest(),
        });
        expect(download).not.toHaveBeenCalled();
        expect(await store.list()).toHaveLength(1);
    });

    it('garde l’ancien corridor Free actif si le remplaçant reste partiel', async () => {
        const store = new MemoryManifestStore([oldFreeManifest()]);
        const queue = [resource('https://tiles.test/new')];
        const cache = new Set<string>();
        const service = new RouteCorridorInstallService(store, {
            buildQueue: vi.fn(() => queue),
            download: downloader(queue, cache, 'partial'),
            hasOfflineResource: vi.fn(async (url) => cache.has(url)),
            now: () => new Date('2026-08-13T10:00:00.000Z'),
        });

        const result = await service.install(plan(), {
            isPro: false,
            replaceFree: true,
        });

        expect(result.status).toBe('partial');
        const manifests = await store.list();
        expect(manifests).toHaveLength(2);
        expect(manifests.find((item) => item.id === 'old-free')?.active).toBe(
            true
        );
        expect(manifests.find((item) => item.id !== 'old-free')?.active).toBe(
            false
        );
    });

    it('active le remplaçant complet, transfère le partage et nettoie l’exclusif', async () => {
        const store = new MemoryManifestStore([oldFreeManifest()]);
        const queue = [
            resource('https://tiles.test/shared'),
            resource('https://tiles.test/new'),
        ];
        const cache = new Set([
            'https://tiles.test/shared',
            'https://tiles.test/old-exclusive',
        ]);
        const deleted: string[] = [];
        const service = new RouteCorridorInstallService(store, {
            buildQueue: vi.fn(() => queue),
            download: downloader(queue, cache),
            hasOfflineResource: vi.fn(async (url) => cache.has(url)),
            deleteOfflineResources: vi.fn(async (urls) => {
                for (const url of urls) {
                    deleted.push(url);
                    cache.delete(url);
                }
                return deleted.length;
            }),
            now: () => new Date('2026-08-13T10:00:00.000Z'),
        });

        const result = await service.install(plan(), {
            isPro: false,
            replaceFree: true,
        });

        expect(result).toMatchObject({
            status: 'completed',
            deletedResourceCount: 1,
        });
        const manifests = await store.list();
        expect(manifests).toHaveLength(1);
        expect(manifests[0].active).toBe(true);
        expect(
            manifests[0].resources.find(
                (item) => item.url === 'https://tiles.test/shared'
            )?.managed
        ).toBe(true);
        expect(deleted).toEqual(['https://tiles.test/old-exclusive']);
        expect(cache.has('https://tiles.test/shared')).toBe(true);
    });

    it('conserve plusieurs corridors Pro sans suppression croisée', async () => {
        const oldPro = {
            ...oldFreeManifest(),
            id: 'old-pro',
            entitlement: 'pro' as const,
        };
        const store = new MemoryManifestStore([oldPro]);
        const queue = [resource('https://tiles.test/new')];
        const cache = new Set<string>();
        const deleteOfflineResources = vi.fn(async () => 0);
        const service = new RouteCorridorInstallService(store, {
            buildQueue: vi.fn(() => queue),
            download: downloader(queue, cache),
            hasOfflineResource: vi.fn(async (url) => cache.has(url)),
            deleteOfflineResources,
        });

        await expect(
            service.install(plan(), { isPro: true })
        ).resolves.toMatchObject({ status: 'completed' });
        expect(await store.list()).toHaveLength(2);
        expect(deleteOfflineResources).not.toHaveBeenCalled();
    });

    it('transmet l’interdiction réseau au moteur sans modifier la reprise locale', async () => {
        const store = new MemoryManifestStore();
        const queue = [resource('https://tiles.test/new')];
        const cache = new Set<string>();
        const download = downloader(queue, cache);
        const service = new RouteCorridorInstallService(store, {
            buildQueue: vi.fn(() => queue),
            download,
            hasOfflineResource: vi.fn(async (url) => cache.has(url)),
        });

        await service.install(plan(), {
            isPro: false,
            networkAllowed: false,
        });

        expect(download).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ networkAllowed: false })
        );
    });

    it('ne supprime pas une ressource encore couverte par une zone manuelle', async () => {
        const store = new MemoryManifestStore([oldFreeManifest()]);
        const queue = [
            resource('https://tiles.test/shared'),
            resource('https://tiles.test/new'),
        ];
        const cache = new Set([
            'https://tiles.test/old-exclusive',
            'https://tiles.test/shared',
        ]);
        const deleteOfflineResources = vi.fn(async () => 0);
        const isResourceProtected = vi.fn(
            async (item: CorridorDownloadResource) =>
                item.url === 'https://tiles.test/old-exclusive'
        );
        const service = new RouteCorridorInstallService(store, {
            buildQueue: vi.fn(() => queue),
            download: downloader(queue, cache),
            hasOfflineResource: vi.fn(async (url) => cache.has(url)),
            deleteOfflineResources,
            isResourceProtected,
        });

        await service.install(plan(), {
            isPro: false,
            replaceFree: true,
        });

        expect(isResourceProtected).toHaveBeenCalled();
        expect(deleteOfflineResources).not.toHaveBeenCalled();
    });
});
