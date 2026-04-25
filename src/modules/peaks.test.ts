import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchLocalPeaks, _clearPeaksCache } from './peaks';
import { state } from './state';

// Mock de @mapbox/vector-tile
vi.mock('@mapbox/vector-tile', () => {
    return {
        VectorTile: class {
            layers = {
                mountain_peak: {
                    length: 2,
                    extent: 4096,
                    feature: (i: number) => {
                        const features = [
                            { 
                                id: 1, 
                                properties: { name: 'Mont Blanc', ele: '4808', class: 'mountain_peak' }, 
                                loadGeometry: () => [[{ x: 2048, y: 2048 }]] 
                            },
                            { 
                                id: 3, 
                                properties: { name: 'Matterhorn', ele: '4478', class: 'mountain_peak' }, 
                                loadGeometry: () => [[{ x: 1024, y: 1024 }]] 
                            }
                        ];
                        return features[i];
                    }
                }
            };
        }
    };
});

describe('peaks.ts', () => {
    beforeEach(() => {
        state.localPeaks = [];
        _clearPeaksCache();
        globalThis.fetch = vi.fn();
        
        // Mock de l'API Cache
        globalThis.caches = {
            open: vi.fn().mockResolvedValue({
                match: vi.fn().mockResolvedValue(null),
                put: vi.fn().mockResolvedValue(undefined)
            })
        } as any;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it('should fetch and parse peaks from PBF tiles', async () => {
        (globalThis.fetch as any).mockResolvedValue({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(0)
        });

        await fetchLocalPeaks(46.5, 7.5, 50);

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(state.localPeaks.length).toBe(2);
        
        // Vérification du tri par altitude (descendant)
        expect(state.localPeaks[0].name).toBe('Mont Blanc');
        expect(state.localPeaks[0].ele).toBe(4808);
        expect(state.localPeaks[1].name).toBe('Matterhorn');
    });

    it('should use memory cache if available', async () => {
        (globalThis.fetch as any).mockResolvedValue({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(0)
        });

        // Premier appel pour remplir le cache mémoire
        await fetchLocalPeaks(46.5, 7.5, 50);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);

        // Deuxième appel identique
        await fetchLocalPeaks(46.5, 7.5, 50);
        
        // Ne devrait pas avoir refait de fetch
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(state.localPeaks.length).toBe(2);
    });

    it('should fall back to persistent cache if memory cache is empty', async () => {
        const cachedPeaks = [
            { id: 4, name: 'Persistent Peak', lat: 46.5, lon: 7.5, ele: 3000 }
        ];

        (globalThis.caches.open as any).mockResolvedValue({
            match: vi.fn().mockResolvedValue({
                json: async () => cachedPeaks
            }),
            put: vi.fn()
        });

        await fetchLocalPeaks(46.0, 7.0, 50);

        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(state.localPeaks.length).toBe(1);
        expect(state.localPeaks[0].name).toBe('Persistent Peak');
    });
});
