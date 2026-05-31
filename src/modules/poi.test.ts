import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockState } = vi.hoisted(() => ({
    mockState: {
        SHOW_SIGNPOSTS: true,
        POI_ZOOM_THRESHOLD: 14,
        IS_2D_MODE: false,
        scene: {} as any,
        MK: 'test-key',
        originTile: { x: 2126, y: 1462, z: 12 },
    },
}));

vi.mock('./state', () => ({ state: mockState }));
vi.mock('./analysis', () => ({ getAltitudeAt: vi.fn(() => 500) }));
vi.mock('./geo', () => ({
    isPositionInSwitzerland: vi.fn(() => true),
    getPow2: vi.fn((z: number) => Math.pow(2, z)),
    xNormToLon: vi.fn(() => 8.2),
    yNormToLat: vi.fn(() => 46.8),
}));
vi.mock('@mapbox/vector-tile', () => ({
    VectorTile: vi.fn(() => ({ layers: {} })),
}));
vi.mock('pbf', () => ({ default: vi.fn(() => ({})) }));

// BoundedCache simple pour isoler le module
vi.mock('./boundedCache', () => ({
    BoundedCache: class {
        private _data = new Map<string, any>();
        get(k: string) {
            return this._data.get(k);
        }
        set(k: string, v: any) {
            this._data.set(k, v);
        }
    },
}));

import { loadPOIsForTile } from './poi';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTile(
    overrides: Partial<{
        zoom: number;
        tx: number;
        ty: number;
        status: string;
        poiGroup: object | null;
    }> = {}
) {
    return {
        tx: 2126,
        ty: 1462,
        zoom: 14,
        status: 'loaded',
        poiGroup: null,
        worldX: 0,
        worldZ: 0,
        lngLatToLocal: vi.fn(() => ({ x: 0, z: 0 })),
        ...overrides,
    } as any;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('loadPOIsForTile() — gardes de sortie anticipée', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.SHOW_SIGNPOSTS = true;
        mockState.POI_ZOOM_THRESHOLD = 14;
        vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as any);
    });

    it('retourne sans fetch si SHOW_SIGNPOSTS est false', async () => {
        mockState.SHOW_SIGNPOSTS = false;
        await loadPOIsForTile(makeTile());
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('retourne sans fetch si tile.zoom < POI_ZOOM_THRESHOLD', async () => {
        await loadPOIsForTile(makeTile({ zoom: 10 }));
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('retourne sans fetch si tile.status est "disposed"', async () => {
        await loadPOIsForTile(makeTile({ status: 'disposed' }));
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('retourne sans fetch si tile.poiGroup est déjà défini', async () => {
        await loadPOIsForTile(makeTile({ poiGroup: {} }));
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

describe('loadPOIsForTile() — comportement réseau', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.SHOW_SIGNPOSTS = true;
        mockState.POI_ZOOM_THRESHOLD = 14;

        // Cache API retourne null (cache miss) par défaut
        (global as any).caches = {
            open: vi.fn().mockResolvedValue({
                match: vi.fn().mockResolvedValue(null),
                put: vi.fn().mockResolvedValue(undefined),
            }),
        };
    });

    it('appelle fetch avec URL SwissTopo si tuile est en Suisse', async () => {
        const { isPositionInSwitzerland } = await import('./geo');
        vi.mocked(isPositionInSwitzerland).mockReturnValue(true);

        vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
        } as any);

        await loadPOIsForTile(makeTile());
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('swisstopo'),
            expect.any(Object)
        );
    });

    it('appelle fetch avec URL MapTiler si tuile hors Suisse', async () => {
        const { isPositionInSwitzerland } = await import('./geo');
        vi.mocked(isPositionInSwitzerland).mockReturnValue(false);

        vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
        } as any);

        await loadPOIsForTile(makeTile());
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('maptiler'),
            expect.any(Object)
        );
    });

    it('ne crash pas si fetch échoue (ok: false)', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as any);
        await expect(loadPOIsForTile(makeTile())).resolves.toBeUndefined();
    });

    it('ne crash pas si fetch throw une erreur réseau', async () => {
        vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));
        await expect(loadPOIsForTile(makeTile())).resolves.toBeUndefined();
    });

    it('utilise le cache mémoire si déjà présent (pas de fetch)', async () => {
        // Premier appel → fetch
        vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
        } as any);

        const tile = makeTile();
        await loadPOIsForTile(tile);
        const callCount = (global.fetch as any).mock.calls.length;

        // Second appel même zone → ne doit pas re-fetcher
        tile.poiGroup = null;
        await loadPOIsForTile(tile);
        expect((global.fetch as any).mock.calls.length).toBe(callCount);
    });
});
