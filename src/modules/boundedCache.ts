/**
 * boundedCache.ts — Robust LRU-bounded Map to prevent memory leaks and unbounded growth.
 * Centralizes cache management for OSM data (buildings, hydrology, POIs).
 */

export interface BoundedCacheOptions<K, V> {
    maxSize?: number;
    onEvict?: (key: K, value: V) => void;
    isPinned?: (key: K, value: V) => boolean;
}

/**
 * Generic Bounded Cache using LRU (Least Recently Used) policy via Map insertion order.
 */
export class BoundedCache<K, V> {
    private cache = new Map<K, V>();
    private maxSize: number;
    private onEvict?: (key: K, value: V) => void;
    private isPinned?: (key: K, value: V) => boolean;

    constructor(options: BoundedCacheOptions<K, V> = {}) {
        this.maxSize = options.maxSize || 200;
        this.onEvict = options.onEvict;
        this.isPinned = options.isPinned;
    }

    set(key: K, value: V): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        this.cache.set(key, value);
        this.trim();
    }

    get(key: K): V | undefined {
        const value = this.cache.get(key);
        if (value !== undefined) {
            // Re-insert to mark as recently used
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }

    delete(key: K): boolean {
        return this.cache.delete(key);
    }

    entries(): IterableIterator<[K, V]> {
        return this.cache.entries();
    }

    values(): IterableIterator<V> {
        return this.cache.values();
    }

    has(key: K): boolean {
        return this.cache.has(key);
    }

    clear(): void {
        if (this.onEvict) {
            for (const [key, value] of this.cache.entries()) {
                this.onEvict(key, value);
            }
        }
        this.cache.clear();
    }

    get size(): number {
        return this.cache.size;
    }

    /** 
     * Adjusts the max size and trims the cache if needed.
     */
    resize(newSize: number): void {
        this.maxSize = newSize;
        this.trim();
    }

    private trim(): void {
        while (this.cache.size > this.maxSize) {
            let evictKey: K | undefined;
            
            // Find the oldest item that is NOT pinned
            for (const [k, v] of this.cache.entries()) {
                if (!this.isPinned || !this.isPinned(k, v)) {
                    evictKey = k;
                    break;
                }
            }

            if (evictKey === undefined) {
                // All items in cache are currently pinned, we can't trim further
                // without breaking the pinning contract.
                break;
            }

            const evictValue = this.cache.get(evictKey);
            if (evictValue !== undefined && this.onEvict) {
                this.onEvict(evictKey, evictValue);
            }
            this.cache.delete(evictKey);
        }
    }
}

/**
 * Legacy support for the procedural API (to avoid breaking existing imports immediately).
 * @deprecated Use BoundedCache class instead.
 */
export function boundedCacheSet<K, V>(map: Map<K, V>, key: K, value: V, maxSize: number = 200): void {
    map.set(key, value);
    if (map.size > maxSize) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
    }
}
