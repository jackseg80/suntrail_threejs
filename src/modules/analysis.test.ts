import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAltitudeAt } from './analysis';
import { state } from './state';

describe('analysis.ts', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        state.RELIEF_EXAGGERATION = 1.0;
    });

    it('should return 0 altitude if no tile is loaded', () => {
        const alt = getAltitudeAt(0, 0);
        expect(alt).toBe(0);
    });
});
