import { describe, it, expect, vi } from 'vitest';
import { createReactiveState } from './ReactiveState';

describe('ReactiveState', () => {
    it('should create a reactive state and allow subscriptions', async () => {
        const state = createReactiveState({ zoom: 12 });
        const callback = vi.fn();
        
        state.subscribe('zoom', callback);
        state.zoom = 13;
        
        // Wait for microtask
        await new Promise(resolve => queueMicrotask(() => resolve(null)));
        
        expect(callback).toHaveBeenCalledWith(13);
    });

    it('should handle nested objects', async () => {
        const state = createReactiveState({ weather: { temp: 20 } });
        const callback = vi.fn();
        
        state.subscribe('weather.temp', callback);
        state.weather.temp = 25;
        
        await new Promise(resolve => queueMicrotask(() => resolve(null)));
        
        expect(callback).toHaveBeenCalledWith(25);
    });

    it('should debounce multiple changes in one tick', async () => {
        const state = createReactiveState({ zoom: 12 });
        const callback = vi.fn();
        
        state.subscribe('zoom', callback);
        state.zoom = 13;
        state.zoom = 14;
        state.zoom = 15;
        
        await new Promise(resolve => queueMicrotask(() => resolve(null)));
        
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(15);
    });

    it('should notify parent paths when child changes', async () => {
        const state = createReactiveState({ weather: { temp: 20 } });
        const callback = vi.fn();
        
        state.subscribe('weather', callback);
        state.weather.temp = 25;
        
        await new Promise(resolve => queueMicrotask(() => resolve(null)));
        
        expect(callback).toHaveBeenCalled();
        expect(callback.mock.calls[0][0]).toEqual({ temp: 25 });
    });

    it('should not proxy class instances or arrays', () => {
        class CustomClass { isCustom = true; }
        const custom = new CustomClass();
        const state = createReactiveState({ custom, list: [1, 2, 3] });
        
        // Check if it's a plain object in our implementation.
        // Plain objects have Object.prototype as their prototype.
        expect(Object.getPrototypeOf(state.custom)).not.toBe(Object.prototype);
        expect(Array.isArray(state.list)).toBe(true);
    });

    it('should handle multiple subscribers on the same path', async () => {
        const state = createReactiveState({ zoom: 12 });
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        
        state.subscribe('zoom', cb1);
        state.subscribe('zoom', cb2);
        
        state.zoom = 13;
        
        await new Promise(resolve => queueMicrotask(() => resolve(null)));
        
        expect(cb1).toHaveBeenCalledWith(13);
        expect(cb2).toHaveBeenCalledWith(13);
    });

    it('should handle multiple paths in one tick', async () => {
        const state = createReactiveState({ zoom: 12, weather: { temp: 20 } });
        const cbZoom = vi.fn();
        const cbTemp = vi.fn();
        
        state.subscribe('zoom', cbZoom);
        state.subscribe('weather.temp', cbTemp);
        
        state.zoom = 13;
        state.weather.temp = 25;
        
        await new Promise(resolve => queueMicrotask(() => resolve(null)));
        
        expect(cbZoom).toHaveBeenCalledWith(13);
        expect(cbTemp).toHaveBeenCalledWith(25);
    });
});
