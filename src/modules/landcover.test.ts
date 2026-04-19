import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isPointInForest, fetchForestsPBF } from './landcover';
import { state } from './state';

// Mock de fetch global
global.fetch = vi.fn();

describe('landcover.ts', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        state.MK = 'test-key';
        state.isMapTilerDisabled = false;
    });

    describe('isPointInForest', () => {
        // On utilise une tuile hors Suisse à Zoom 10 pour que requestZoom soit aussi 10.
        // Ainsi le ratio est 1 et le mapping des coordonnées est direct.
        const mockTile: any = {
            zoom: 10,
            tx: 100, 
            ty: 100
        };

        // Polygone simple (carré) dans une tuile vectorielle (coords 0-4096)
        const simpleForest = [
            [
                { x: 1000, y: 1000 },
                { x: 3000, y: 1000 },
                { x: 3000, y: 3000 },
                { x: 1000, y: 3000 },
                { x: 1000, y: 1000 }
            ]
        ];

        it('should return true for a point inside the forest polygon', () => {
            // Au centre (scanRes=64, px=32) -> localX = (32/64)*4096 = 2048. 
            // 2048 est bien entre 1000 et 3000.
            const result = isPointInForest(mockTile, 32, 32, 64, [simpleForest]);
            expect(result).toBe(true);
        });

        it('should return false for a point outside the forest polygon', () => {
            // (5/64)*4096 = 320. 320 est en dehors de 1000-3000.
            const result = isPointInForest(mockTile, 5, 5, 64, [simpleForest]);
            expect(result).toBe(false);
        });

        it('should handle holes in polygons (XOR logic)', () => {
            const forestWithHole = [
                // Anneau extérieur
                [
                    { x: 0, y: 0 },
                    { x: 4000, y: 0 },
                    { x: 4000, y: 4000 },
                    { x: 0, y: 4000 },
                    { x: 0, y: 0 }
                ],
                // Trou au milieu
                [
                    { x: 1000, y: 1000 },
                    { x: 3000, y: 1000 },
                    { x: 3000, y: 3000 },
                    { x: 1000, y: 3000 },
                    { x: 1000, y: 1000 }
                ]
            ];

            // Dans le trou (centre) -> false
            expect(isPointInForest(mockTile, 32, 32, 64, [forestWithHole])).toBe(false);
            // Dans la forêt (bordure) -> true
            expect(isPointInForest(mockTile, 5, 5, 64, [forestWithHole])).toBe(true);
        });
    });

    describe('fetchForestsPBF', () => {
        it('should return null if no MapTiler key and not in Switzerland', async () => {
            state.MK = '';
            // Coordonnées hors suisse (ex: Paris)
            const tileOutside: any = { zoom: 14, tx: 8307, ty: 5641 }; 
            const result = await fetchForestsPBF(tileOutside);
            expect(result).toBe(null);
        });

        it('should call SwissTopo URL when inside Switzerland', async () => {
            // Coordonnées en Suisse (Zermatt approx)
            const tileCH: any = { zoom: 14, tx: 8527, ty: 5741 };
            
            (fetch as any).mockResolvedValue({
                ok: false, // On simule un echec pour ne pas parser de vrai PBF ici
                status: 404
            });

            await fetchForestsPBF(tileCH);
            expect(fetch).toHaveBeenCalledWith(expect.stringContaining('geo.admin.ch'), expect.anything());
        });

        it('should call MapTiler URL when outside Switzerland', async () => {
            // Coordonnées hors suisse (Chamonix approx - France)
            const tileFR: any = { zoom: 14, tx: 8430, ty: 5740 };
            
            (fetch as any).mockResolvedValue({
                ok: false,
                status: 404
            });

            await fetchForestsPBF(tileFR);
            expect(fetch).toHaveBeenCalledWith(expect.stringContaining('api.maptiler.com'), expect.anything());
        });
    });
});
