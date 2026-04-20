import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isPointInForest, fetchLandcoverPBF } from './landcover';
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
        // Polygone simple (carré) dans une tuile vectorielle (coords 0-4096)
        const simpleForest = {
            geometry: [
                [
                    { x: 1000, y: 1000 },
                    { x: 3000, y: 1000 },
                    { x: 3000, y: 3000 },
                    { x: 1000, y: 3000 },
                    { x: 1000, y: 1000 }
                ]
            ],
            bbox: { minX: 1000, maxX: 3000, minY: 1000, maxY: 3000 }
        };

        it('should return true for a point inside the forest polygon', () => {
            // Au centre (scanRes=64, px=32) -> localX = (32/64)*4096 = 2048. 
            // 2048 est bien entre 1000 et 3000.
            // ratio=1, tileTx=100, tileTy=100
            const result = isPointInForest(32, 32, 64, [simpleForest], 1, 100, 100);
            expect(result).toBe(true);
        });

        it('should return false for a point outside the forest polygon', () => {
            // (5/64)*4096 = 320. 320 est en dehors de 1000-3000.
            const result = isPointInForest(5, 5, 64, [simpleForest], 1, 100, 100);
            expect(result).toBe(false);
        });

        it('should use spatial grid if provided', () => {
            // On crée une grille où la cellule (8,8) contient notre forêt
            // (2048/256 = 8)
            const grid: any[][] = Array.from({ length: 16 * 16 }, () => []);
            grid[8 * 16 + 8] = [simpleForest];

            // Point dedans avec la grille
            const result = isPointInForest(32, 32, 64, [simpleForest], 1, 100, 100, grid);
            expect(result).toBe(true);

            // Point dehors (cellule vide dans la grille)
            const resultEmpty = isPointInForest(5, 5, 64, [simpleForest], 1, 100, 100, grid);
            expect(resultEmpty).toBe(false);
        });
    });

    describe('fetchLandcoverPBF', () => {
        it('should return null if no MapTiler key and not in Switzerland', async () => {
            state.MK = '';
            // Coordonnées hors suisse (ex: Paris)
            const tileOutside: any = { zoom: 14, tx: 8307, ty: 5641 }; 
            const result = await fetchLandcoverPBF(tileOutside);
            expect(result).toBe(null);
        });

        it('should call SwissTopo URL when inside Switzerland', async () => {
            // Coordonnées en Suisse (Zermatt approx)
            const tileCH: any = { zoom: 14, tx: 8527, ty: 5741 };
            
            (fetch as any).mockResolvedValue({
                ok: false, // On simule un echec pour ne pas parser de vrai PBF ici
                status: 404
            });

            await fetchLandcoverPBF(tileCH);
            expect(fetch).toHaveBeenCalledWith(expect.stringContaining('geo.admin.ch'), expect.anything());
        });

        it('should call MapTiler URL when outside Switzerland', async () => {
            // Coordonnées hors suisse (Chamonix approx - France)
            const tileFR: any = { zoom: 14, tx: 8430, ty: 5740 };
            
            (fetch as any).mockResolvedValue({
                ok: false,
                status: 404
            });

            await fetchLandcoverPBF(tileFR);
            expect(fetch).toHaveBeenCalledWith(expect.stringContaining('api.maptiler.com'), expect.anything());
        });
    });
});
