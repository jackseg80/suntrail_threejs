import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchLocalPeaks } from './peaks';
import { state } from './state';

describe('peaks.ts', () => {
    beforeEach(() => {
        state.localPeaks = [];
        localStorage.clear();
        globalThis.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should fetch and parse peaks from Overpass API', async () => {
        const mockResponse = {
            elements: [
                { id: 1, lat: 46.5, lon: 7.5, tags: { name: 'Mont Blanc', ele: '4808' } },
                { id: 2, lat: 46.6, lon: 7.6, tags: { name: 'Small Hill', ele: '800' } }, // Devrait être filtré (<1000m)
                { id: 3, lat: 46.7, lon: 7.7, tags: { name: 'Matterhorn', ele: '4478' } }
            ]
        };

        (globalThis.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        });

        await fetchLocalPeaks(46.5, 7.5, 50);

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(state.localPeaks.length).toBe(2);
        
        // Vérification du tri par altitude (descendant)
        expect(state.localPeaks[0].name).toBe('Mont Blanc');
        expect(state.localPeaks[1].name).toBe('Matterhorn');
    });

    it('should use cache if available and within radius', async () => {
        const cachedPeaks = [
            { id: 4, name: 'Cached Peak', lat: 46.5, lon: 7.5, ele: 3000 }
        ];
        
        localStorage.setItem('suntrail_peaks_cache', JSON.stringify({
            timestamp: Date.now(),
            lat: 46.5,
            lon: 7.5,
            peaks: cachedPeaks
        }));

        await fetchLocalPeaks(46.5, 7.5, 50);

        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(state.localPeaks.length).toBe(1);
        expect(state.localPeaks[0].name).toBe('Cached Peak');
    });
});
