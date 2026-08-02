import { describe, expect, it } from 'vitest';
import {
    isMapTilerUrl,
    MAPTILER_BACKOFF_MAX_MS,
    MapTilerBackoff,
} from './tileWorkerCore';

describe('tileWorkerCore', () => {
    it('detects MapTiler URLs only', () => {
        expect(
            isMapTilerUrl('https://api.maptiler.com/maps/outdoor/1/2/3')
        ).toBe(true);
        expect(isMapTilerUrl('https://wmts.geo.admin.ch/1/2/3')).toBe(false);
    });

    it('backs off exponentially and caps the retry delay', () => {
        const backoff = new MapTilerBackoff();

        backoff.trigger(1000);
        expect(backoff.isActive(1499)).toBe(true);
        expect(backoff.isActive(1500)).toBe(false);

        for (let i = 0; i < 8; i++) backoff.trigger(2000 + i * 10);
        expect(backoff.getRetryDelayMs()).toBe(MAPTILER_BACKOFF_MAX_MS);
    });

    it('resets both the deadline and the retry delay after a successful request', () => {
        const backoff = new MapTilerBackoff();
        backoff.trigger(1000);
        backoff.trigger(2000);
        backoff.reset();

        expect(backoff.isActive(2000)).toBe(false);
        expect(backoff.getRetryDelayMs()).toBe(500);
    });
});
