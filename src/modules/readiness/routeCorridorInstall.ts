import {
    deleteOfflineTileResources,
    hasOfflineTileResource,
} from '../tileLoader';
import { isTileReferencedByCachedZone } from '../cachedZones';
import type { RouteCorridorPlanV1 } from './routeCorridor';
import {
    buildCorridorDownloadQueue,
    downloadRouteCorridor,
    type CorridorDownloadOptions,
    type CorridorDownloadProgress,
    type CorridorDownloadResource,
    type CorridorDownloadResult,
} from './routeCorridorDownload';
import {
    CorridorManifestRepository,
    type CorridorManifestResourceV1,
    type CorridorManifestStore,
    type CorridorManifestV1,
} from './CorridorManifestRepository';

export interface RouteCorridorInstallOptions {
    isPro: boolean;
    replaceFree?: boolean;
    signal?: AbortSignal;
    concurrency?: number;
    networkAllowed?: boolean;
    onProgress?: (progress: CorridorDownloadProgress) => void;
}

export type RouteCorridorInstallResult =
    | {
          status: 'replacement-required';
          existingManifest: CorridorManifestV1;
      }
    | {
          status: CorridorDownloadResult['status'];
          manifest: CorridorManifestV1;
          deletedResourceCount: number;
      };

export interface RouteCorridorInstallDependencies {
    buildQueue?: typeof buildCorridorDownloadQueue;
    download?: typeof downloadRouteCorridor;
    hasOfflineResource?: (url: string) => Promise<boolean>;
    deleteOfflineResources?: (urls: Iterable<string>) => Promise<number>;
    isResourceProtected?: (
        resource: CorridorManifestResourceV1
    ) => boolean | Promise<boolean>;
    now?: () => Date;
}

function resourceKey(resource: CorridorDownloadResource): string {
    return `${resource.type}|${resource.url}`;
}

function fingerprintQueue(queue: CorridorDownloadResource[]): string {
    let hash = 0x811c9dc5;
    for (const resource of queue) {
        const token = `${resourceKey(resource)};`;
        for (let index = 0; index < token.length; index++) {
            hash ^= token.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193);
        }
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

async function inspectExistingCache(
    queue: CorridorDownloadResource[],
    inspect: (url: string) => Promise<boolean>
): Promise<Set<string>> {
    const present = new Set<string>();
    let nextIndex = 0;
    const workers = Array.from(
        { length: Math.min(8, queue.length) },
        async () => {
            while (nextIndex < queue.length) {
                const resource = queue[nextIndex++];
                if (await inspect(resource.url)) present.add(resource.url);
            }
        }
    );
    await Promise.all(workers);
    return present;
}

function summarizeResources(resources: CorridorManifestResourceV1[]) {
    const successfulResourceCount = resources.filter(
        (resource) => resource.state === 'available'
    ).length;
    const failedResourceCount = resources.filter(
        (resource) => resource.state === 'failed'
    ).length;
    return {
        processedResourceCount: successfulResourceCount + failedResourceCount,
        successfulResourceCount,
        failedResourceCount,
        totalResourceCount: resources.length,
        sizeBytes: resources.reduce(
            (total, resource) => total + resource.sizeBytes,
            0
        ),
    };
}

export class RouteCorridorInstallService {
    private readonly buildQueue: typeof buildCorridorDownloadQueue;
    private readonly download: typeof downloadRouteCorridor;
    private readonly hasOfflineResource: (url: string) => Promise<boolean>;
    private readonly deleteOfflineResources: (
        urls: Iterable<string>
    ) => Promise<number>;
    private readonly isResourceProtected: (
        resource: CorridorManifestResourceV1
    ) => boolean | Promise<boolean>;
    private readonly now: () => Date;

    constructor(
        private readonly manifests: CorridorManifestStore,
        dependencies: RouteCorridorInstallDependencies = {}
    ) {
        this.buildQueue = dependencies.buildQueue ?? buildCorridorDownloadQueue;
        this.download = dependencies.download ?? downloadRouteCorridor;
        this.hasOfflineResource =
            dependencies.hasOfflineResource ?? hasOfflineTileResource;
        this.deleteOfflineResources =
            dependencies.deleteOfflineResources ?? deleteOfflineTileResources;
        this.isResourceProtected =
            dependencies.isResourceProtected ??
            ((resource) =>
                isTileReferencedByCachedZone(
                    resource.zoom,
                    resource.tx,
                    resource.ty
                ));
        this.now = dependencies.now ?? (() => new Date());
    }

    public async install(
        plan: RouteCorridorPlanV1,
        options: RouteCorridorInstallOptions
    ): Promise<RouteCorridorInstallResult> {
        const queue = this.buildQueue(plan);
        const manifestId = `${plan.routeId}:${fingerprintQueue(queue)}`;
        const existingManifests = await this.manifests.list();
        const existingManifest =
            existingManifests.find((manifest) => manifest.id === manifestId) ??
            null;
        const activeFree = options.isPro
            ? null
            : (existingManifests.find(
                  (manifest) =>
                      manifest.entitlement === 'free' &&
                      manifest.active &&
                      manifest.id !== manifestId
              ) ?? null);
        if (activeFree && !options.replaceFree) {
            return {
                status: 'replacement-required',
                existingManifest: activeFree,
            };
        }

        const managedUrls = new Set(
            existingManifests.flatMap((manifest) =>
                manifest.resources
                    .filter((resource) => resource.managed)
                    .map((resource) => resource.url)
            )
        );
        const cachedBefore = await inspectExistingCache(
            queue,
            this.hasOfflineResource
        );
        const previousByKey = new Map(
            existingManifest?.resources.map((resource) => [
                resourceKey(resource),
                resource,
            ]) ?? []
        );
        const resources: CorridorManifestResourceV1[] = queue.map(
            (resource) => {
                const previous = previousByKey.get(resourceKey(resource));
                return {
                    ...resource,
                    state:
                        cachedBefore.has(resource.url) ||
                        previous?.state === 'available'
                            ? 'available'
                            : 'pending',
                    sizeBytes: previous?.sizeBytes ?? 0,
                    managed:
                        previous?.managed === true ||
                        managedUrls.has(resource.url),
                };
            }
        );
        const resourceByKey = new Map(
            resources.map((resource) => [resourceKey(resource), resource])
        );
        const now = this.now().toISOString();
        let manifest: CorridorManifestV1 = {
            schemaVersion: 1,
            id: manifestId,
            routeId: plan.routeId,
            entitlement: options.isPro ? 'pro' : 'free',
            active: existingManifest?.active ?? false,
            radiusMeters: plan.radiusMeters,
            minLod: plan.minLod,
            maxLod: plan.maxLod,
            status: 'downloading',
            createdAt: existingManifest?.createdAt ?? now,
            updatedAt: now,
            ...summarizeResources(resources),
            resources,
        };
        await this.manifests.save(manifest);

        const acquiredUrls = new Set<string>();
        const downloadOptions: CorridorDownloadOptions = {
            signal: options.signal,
            concurrency: options.concurrency,
            networkAllowed: options.networkAllowed,
            onProgress: options.onProgress,
            onResourceSettled: (resource, blob) => {
                const stored = resourceByKey.get(resourceKey(resource));
                if (!stored) return;
                if (blob && blob.size > 0) {
                    stored.state = 'available';
                    stored.sizeBytes = blob.size;
                    acquiredUrls.add(resource.url);
                } else {
                    stored.state = 'failed';
                    stored.sizeBytes = 0;
                }
            },
        };
        const result = await this.download(plan, downloadOptions);

        const cachedAfter = await inspectExistingCache(
            queue.filter((resource) => acquiredUrls.has(resource.url)),
            this.hasOfflineResource
        );
        for (const resource of resources) {
            if (
                acquiredUrls.has(resource.url) &&
                !cachedBefore.has(resource.url) &&
                cachedAfter.has(resource.url)
            ) {
                resource.managed = true;
            }
        }
        manifest = {
            ...manifest,
            status: result.status,
            updatedAt: this.now().toISOString(),
            ...summarizeResources(resources),
            resources,
        };

        if (result.status !== 'completed') {
            // L'ancien Free reste actif jusqu'à la complétion du remplaçant.
            if (activeFree) manifest.active = false;
            await this.manifests.save(manifest);
            return {
                status: result.status,
                manifest,
                deletedResourceCount: 0,
            };
        }

        manifest.active = true;
        const replaced = options.isPro
            ? []
            : existingManifests.filter(
                  (candidate) =>
                      candidate.entitlement === 'free' &&
                      candidate.active &&
                      candidate.id !== manifest.id
              );
        const replacedIds = new Set(replaced.map((candidate) => candidate.id));
        const remaining = existingManifests.filter(
            (candidate) =>
                candidate.id !== manifest.id && !replacedIds.has(candidate.id)
        );
        const changedRemaining = new Map<string, CorridorManifestV1>();
        const urlsToDelete = new Set<string>();
        const currentByUrl = new Map(
            manifest.resources.map((resource) => [resource.url, resource])
        );

        for (const old of replaced) {
            for (const resource of old.resources) {
                if (!resource.managed) continue;
                const current = currentByUrl.get(resource.url);
                if (current) {
                    current.managed = true;
                    continue;
                }
                const shared = remaining.find((candidate) =>
                    candidate.resources.some(
                        (entry) => entry.url === resource.url
                    )
                );
                if (shared) {
                    const copy =
                        changedRemaining.get(shared.id) ??
                        structuredClone(shared);
                    const entry = copy.resources.find(
                        (candidate) => candidate.url === resource.url
                    );
                    if (entry) entry.managed = true;
                    copy.updatedAt = this.now().toISOString();
                    changedRemaining.set(copy.id, copy);
                } else if (!(await this.isResourceProtected(resource))) {
                    urlsToDelete.add(resource.url);
                }
            }
        }

        await this.manifests.applyChanges(
            [manifest, ...changedRemaining.values()],
            [...replacedIds]
        );
        let deletedResourceCount = 0;
        if (urlsToDelete.size > 0) {
            try {
                deletedResourceCount =
                    await this.deleteOfflineResources(urlsToDelete);
            } catch {
                // Le manifeste est la source de vérité. Un échec de nettoyage
                // laisse au pire des blobs orphelins, jamais un corridor incomplet.
            }
        }
        return {
            status: result.status,
            manifest,
            deletedResourceCount,
        };
    }
}

export function createRouteCorridorInstallService(
    factory: IDBFactory = globalThis.indexedDB
): RouteCorridorInstallService {
    return new RouteCorridorInstallService(
        new CorridorManifestRepository(factory)
    );
}
