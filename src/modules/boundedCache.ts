/**
 * boundedCache.ts — Robust LRU-bounded Map to prevent memory leaks and unbounded growth.
 * Centralizes cache management for OSM data (buildings, hydrology, POIs).
 */

export interface BoundedCacheOptions<V> {
    maxSize?: number;
    onEvict?: (value: V) => void;
}

/**
 * Generic Bounded Cache using LRU (Least Recently Used) policy via Map insertion order.
 */
export class BoundedCache<K, V> {
    private cache = new Map<K, V>();
    private maxSize: number;
    private onEvict?: (value: V) => void;

    constructor(options: BoundedCacheOptions<V> = {}) {
        this.maxSize = options.maxSize || 200;
        this.onEvict = options.onEvict;
    }

    set(key: K, value: V): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) {
                const oldestValue = this.cache.get(oldestKey);
                if (oldestValue && this.onEvict) this.onEvict(oldestValue);
                this.cache.delete(oldestKey);
            }
        }
        this.cache.set(key, value);
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

    has(key: K): boolean {
        return this.cache.has(key);
    }

    clear(): void {
        if (this.onEvict) {
            for (const value of this.cache.values()) {
                this.onEvict(value);
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
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) {
                const oldestValue = this.cache.get(oldestKey);
                if (oldestValue && this.onEvict) this.onEvict(oldestValue);
                this.cache.delete(oldestKey);
            } else {
                break;
            }
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
