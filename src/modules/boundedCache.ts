/**
 * boundedCache.ts — FIFO-bounded Map wrapper to prevent unbounded memory growth.
 * Used by buildings, hydrology, and POI caches.
 */

const DEFAULT_MAX_SIZE = 200;

/**
 * Set a value in a Map, evicting the oldest entry if the map exceeds maxSize.
 * Maps in JavaScript iterate in insertion order, so deleting the first key is FIFO.
 */
export function boundedCacheSet<K, V>(map: Map<K, V>, key: K, value: V, maxSize: number = DEFAULT_MAX_SIZE): void {
    map.set(key, value);
    if (map.size > maxSize) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
    }
}
