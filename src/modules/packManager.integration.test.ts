import { describe, it, expect, vi, beforeEach } from 'vitest';
import { packManager } from './packManager';
import { state } from './state';

// Mocking Capacitor Filesystem
vi.mock('@capacitor/filesystem', () => ({
    Filesystem: {
        deleteFile: vi.fn().mockResolvedValue({}),
    },
    Directory: {
        External: 'EXTERNAL',
    },
}));

// Mocking PMTiles
vi.mock('pmtiles', () => {
    return {
        PMTiles: function () {
            return {
                getHeader: vi.fn().mockResolvedValue({
                    minZoom: 8,
                    maxZoom: 14,
                    numTileEntries: 1000,
                    minLon: 5,
                    maxLon: 11,
                    minLat: 45,
                    maxLat: 48,
                }),
                getZxy: vi.fn().mockResolvedValue({
                    data: new Uint8Array([1, 2, 3]).buffer,
                }),
            };
        },
        FileSource: function () {
            return {};
        },
        zxyToTileId: vi.fn((_z, _x, _y) => 123),
        tileIdToZxy: vi.fn((_id) => [12, 2133, 1450]), // Mock simple
    };
});

// Mocking iapService to avoid initialization issues
vi.mock('./iapService', () => ({
    iapService: {
        waitForInit: vi.fn().mockResolvedValue(true),
        checkAllPackPurchases: vi.fn().mockResolvedValue([]),
    },
}));

describe('PackManager Integration', () => {
    it('findPackContaining returns null when catalog is empty', () => {
        const pack = packManager.findPackContaining(46.8, 8.2);
        expect(pack).toBeNull();
    });

    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        // Reset state
        state.IS_OFFLINE = false;
        state.installedPacks = [];
        state.purchasedPacks = [];

        // Mock OPFS - par défaut, le fichier n'existe pas
        const mockDirectoryHandle = {
            getFileHandle: vi
                .fn()
                .mockRejectedValue(new Error('File not found')),
        };
        const mockRoot = {
            getDirectoryHandle: vi.fn().mockResolvedValue(mockDirectoryHandle),
        };

        if (!(navigator as any).storage) {
            (navigator as any).storage = {};
        }
        (navigator as any).storage.getDirectory = vi
            .fn()
            .mockResolvedValue(mockRoot);
    });

    it('findPackContaining returns null when catalog is empty', () => {
        const pack = packManager.findPackContaining(46.8, 8.2);
        expect(pack).toBeNull();
    });

    it('should initialize and load persisted states from localStorage', async () => {
        // Pour ce test, on simule que le fichier EXISTE sur le disque
        const mockRoot = await (navigator as any).storage.getDirectory();
        const mockDir = await mockRoot.getDirectoryHandle();
        mockDir.getFileHandle.mockResolvedValue({
            getFile: vi.fn().mockResolvedValue(new Blob()),
        });

        localStorage.setItem(
            'suntrail_pack_states',
            JSON.stringify({
                switzerland: {
                    id: 'switzerland',
                    status: 'installed',
                    installedVersion: 2,
                    filePath: 'opfs://packs/switzerland.pmtiles',
                },
            })
        );

        await packManager.initialize();

        expect(state.installedPacks).toContain('switzerland');

        // CH
        const pack = packManager.findPackContaining(46.8, 8.2);
        expect(pack).not.toBeNull();
        expect(pack!.id).toBe('switzerland');

        // AT
        const austria = packManager.findPackContaining(48.2, 16.3);
        expect(austria).not.toBeNull();
        expect(austria!.id).toBe('austria');

        // Hors packs → null
        expect(packManager.findPackContaining(48.13, 11.58)).toBeNull(); // Munich
    });

    it('should serve a tile from a mounted pack', async () => {
        // Simuler fichier présent
        const mockRoot = await (navigator as any).storage.getDirectory();
        const mockDir = await mockRoot.getDirectoryHandle();
        mockDir.getFileHandle.mockResolvedValue({
            getFile: vi.fn().mockResolvedValue(new Blob()),
        });

        // Setup a mounted pack
        localStorage.setItem(
            'suntrail_pack_states',
            JSON.stringify({
                switzerland: {
                    id: 'switzerland',
                    status: 'installed',
                    installedVersion: 2,
                    filePath: 'opfs://packs/switzerland.pmtiles',
                },
            })
        );

        await packManager.initialize();

        // coordinates for Switzerland approx
        const z = 12;
        const x = 2133;
        const y = 1450;

        const blob = await packManager.getTileFromPacks(z, x, y);
        expect(blob).toBeDefined();
        expect(blob?.type).toBe('image/webp');
    });

    it('should serve elevation and overlay tiles with correct offsets', async () => {
        // Simuler fichier présent
        const mockRoot = await (navigator as any).storage.getDirectory();
        const mockDir = await mockRoot.getDirectoryHandle();
        mockDir.getFileHandle.mockResolvedValue({
            getFile: vi.fn().mockResolvedValue(new Blob()),
        });

        localStorage.setItem(
            'suntrail_pack_states',
            JSON.stringify({
                switzerland: {
                    id: 'switzerland',
                    status: 'installed',
                    installedVersion: 3,
                    filePath: 'opfs://packs/switzerland.pmtiles',
                },
            })
        );

        await packManager.initialize();

        const z = 12,
            x = 2133,
            y = 1450;

        // Elevation
        const elevBlob = await packManager.getTileFromPacks(
            z,
            x,
            y,
            'elevation'
        );
        expect(elevBlob?.type).toBe('image/webp');

        // Overlay
        const overlayBlob = await packManager.getTileFromPacks(
            z,
            x,
            y,
            'overlay'
        );
        expect(overlayBlob?.type).toBe('image/png');
    });

    it('should not serve a tile if offline and pack is not installed (CDN only)', async () => {
        // On s'assure que le fichier n'existe PAS sur le disque (déjà le cas par défaut dans beforeEach)

        // Pack purchased but not installed (CDN)
        localStorage.setItem(
            'suntrail_pack_states',
            JSON.stringify({
                switzerland: {
                    id: 'switzerland',
                    status: 'purchased',
                    installedVersion: 0,
                    filePath: null,
                },
            })
        );

        await packManager.initialize();
        state.IS_OFFLINE = true;

        const z = 12;
        const x = 2133;
        const y = 1450;

        const blob = await packManager.getTileFromPacks(z, x, y);
        expect(blob).toBeNull();
    });
});

// ── P0 : hasInstalledPackForCountry + getMinPackZoom (v5.73.0) ──────────────
describe('PackManager — P0: hasInstalledPackForCountry & getMinPackZoom', () => {
    beforeEach(async () => {
        localStorage.clear();
        vi.clearAllMocks();
        state.IS_OFFLINE = false;
        state.installedPacks = [];
        state.purchasedPacks = [];

        // Mock OPFS — par défaut, le fichier n'existe PAS (évite auto-mount via syncDiskStates)
        const mockRoot = {
            getDirectoryHandle: vi.fn().mockResolvedValue({
                getFileHandle: vi
                    .fn()
                    .mockRejectedValue(new Error('File not found')),
            }),
        };
        if (!(navigator as any).storage) {
            (navigator as any).storage = {};
        }
        (navigator as any).storage.getDirectory = vi
            .fn()
            .mockResolvedValue(mockRoot);
    });

    async function setupPackWithFilePresent(
        packId: string,
        status: string,
        version: number
    ) {
        // Remplacer le mock OPFS pour que le fichier existe
        const mockRoot = {
            getDirectoryHandle: vi.fn().mockResolvedValue({
                getFileHandle: vi.fn().mockResolvedValue({
                    getFile: vi.fn().mockResolvedValue(new Blob()),
                }),
            }),
        };
        (navigator as any).storage.getDirectory = vi
            .fn()
            .mockResolvedValue(mockRoot);

        const states: Record<string, any> = {};
        states[packId] = {
            id: packId,
            status,
            installedVersion: version,
            filePath:
                status === 'installed' || status === 'update_available'
                    ? `opfs://packs/${packId}.pmtiles`
                    : null,
        };
        localStorage.setItem('suntrail_pack_states', JSON.stringify(states));
    }

    it('hasInstalledPackForCountry(CH) → true quand le pack Suisse est monté', async () => {
        localStorage.setItem(
            'suntrail_pack_states',
            JSON.stringify({
                switzerland: {
                    id: 'switzerland',
                    status: 'installed',
                    installedVersion: 3,
                    filePath: 'opfs://packs/switzerland.pmtiles',
                },
            })
        );
        await packManager.initialize();
        expect(packManager.hasInstalledPackForCountry('CH')).toBe(true);
    });

    it('hasInstalledPackForCountry(FR) → true quand le pack France est monté', async () => {
        localStorage.setItem(
            'suntrail_pack_states',
            JSON.stringify({
                france_alps: {
                    id: 'france_alps',
                    status: 'installed',
                    installedVersion: 1,
                    filePath: 'opfs://packs/france_alps.pmtiles',
                },
            })
        );
        await packManager.initialize();
        expect(packManager.hasInstalledPackForCountry('FR')).toBe(true);
    });

    it('hasInstalledPackForCountry(AT) → true quand le pack Autriche est monté', async () => {
        localStorage.setItem(
            'suntrail_pack_states',
            JSON.stringify({
                austria: {
                    id: 'austria',
                    status: 'installed',
                    installedVersion: 2,
                    filePath: 'opfs://packs/austria.pmtiles',
                },
            })
        );
        await packManager.initialize();
        expect(packManager.hasInstalledPackForCountry('AT')).toBe(true);
    });

    it('hasInstalledPackForCountry → false après unmount de tous les packs', async () => {
        // Vérifie que le singleton est propre avant ce test
        // (les tests précédents peuvent laisser des packs montés dans le singleton)
        await setupPackWithFilePresent('switzerland', 'installed', 3);
        await packManager.initialize();
        expect(packManager.hasInstalledPackForCountry('CH')).toBe(true);

        // Unmount pour tester l'état "aucun pack"
        packManager.unmountPack('switzerland');
        expect(packManager.hasInstalledPackForCountry('CH')).toBe(false);
    });

    it('hasInstalledPackForCountry → false avec code vide', async () => {
        localStorage.setItem(
            'suntrail_pack_states',
            JSON.stringify({
                switzerland: {
                    id: 'switzerland',
                    status: 'installed',
                    installedVersion: 3,
                    filePath: 'opfs://packs/switzerland.pmtiles',
                },
            })
        );
        await packManager.initialize();
        expect(packManager.hasInstalledPackForCountry('')).toBe(false);
    });

    it('hasInstalledPackForCountry → false après unmount de tous les packs', async () => {
        await setupPackWithFilePresent('switzerland', 'installed', 3);
        await packManager.initialize();
        expect(packManager.hasInstalledPackForCountry('CH')).toBe(true);

        // Unmount pour tester l'état "aucun pack"
        packManager.unmountPack('switzerland');
        expect(packManager.hasInstalledPackForCountry('CH')).toBe(false);
    });

    it('getMinPackZoom → retourne le LOD min du pack monté', async () => {
        localStorage.setItem(
            'suntrail_pack_states',
            JSON.stringify({
                switzerland: {
                    id: 'switzerland',
                    status: 'installed',
                    installedVersion: 3,
                    filePath: 'opfs://packs/switzerland.pmtiles',
                },
            })
        );
        await packManager.initialize();
        expect(packManager.getMinPackZoom()).toBe(8);
    });

    it('getMinPackZoom → retourne le min parmi plusieurs packs', async () => {
        localStorage.setItem(
            'suntrail_pack_states',
            JSON.stringify({
                switzerland: {
                    id: 'switzerland',
                    status: 'installed',
                    installedVersion: 3,
                    filePath: 'opfs://packs/switzerland.pmtiles',
                },
                austria: {
                    id: 'austria',
                    status: 'installed',
                    installedVersion: 2,
                    filePath: 'opfs://packs/austria.pmtiles',
                },
            })
        );
        await packManager.initialize();
        // Les deux packs ont lodRange.min = 8
        expect(packManager.getMinPackZoom()).toBe(8);
    });
});
