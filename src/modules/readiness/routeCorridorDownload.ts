import {
    fetchWithCache,
    getColorUrl,
    getElevationUrl,
    getOverlayUrl,
    type TileResourceType,
} from '../tileLoader';
import {
    MAX_CORRIDOR_TILES,
    type CorridorTileRef,
    type RouteCorridorPlanV1,
} from './routeCorridor';

export type CorridorDownloadStatus = 'completed' | 'partial' | 'cancelled';

export interface CorridorDownloadResource extends CorridorTileRef {
    type: TileResourceType;
    url: string;
}

export interface CorridorDownloadProgress {
    processedResourceCount: number;
    successfulResourceCount: number;
    failedResourceCount: number;
    totalResourceCount: number;
    sizeBytes: number;
}

export interface CorridorDownloadResult extends CorridorDownloadProgress {
    status: CorridorDownloadStatus;
}

export interface CorridorDownloadOptions {
    signal?: AbortSignal;
    concurrency?: number;
    networkAllowed?: boolean;
    onProgress?: (progress: CorridorDownloadProgress) => void;
    onResourceSettled?: (
        resource: CorridorDownloadResource,
        blob: Blob | null
    ) => void;
}

export interface CorridorDownloadDependencies {
    resolveResources?: (tile: CorridorTileRef) => CorridorDownloadResource[];
    fetchResource?: (
        resource: CorridorDownloadResource,
        signal?: AbortSignal,
        networkAllowed?: boolean
    ) => Promise<Blob | null>;
}

export class CorridorDownloadError extends Error {
    constructor(public readonly code: 'invalid-plan' | 'invalid-options') {
        super(code);
        this.name = 'CorridorDownloadError';
    }
}

function defaultResolveResources(
    tile: CorridorTileRef
): CorridorDownloadResource[] {
    const { zoom, tx, ty } = tile;
    const resources: CorridorDownloadResource[] = [
        {
            ...tile,
            type: 'color',
            url: getColorUrl(tx, ty, zoom),
        },
    ];
    const { url: elevationUrl } = getElevationUrl(tx, ty, zoom, false);
    if (elevationUrl) {
        resources.push({
            ...tile,
            type: 'elevation',
            url: elevationUrl,
        });
    }
    const overlayUrl = getOverlayUrl(tx, ty, zoom);
    if (overlayUrl) {
        resources.push({ ...tile, type: 'overlay', url: overlayUrl });
    }
    return resources;
}

async function defaultFetchResource(
    resource: CorridorDownloadResource,
    signal?: AbortSignal,
    networkAllowed = true
): Promise<Blob | null> {
    return fetchWithCache(
        resource.url,
        true,
        resource.zoom,
        resource.tx,
        resource.ty,
        true,
        {
            resourceType: resource.type,
            signal,
            // Un pack seulement acheté/CDN n'est pas une preuve locale. S'il
            // n'est pas installé, la ressource courante est mise en CacheStorage.
            localOnlyPacks: true,
            requireOfflineStorage: true,
            allowNetwork: networkAllowed,
        }
    );
}

function validatePlan(plan: RouteCorridorPlanV1): void {
    if (
        plan.schemaVersion !== 1 ||
        !Array.isArray(plan.tiles) ||
        plan.tiles.length === 0 ||
        plan.tileCount !== plan.tiles.length ||
        plan.tileCount > MAX_CORRIDOR_TILES
    ) {
        throw new CorridorDownloadError('invalid-plan');
    }
}

export function buildCorridorDownloadQueue(
    plan: RouteCorridorPlanV1,
    resolveResources: (
        tile: CorridorTileRef
    ) => CorridorDownloadResource[] = defaultResolveResources
): CorridorDownloadResource[] {
    validatePlan(plan);
    const resources = new Map<string, CorridorDownloadResource>();
    for (const tile of plan.tiles) {
        for (const resource of resolveResources(tile)) {
            if (!resource.url) continue;
            resources.set(`${resource.type}|${resource.url}`, resource);
        }
    }
    if (resources.size === 0) throw new CorridorDownloadError('invalid-plan');
    return [...resources.values()];
}

/**
 * Télécharge un corridor sans supprimer les ressources acquises en cas
 * d'annulation. Relancer la même opération reprend naturellement depuis les
 * packs et CacheStorage existants, sans requête réseau pour les hits locaux.
 */
export async function downloadRouteCorridor(
    plan: RouteCorridorPlanV1,
    options: CorridorDownloadOptions = {},
    dependencies: CorridorDownloadDependencies = {}
): Promise<CorridorDownloadResult> {
    const concurrency = options.concurrency ?? 4;
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
        throw new CorridorDownloadError('invalid-options');
    }
    const queue = buildCorridorDownloadQueue(
        plan,
        dependencies.resolveResources ?? defaultResolveResources
    );
    const fetchResource = dependencies.fetchResource ?? defaultFetchResource;
    let nextIndex = 0;
    let successfulResourceCount = 0;
    let failedResourceCount = 0;
    let sizeBytes = 0;

    const progress = (): CorridorDownloadProgress => ({
        processedResourceCount: successfulResourceCount + failedResourceCount,
        successfulResourceCount,
        failedResourceCount,
        totalResourceCount: queue.length,
        sizeBytes,
    });

    options.onProgress?.(progress());
    const workers = Array.from(
        { length: Math.min(concurrency, queue.length) },
        async () => {
            while (!options.signal?.aborted) {
                const index = nextIndex++;
                if (index >= queue.length) return;
                let blob: Blob | null = null;
                try {
                    blob = await fetchResource(
                        queue[index],
                        options.signal,
                        options.networkAllowed
                    );
                } catch {
                    // L'absence reste un échec de ressource explicite.
                }
                options.onResourceSettled?.(queue[index], blob);
                if (options.signal?.aborted) return;
                if (blob && blob.size > 0) {
                    successfulResourceCount++;
                    sizeBytes += blob.size;
                } else {
                    failedResourceCount++;
                }
                options.onProgress?.(progress());
            }
        }
    );
    await Promise.all(workers);

    return {
        status: options.signal?.aborted
            ? 'cancelled'
            : failedResourceCount === 0
              ? 'completed'
              : 'partial',
        ...progress(),
    };
}
