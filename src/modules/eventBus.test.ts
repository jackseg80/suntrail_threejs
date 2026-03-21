import { describe, it, expect, vi } from 'vitest';
import { eventBus } from './eventBus';

describe('eventBus.ts', () => {
    it('should register and trigger listeners', () => {
        const spy = vi.fn();
        eventBus.on('terrainReady', spy);
        
        eventBus.emit('terrainReady');
        expect(spy).toHaveBeenCalled();
    });

    it('should pass payload to listeners', () => {
        const spy = vi.fn();
        const payload = { worldX: 100, worldZ: 200, targetElevation: 1500 };
        eventBus.on('flyTo', spy);
        
        eventBus.emit('flyTo', payload);
        expect(spy).toHaveBeenCalledWith(payload);
    });

    it('should unregister listeners with off()', () => {
        const spy = vi.fn();
        eventBus.on('terrainReady', spy);
        eventBus.off('terrainReady', spy);
        
        eventBus.emit('terrainReady');
        expect(spy).not.toHaveBeenCalled();
    });

    it('should not throw when emitting event with no listeners', () => {
        expect(() => eventBus.emit('terrainReady')).not.toThrow();
    });
});
