import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWithCache } from './tileLoader';
import { packManager } from './packManager';
import { state } from './state';

// Mock de packManager
vi.mock('./packManager', () => ({
    packManager: {
        hasMountedPacks: vi.fn(),
        getTileFromPacks: vi.fn()
    }
}));

// Mock de fetch global
global.fetch = vi.fn();

describe('TileLoader Integration with Packs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.IS_OFFLINE = false;
        (packManager.hasMountedPacks as any).mockReturnValue(false);
        (packManager.getTileFromPacks as any).mockReturnValue(Promise.resolve(null));
    });

    it('should prioritize pack over network when pack is mounted', async () => {
        const mockBlob = new Blob(['tile-data'], { type: 'image/webp' });
        (packManager.hasMountedPacks as any).mockReturnValue(true);
        (packManager.getTileFromPacks as any).mockReturnValue(Promise.resolve(mockBlob));

        const url = 'https://tile.openstreetmap.org/12/2133/1450.png';
        const result = await fetchWithCache(url);

        // Vérifier que packManager a été consulté
        expect(packManager.getTileFromPacks).toHaveBeenCalledWith(12, 2133, 1450);
        
        // Vérifier que fetch n'a PAS été appelé
        expect(global.fetch).not.toHaveBeenCalled();
        
        // Vérifier qu'on a bien reçu le blob du pack
        expect(result).toBe(mockBlob);
    });

    it('should work offline when pack is mounted', async () => {
        const mockBlob = new Blob(['offline-tile-data'], { type: 'image/webp' });
        state.IS_OFFLINE = true;
        (packManager.hasMountedPacks as any).mockReturnValue(true);
        (packManager.getTileFromPacks as any).mockReturnValue(Promise.resolve(mockBlob));

        const url = 'https://tile.openstreetmap.org/12/2133/1450.png';
        const result = await fetchWithCache(url);

        // Même en offline, le pack doit servir la tuile
        expect(packManager.getTileFromPacks).toHaveBeenCalled();
        expect(result).toBe(mockBlob);
    });

    it('should fallback to network if pack does not have the tile', async () => {
        (packManager.hasMountedPacks as any).mockReturnValue(true);
        (packManager.getTileFromPacks as any).mockReturnValue(Promise.resolve(null)); // Pas dans le pack
        
        const mockResponse = {
            ok: true,
            blob: vi.fn().mockResolvedValue(new Blob(['network-data']))
        };
        (global.fetch as any).mockResolvedValue(mockResponse);

        const url = 'https://tile.openstreetmap.org/12/2133/1450.png';
        const result = await fetchWithCache(url);

        // Vérifier que packManager a été consulté
        expect(packManager.getTileFromPacks).toHaveBeenCalled();
        
        // Vérifier que fetch a été appelé en fallback
        expect(global.fetch).toHaveBeenCalledWith(url, expect.anything());
        expect(result).toBeDefined();
    });

    it('should return null when offline and not in pack', async () => {
        state.IS_OFFLINE = true;
        (packManager.hasMountedPacks as any).mockReturnValue(true);
        (packManager.getTileFromPacks as any).mockReturnValue(Promise.resolve(null));

        const url = 'https://tile.openstreetmap.org/12/2133/1450.png';
        const result = await fetchWithCache(url);

        expect(result).toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
