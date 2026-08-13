import { describe, it, expect, vi } from 'vitest';
import { BoundedCache, boundedCacheSet } from './boundedCache';

describe('BoundedCache', () => {
    it('evicts the previous value when a key is replaced', () => {
        const onEvict = vi.fn();
        const cache = new BoundedCache<string, { id: number }>({ onEvict });
        const previous = { id: 1 };
        const replacement = { id: 2 };

        cache.set('tile', previous);
        cache.set('tile', replacement);

        expect(onEvict).toHaveBeenCalledOnce();
        expect(onEvict).toHaveBeenCalledWith('tile', previous);
        expect(cache.get('tile')).toBe(replacement);
    });

    it('does not evict when the exact same value is refreshed', () => {
        const onEvict = vi.fn();
        const cache = new BoundedCache<string, object>({ onEvict });
        const value = {};

        cache.set('tile', value);
        cache.set('tile', value);

        expect(onEvict).not.toHaveBeenCalled();
        expect(cache.size).toBe(1);
    });
});

describe('boundedCacheSet', () => {
    it('should set values normally under limit', () => {
        const map = new Map<string, number>();
        boundedCacheSet(map, 'a', 1, 3);
        boundedCacheSet(map, 'b', 2, 3);
        boundedCacheSet(map, 'c', 3, 3);
        expect(map.size).toBe(3);
        expect(map.get('a')).toBe(1);
    });

    it('should evict oldest entry when exceeding maxSize', () => {
        const map = new Map<string, number>();
        boundedCacheSet(map, 'a', 1, 3);
        boundedCacheSet(map, 'b', 2, 3);
        boundedCacheSet(map, 'c', 3, 3);
        boundedCacheSet(map, 'd', 4, 3); // should evict 'a'

        expect(map.size).toBe(3);
        expect(map.has('a')).toBe(false);
        expect(map.get('d')).toBe(4);
    });

    it('should keep evicting as more entries are added', () => {
        const map = new Map<string, number>();
        for (let i = 0; i < 10; i++) {
            boundedCacheSet(map, `key${i}`, i, 5);
        }
        expect(map.size).toBe(5);
        expect(map.has('key0')).toBe(false);
        expect(map.has('key9')).toBe(true);
    });
});
