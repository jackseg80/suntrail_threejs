import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadTileData } from './tileLoader';
import { tileWorkerManager } from './workerManager';
import { state } from './state';
import { packManager } from './packManager';

// Mock geo pour contrôler le countryCode retourné
vi.mock('./geo', () => ({
    getCountryAtTile: vi.fn().mockReturnValue(null),
    isTileInCountry: vi.fn().mockReturnValue(true),
    countPointsInCountry: vi.fn().mockReturnValue(5),
}));

// Mock de caches global
const mockCache = {
    put: vi.fn(() => new Promise((resolve) => setTimeout(resolve, 200))), // 200ms de délai simulé (bien au-dessus de 50ms)
    match: vi.fn(),
};

global.caches = {
    open: vi.fn().mockResolvedValue(mockCache),
    delete: vi.fn(),
    has: vi.fn(),
    keys: vi.fn(),
    match: vi.fn(),
} as any;

// Mock du worker manager
vi.mock('./workerManager', () => ({
    tileWorkerManager: {
        loadTile: vi.fn(() => ({
            promise: Promise.resolve({}),
            taskId: 123,
        })),
    },
}));

// Mock de packManager
vi.mock('./packManager', () => ({
    packManager: {
        hasMountedPacks: vi.fn(),
        getTileFromPacks: vi.fn(),
        hasInstalledPackForCountry: vi.fn(),
        getMinPackZoom: vi.fn(),
    },
}));

describe('TileLoader Blocking Analysis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.IS_2D_MODE = false;
        state.ZOOM = 14;

        // Activer les packs pour entrer dans le bloc bloquant (await Promise.all)
        (packManager.hasMountedPacks as any).mockReturnValue(true);
        (packManager.getTileFromPacks as any).mockReturnValue(
            Promise.resolve(new Blob(['test-data']))
        );
        (packManager.hasInstalledPackForCountry as any).mockReturnValue(true);
        (packManager.getMinPackZoom as any).mockReturnValue(8);
    });

    it('SHOULD NOT wait for cache seeding before starting worker load', async () => {
        const startTime = Date.now();

        // On lance le chargement d'une tuile
        // Comme packManager.hasMountedPacks() est true, il va appeler seedPackTile -> caches.put (200ms)
        await loadTileData(4270, 2891, 14, false);

        const duration = Date.now() - startTime;

        console.log(
            `[TEST] Tile load initiation duration: ${duration}ms (Expected < 50ms)`
        );

        // Si c'est bloquant (v5.28.37 actuel), duration sera ~200ms
        // Si c'est corrigé, duration sera < 50ms
        expect(duration).toBeLessThan(50);
        expect(tileWorkerManager.loadTile).toHaveBeenCalled();
    });
});

// ── P0 : Data-driven inPackZone (v5.73.0) ───────────────────────────────────
describe('TileLoader — P0: inPackZone data-driven', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.IS_2D_MODE = false;
        state.ZOOM = 14;
        state.MAP_SOURCE = 'swisstopo';
        state.IS_OFFLINE = false;

        (packManager.hasMountedPacks as any).mockReturnValue(true);
        (packManager.getTileFromPacks as any).mockReturnValue(
            Promise.resolve(new Blob(['test-data']))
        );
        (packManager.getMinPackZoom as any).mockReturnValue(8);
    });

    it('CH tuile + hasInstalledPackForCountry(CH)=true → le pack est interrogé', async () => {
        const { getCountryAtTile } = await import('./geo');
        (getCountryAtTile as any).mockReturnValue('CH');
        (packManager.hasInstalledPackForCountry as any).mockReturnValue(true);

        await loadTileData(4270, 2891, 14, false);

        expect(packManager.getTileFromPacks).toHaveBeenCalled();
    });

    it('CH tuile + hasInstalledPackForCountry(CH)=false → fallback réseau', async () => {
        const { getCountryAtTile } = await import('./geo');
        (getCountryAtTile as any).mockReturnValue('CH');
        (packManager.hasInstalledPackForCountry as any).mockReturnValue(false);

        await loadTileData(4270, 2891, 14, false);

        expect(packManager.getTileFromPacks).not.toHaveBeenCalled();
    });

    it('MAP_SOURCE=opentopomap désactive les packs même si hasInstalledPackForCountry=true', async () => {
        const { getCountryAtTile } = await import('./geo');
        (getCountryAtTile as any).mockReturnValue('CH');
        state.MAP_SOURCE = 'opentopomap';
        (packManager.hasInstalledPackForCountry as any).mockReturnValue(true);

        await loadTileData(4270, 2891, 14, false);

        expect(packManager.getTileFromPacks).not.toHaveBeenCalled();
    });

    it("hasMountedPacks()=false → pas d'interrogation pack", async () => {
        const { getCountryAtTile } = await import('./geo');
        (getCountryAtTile as any).mockReturnValue('CH');
        (packManager.hasMountedPacks as any).mockReturnValue(false);
        (packManager.hasInstalledPackForCountry as any).mockReturnValue(true);

        await loadTileData(4270, 2891, 14, false);

        expect(packManager.getTileFromPacks).not.toHaveBeenCalled();
    });

    it("zoom < getMinPackZoom() → pas d'interrogation pack", async () => {
        const { getCountryAtTile } = await import('./geo');
        (getCountryAtTile as any).mockReturnValue('CH');
        state.ZOOM = 7;
        (packManager.getMinPackZoom as any).mockReturnValue(8);
        (packManager.hasInstalledPackForCountry as any).mockReturnValue(true);

        await loadTileData(4270, 2891, 7, false);

        expect(packManager.getTileFromPacks).not.toHaveBeenCalled();
    });
});
