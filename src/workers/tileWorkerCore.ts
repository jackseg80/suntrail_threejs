export const MAPTILER_BACKOFF_MAX_MS = 4000;

export function isMapTilerUrl(url: string): boolean {
    return url.includes('api.maptiler.com');
}

export type WorkerTileCacheSource = 'offline-cache' | 'worker-cache';

export interface WorkerTileCacheRead {
    blob: Blob;
    source: WorkerTileCacheSource;
}

type TileCache = Pick<Cache, 'match' | 'delete'>;

/**
 * Lit les caches persistants dans l'ordre terrain attendu : une zone
 * explicitement téléchargée reste prioritaire sur le cache de navigation,
 * même lorsque l'appareil est encore connecté.
 */
export async function readTileFromWorkerCaches(
    url: string,
    offlineCache: TileCache,
    navigationCache: TileCache
): Promise<WorkerTileCacheRead | null> {
    for (const [source, cache] of [
        ['offline-cache', offlineCache],
        ['worker-cache', navigationCache],
    ] as const) {
        try {
            const response = await cache.match(url);
            if (!response) continue;
            const blob = await response.blob();
            if (blob.size < 100) {
                await cache.delete(url);
                continue;
            }
            return { blob, source };
        } catch {
            // Un cache indisponible ne doit pas empêcher le suivant ou le réseau.
        }
    }
    return null;
}

/** Keeps the worker retry policy deterministic and independently testable. */
export class MapTilerBackoff {
    private until = 0;
    private delayMs = 500;

    isActive(now = Date.now()): boolean {
        return now < this.until;
    }

    trigger(now = Date.now()): void {
        this.until = now + this.delayMs;
        this.delayMs = Math.min(this.delayMs * 2, MAPTILER_BACKOFF_MAX_MS);
    }

    reset(): void {
        this.delayMs = 500;
        this.until = 0;
    }

    getRetryDelayMs(): number {
        return this.delayMs;
    }
}
