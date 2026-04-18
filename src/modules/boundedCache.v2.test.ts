import { describe, it, expect, vi } from 'vitest';
import { BoundedCache } from './boundedCache';

describe('BoundedCache Class (v2)', () => {
    it('should store and retrieve values', () => {
        const cache = new BoundedCache<string, number>();
        cache.set('a', 1);
        expect(cache.get('a')).toBe(1);
        expect(cache.has('a')).toBe(true);
    });

    it('should evict oldest entry when maxSize is reached (FIFO/LRU)', () => {
        const cache = new BoundedCache<string, number>({ maxSize: 2 });
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3); // should evict 'a'

        expect(cache.has('a')).toBe(false);
        expect(cache.get('b')).toBe(2);
        expect(cache.get('c')).toBe(3);
        expect(cache.size).toBe(2);
    });

    it('should update LRU position on get', () => {
        const cache = new BoundedCache<string, number>({ maxSize: 2 });
        cache.set('a', 1);
        cache.set('b', 2);
        
        // Access 'a' to make it recently used
        cache.get('a');
        
        cache.set('c', 3); // should evict 'b' instead of 'a'

        expect(cache.has('b')).toBe(false);
        expect(cache.has('a')).toBe(true);
        expect(cache.has('c')).toBe(true);
    });

    it('should call onEvict callback with key and value when an item is removed', () => {
        const onEvict = vi.fn();
        const cache = new BoundedCache<string, number>({ maxSize: 2, onEvict });
        
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3); // evicts 'a'

        expect(onEvict).toHaveBeenCalledWith('a', 1);
    });

    it('should NOT evict pinned items', () => {
        const pinned = new Set(['a']);
        const onEvict = vi.fn();
        const cache = new BoundedCache<string, number>({ 
            maxSize: 2, 
            isPinned: (key) => pinned.has(key),
            onEvict
        });
        
        cache.set('a', 1); // Pinned
        cache.set('b', 2); // Oldest unpinned
        cache.set('c', 3); // Should evict 'b' instead of 'a'

        expect(cache.has('a')).toBe(true);
        expect(cache.has('b')).toBe(false);
        expect(cache.has('c')).toBe(true);
        expect(onEvict).toHaveBeenCalledWith('b', 2);
    });

    it('should stop evicting if everything is pinned', () => {
        const cache = new BoundedCache<string, number>({ 
            maxSize: 2, 
            isPinned: () => true 
        });
        
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3); 

        expect(cache.size).toBe(3); // Contract: we don't evict if pinned
        expect(cache.has('a')).toBe(true);
        expect(cache.has('b')).toBe(true);
        expect(cache.has('c')).toBe(true);
    });

    it('should support clearing the cache', () => {
        const onEvict = vi.fn();
        const cache = new BoundedCache<string, number>({ maxSize: 5, onEvict });
        cache.set('a', 1);
        cache.set('b', 2);
        
        cache.clear();
        
        expect(cache.size).toBe(0);
        expect(onEvict).toHaveBeenCalledTimes(2);
    });

    it('should support resizing', () => {
        const cache = new BoundedCache<string, number>({ maxSize: 10 });
        for (let i = 0; i < 10; i++) cache.set(`k${i}`, i);
        
        cache.resize(5);
        
        expect(cache.size).toBe(5);
        expect(cache.has('k0')).toBe(false);
        expect(cache.has('k9')).toBe(true);
    });
});
