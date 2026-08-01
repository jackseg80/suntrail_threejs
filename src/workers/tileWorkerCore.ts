export const MAPTILER_BACKOFF_MAX_MS = 4000;

export function isMapTilerUrl(url: string): boolean {
    return url.includes('api.maptiler.com');
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
