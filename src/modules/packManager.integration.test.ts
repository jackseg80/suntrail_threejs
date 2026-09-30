import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { packArchiveFilename, packManager } from './packManager';
import * as pmtiles from 'pmtiles';
import { state } from './state';

const {
    mockIsNativePlatform,
    mockWaitForInit,
    mockCheckAllPackPurchases,
    mockPmtilesGetHeader,
    mockPmtilesGetMetadata,
    mockRemovePackFile,
} = vi.hoisted(() => ({
    mockIsNativePlatform: vi.fn(() => false),
    mockWaitForInit: vi.fn().mockResolvedValue(false),
    mockCheckAllPackPurchases: vi.fn().mockResolvedValue([]),
    mockPmtilesGetHeader: vi.fn().mockResolvedValue({
        minZoom: 8,
        maxZoom: 14,
        numTileEntries: 1000,
        minLon: 5,
        maxLon: 11,
        minLat: 45,
        maxLat: 48,
    }),
    mockPmtilesGetMetadata: vi.fn().mockResolvedValue({}),
    mockRemovePackFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: mockIsNativePlatform },
}));

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
                getHeader: mockPmtilesGetHeader,
                getMetadata: mockPmtilesGetMetadata,
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
        waitForInit: mockWaitForInit,
        checkAllPackPurchases: mockCheckAllPackPurchases,
    },
}));

beforeEach(() => {
    mockIsNativePlatform.mockReturnValue(false);
    mockWaitForInit.mockResolvedValue(false);
    mockCheckAllPackPurchases.mockResolvedValue([]);
    mockPmtilesGetHeader.mockResolvedValue({
        minZoom: 8,
        maxZoom: 14,
        numTileEntries: 1000,
        minLon: 5,
        maxLon: 11,
        minLat: 45,
        maxLat: 48,
    });
    mockRemovePackFile.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('PackManager Integration', () => {
    it('reserves a separate filename for the reduced Swiss pack', () => {
        expect(packArchiveFilename('switzerland', 3)).toBe(
            'switzerland.pmtiles'
        );
        expect(packArchiveFilename('switzerland', 6)).toBe(
            'switzerland-v6.pmtiles'
        );
        expect(packArchiveFilename('austria', 1)).toBe('austria.pmtiles');
    });

    it('ne révoque pas le pack embarqué diagnostic après vérification des achats', async () => {
        vi.stubEnv(
            'VITE_DIAGNOSTIC_PACK_URL',
            './diagnostic/suntrail-pack-switzerland-sample-v2-trimmed.pmtiles'
        );
        mockWaitForInit.mockResolvedValue(true);
        mockCheckAllPackPurchases.mockResolvedValue([]);
        packManager.markPurchased('switzerland_diagnostic');
        await (packManager as any).syncPackPurchases();
        expect(packManager.getPackState('switzerland_diagnostic')?.status).toBe(
            'purchased'
        );
    });

    function setupDownloadTarget(fileSize: number) {
        let exists = false;
        const writable = {
            write: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockImplementation(async () => {
                exists = true;
            }),
            abort: vi.fn().mockResolvedValue(undefined),
        };
        const fileHandle = {
            createWritable: vi.fn().mockResolvedValue(writable),
            getFile: vi.fn().mockResolvedValue({ size: fileSize }),
        };
        const directory = {
            getFileHandle: vi
                .fn()
                .mockImplementation(
                    async (_name: string, options?: { create?: boolean }) => {
                        if (options?.create || exists) return fileHandle;
                        throw new Error('File not found');
                    }
                ),
            removeEntry: mockRemovePackFile,
        };
        (navigator as any).storage.getDirectory = vi.fn().mockResolvedValue({
            getDirectoryHandle: vi.fn().mockResolvedValue(directory),
        });
        return { writable, fileHandle, directory };
    }

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
        mockIsNativePlatform.mockReturnValue(false);

        // Mock OPFS - par défaut, le fichier n'existe pas
        const mockDirectoryHandle = {
            getFileHandle: vi
                .fn()
                .mockRejectedValue(new Error('File not found')),
            removeEntry: mockRemovePackFile,
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

    it('ne déclare installé qu’un téléchargement OPFS complet et lisible', async () => {
        const bytes = new Uint8Array(256);
        const target = setupDownloadTarget(bytes.byteLength);
        mockPmtilesGetHeader.mockResolvedValue({
            minZoom: 8,
            maxZoom: 19,
            rootDirectoryOffset: 127,
            rootDirectoryLength: 10,
            jsonMetadataOffset: 137,
            jsonMetadataLength: 10,
            leafDirectoryOffset: 147,
            leafDirectoryLength: 0,
            tileDataOffset: 147,
            tileDataLength: 109,
            numTileEntries: 1,
        });
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(bytes, {
                    headers: { 'content-length': String(bytes.byteLength) },
                })
            )
        );
        await packManager.initialize();

        await expect(packManager.downloadPack('switzerland')).resolves.toBe(
            true
        );

        expect(target.writable.write).toHaveBeenCalled();
        expect(mockPmtilesGetMetadata).toHaveBeenCalled();
        expect(packManager.getPackState('switzerland')).toMatchObject({
            status: 'installed',
            installedVersion: 6,
            filePath: 'opfs://packs/switzerland-v6.pmtiles',
        });
    });

    it('remplace une ancienne archive montée après un téléchargement validé', async () => {
        const bytes = new Uint8Array(256);
        setupDownloadTarget(bytes.byteLength);
        mockPmtilesGetHeader.mockResolvedValue({
            minZoom: 8,
            maxZoom: 19,
            rootDirectoryOffset: 127,
            rootDirectoryLength: 10,
            jsonMetadataOffset: 137,
            jsonMetadataLength: 10,
            leafDirectoryOffset: 147,
            leafDirectoryLength: 0,
            tileDataOffset: 147,
            tileDataLength: 109,
            numTileEntries: 1,
        });
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(bytes, {
                    headers: { 'content-length': String(bytes.byteLength) },
                })
            )
        );
        await packManager.initialize();

        const previousArchive = {};
        (packManager as any).mountedArchives.set('switzerland', {
            archive: previousArchive,
            source: 'opfs',
        });

        await expect(packManager.downloadPack('switzerland')).resolves.toBe(
            true
        );
        expect(
            (packManager as any).mountedArchives.get('switzerland')?.archive
        ).not.toBe(previousArchive);
    });

    it('rejette et supprime un téléchargement plus court que Content-Length', async () => {
        const bytes = new Uint8Array(128);
        setupDownloadTarget(bytes.byteLength);
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(bytes, {
                    headers: { 'content-length': '256' },
                })
            )
        );
        await packManager.initialize();

        await expect(packManager.downloadPack('switzerland')).resolves.toBe(
            false
        );

        expect(packManager.getPackState('switzerland')?.status).toBe('error');
        await vi.waitFor(() => expect(mockRemovePackFile).toHaveBeenCalled());
    });

    it('signale un quota OPFS épuisé sans déclarer un premier téléchargement installé', async () => {
        const bytes = new Uint8Array(128);
        const target = setupDownloadTarget(bytes.byteLength);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        target.writable.write.mockRejectedValue(
            new DOMException('Storage full', 'QuotaExceededError')
        );
        target.writable.abort.mockRejectedValue(new Error('abort failed'));
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(bytes, {
                    headers: { 'content-length': String(bytes.byteLength) },
                })
            )
        );
        await packManager.initialize();

        await expect(packManager.downloadPack('switzerland')).resolves.toBe(
            false
        );
        expect(target.writable.abort).toHaveBeenCalledTimes(1);
        expect(mockRemovePackFile).toHaveBeenCalledWith(
            'switzerland-v6.pmtiles'
        );
        expect(packManager.getPackState('switzerland')).toMatchObject({
            status: 'error',
            filePath: null,
        });
        expect(warnSpy).toHaveBeenCalledWith(
            '[Packs] OPFS abort failed:',
            expect.any(Error)
        );
        warnSpy.mockRestore();
    });

    it('rejette une section PMTiles qui dépasse la taille OPFS', async () => {
        const bytes = new Uint8Array(256);
        setupDownloadTarget(bytes.byteLength);
        mockPmtilesGetHeader.mockResolvedValue({
            minZoom: 8,
            maxZoom: 19,
            rootDirectoryOffset: 127,
            rootDirectoryLength: 10,
            jsonMetadataOffset: 137,
            jsonMetadataLength: 10,
            leafDirectoryOffset: 147,
            leafDirectoryLength: 0,
            tileDataOffset: 147,
            tileDataLength: 200,
            numTileEntries: 1,
        });
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(bytes, {
                    headers: { 'content-length': String(bytes.byteLength) },
                })
            )
        );
        await packManager.initialize();

        await expect(packManager.downloadPack('switzerland')).resolves.toBe(
            false
        );

        expect(packManager.getPackState('switzerland')?.status).toBe('error');
        await vi.waitFor(() => expect(mockRemovePackFile).toHaveBeenCalled());
    });

    it('ne traite pas le localhost Capacitor comme un mode développement', async () => {
        mockIsNativePlatform.mockReturnValue(true);

        await packManager.initialize();

        expect(state.purchasedPacks).toEqual([]);
        expect([...(packManager as any).mountedArchives.keys()]).toEqual([]);
    });

    it('nettoie une fois les anciens déblocages localhost natifs', async () => {
        mockIsNativePlatform.mockReturnValue(true);
        localStorage.setItem(
            'suntrail_pack_states',
            JSON.stringify(
                Object.fromEntries(
                    ['switzerland', 'france_alps', 'austria'].map((id) => [
                        id,
                        {
                            id,
                            status: 'purchased',
                            installedVersion: 0,
                            downloadProgress: 0,
                            filePath: null,
                            sizeMB: 0,
                        },
                    ])
                )
            )
        );

        await packManager.initialize();

        expect(state.purchasedPacks).toEqual([]);
        expect(
            localStorage.getItem('suntrail_native_localhost_unlock_cleanup_v1')
        ).toBe('1');
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

    it('does not keep an installed state when the OPFS pack file is missing', async () => {
        localStorage.setItem(
            'suntrail_pack_states',
            JSON.stringify({
                switzerland: {
                    id: 'switzerland',
                    status: 'installed',
                    installedVersion: 3,
                    filePath: 'opfs://packs/switzerland.pmtiles',
                    sizeMB: 664,
                },
            })
        );

        await packManager.initialize();

        const reconciled = packManager.getPackState('switzerland');
        expect(reconciled).toMatchObject({
            installedVersion: 0,
            filePath: null,
            sizeMB: 0,
        });
        expect(reconciled?.status).not.toBe('installed');
        expect(state.installedPacks).not.toContain('switzerland');
        expect(
            (packManager as any).mountedArchives.get('switzerland')
        ).toMatchObject({ source: 'cdn' });
    });

    it('retire une archive OPFS corrompue et demande un nouveau téléchargement', async () => {
        mockIsNativePlatform.mockReturnValue(true);
        const root = await (navigator as any).storage.getDirectory();
        const packsDir = await root.getDirectoryHandle();
        packsDir.getFileHandle.mockResolvedValue({
            getFile: vi.fn().mockResolvedValue(new Blob(['corrupt'])),
        });
        mockPmtilesGetHeader.mockRejectedValueOnce(
            new RangeError('Offset is outside the bounds of the DataView')
        );
        localStorage.setItem(
            'suntrail_pack_states',
            JSON.stringify({
                switzerland: {
                    id: 'switzerland',
                    status: 'installed',
                    installedVersion: 3,
                    filePath: 'opfs://packs/switzerland.pmtiles',
                    sizeMB: 664,
                },
            })
        );

        await packManager.initialize();

        expect(packManager.getPackState('switzerland')).toMatchObject({
            status: 'error',
            installedVersion: 0,
            filePath: null,
            sizeMB: 0,
        });
        expect(mockRemovePackFile).toHaveBeenCalledWith('switzerland.pmtiles');
        expect(
            (packManager as any).mountedArchives.get('switzerland')
        ).toBeUndefined();
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
        await expect(
            packManager.getOfflineTileFromPacks(z, x, y)
        ).resolves.toBeDefined();
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

    it('uses an explicitly declared lossless elevation parent only for reduced packs', async () => {
        const archive = {
            getZxy: vi.fn().mockResolvedValue({
                data: new Uint8Array([1, 2, 3]).buffer,
            }),
        };
        const mountedArchives = (packManager as any).mountedArchives as Map<
            string,
            unknown
        >;
        mountedArchives.clear();
        mountedArchives.set('switzerland', {
            archive,
            source: 'opfs',
            elevationMaxZoom: 12,
        });

        const parent = await packManager.getTileFromPacksDetailed(
            14,
            8535,
            5802,
            'elevation',
            true
        );
        expect(parent?.elevationSourceZoom).toBe(12);
        expect(pmtiles.zxyToTileId).toHaveBeenCalledWith(12, 2133, 1450);

        vi.mocked(pmtiles.zxyToTileId).mockClear();
        mountedArchives.set('switzerland', { archive, source: 'opfs' });
        const exact = await packManager.getTileFromPacksDetailed(
            14,
            8535,
            5802,
            'elevation',
            true
        );
        expect(exact?.elevationSourceZoom).toBe(14);
        expect(pmtiles.zxyToTileId).toHaveBeenCalledWith(14, 8535, 5802);
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
        state.IS_OFFLINE = false;

        const z = 12;
        const x = 2133;
        const y = 1450;

        await expect(
            packManager.getOfflineTileFromPacks(z, x, y)
        ).resolves.toBeNull();
        state.IS_OFFLINE = true;
        await expect(packManager.getTileFromPacks(z, x, y)).resolves.toBeNull();
    });

    it('does not report a CDN fallback as an offline OPFS read', async () => {
        const archive = {
            getZxy: vi.fn().mockResolvedValue({
                data: new Uint8Array([1, 2, 3]).buffer,
            }),
        };
        const mountedArchives = (packManager as any).mountedArchives as Map<
            string,
            unknown
        >;
        mountedArchives.clear();
        mountedArchives.set('switzerland', {
            archive,
            source: 'cdn',
        });

        const z = 12;
        const x = 2133;
        const y = 1450;

        await expect(
            packManager.getOfflineTileFromPacks(z, x, y)
        ).resolves.toBeNull();
        await expect(
            packManager.getTileFromPacksDetailed(z, x, y, 'color', false)
        ).resolves.toMatchObject({ source: 'cdn', packId: 'switzerland' });
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
        await setupPackWithFilePresent('switzerland', 'installed', 3);
        await packManager.initialize();
        expect(packManager.hasInstalledPackForCountry('CH')).toBe(true);
    });

    it('hasInstalledPackForCountry(FR) → true quand le pack France est monté', async () => {
        await setupPackWithFilePresent('france_alps', 'installed', 1);
        await packManager.initialize();
        expect(packManager.hasInstalledPackForCountry('FR')).toBe(true);
    });

    it('hasInstalledPackForCountry(AT) → true quand le pack Autriche est monté', async () => {
        await setupPackWithFilePresent('austria', 'installed', 2);
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

    it('hasLocalPackForCountry distingue un pack OPFS d’un pack CDN', async () => {
        await setupPackWithFilePresent('switzerland', 'installed', 3);
        await packManager.initialize();
        expect(packManager.hasLocalPackForCountry('CH')).toBe(true);
        packManager.unmountPack('switzerland');

        localStorage.clear();
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
        const noFileRoot = {
            getDirectoryHandle: vi
                .fn()
                .mockRejectedValue(new Error('no packs dir')),
        };
        (navigator as any).storage.getDirectory = vi
            .fn()
            .mockResolvedValue(noFileRoot);
        mockWaitForInit.mockResolvedValueOnce(true);
        mockCheckAllPackPurchases.mockResolvedValueOnce(['switzerland']);
        await packManager.initialize();

        await vi.waitFor(() =>
            expect(packManager.hasInstalledPackForCountry('CH')).toBe(true)
        );
        expect(packManager.hasLocalPackForCountry('CH')).toBe(false);
        packManager.unmountPack('switzerland');
    });

    it('considère un asset embarqué comme local et le sert hors ligne', async () => {
        const archive = {
            getZxy: vi.fn().mockResolvedValue({
                data: new Uint8Array([1, 2, 3]).buffer,
            }),
        };
        (packManager as any).mountedArchives.set('switzerland', {
            archive,
            source: 'asset',
        });

        expect(packManager.hasLocalPackForCountry('CH')).toBe(true);
        expect(packManager.hasLocalPackForCountry('FR')).toBe(false);
        state.IS_OFFLINE = true;
        await expect(
            packManager.getOfflineTileFromPacks(12, 2133, 1450, 'color')
        ).resolves.toBeInstanceOf(Blob);
        await expect(
            packManager.getTileFromPacksDetailed(
                12,
                2133,
                1450,
                'elevation',
                false
            )
        ).resolves.toMatchObject({
            packId: 'switzerland',
            source: 'asset',
        });

        packManager.unmountPack('switzerland');
        state.IS_OFFLINE = false;
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

    it('isole état et archive v6 sans remplacer le pack lu par un ancien client', async () => {
        const catalogUrl =
            'https://pub-80e58a345eb447ce9b918f2ad4348458.r2.dev/catalog-v6.json';
        vi.stubEnv('VITE_PACKS_CATALOG_URL', catalogUrl);
        vi.resetModules();
        mockIsNativePlatform.mockReturnValue(true);
        mockPmtilesGetHeader.mockResolvedValue({
            minZoom: 8,
            maxZoom: 19,
            rootDirectoryOffset: 127,
            rootDirectoryLength: 10,
            jsonMetadataOffset: 137,
            jsonMetadataLength: 10,
            leafDirectoryOffset: 147,
            leafDirectoryLength: 0,
            tileDataOffset: 147,
            tileDataLength: 109,
            numTileEntries: 1,
        });
        mockPmtilesGetMetadata.mockResolvedValue({
            elevationMaxZoom: 12,
            elevationEncoding: 'terrain-rgb-v2-lossless-webp',
        });

        const legacyState = JSON.stringify({
            switzerland: {
                id: 'switzerland',
                status: 'installed',
                installedVersion: 3,
                downloadProgress: 1,
                filePath: 'opfs://packs/switzerland.pmtiles',
                sizeMB: 664,
            },
        });
        localStorage.setItem('suntrail_pack_states', legacyState);

        const files = new Set(['switzerland.pmtiles']);
        const abortWrite = vi.fn().mockResolvedValue(undefined);
        let failQuotaWrite = false;
        let failDeleteFilename: string | null = null;
        mockRemovePackFile.mockImplementation(async (filename: string) => {
            if (filename === failDeleteFilename) {
                throw new DOMException('Permission denied', 'NotAllowedError');
            }
            files.delete(filename);
        });
        const getFileHandle = vi
            .fn()
            .mockImplementation(
                async (filename: string, options?: { create?: boolean }) => {
                    if (!options?.create && !files.has(filename)) {
                        throw new Error('File not found');
                    }
                    return {
                        getFile: vi
                            .fn()
                            .mockResolvedValue(new Blob([new Uint8Array(256)])),
                        createWritable: vi.fn().mockResolvedValue({
                            write: vi.fn().mockImplementation(async () => {
                                if (failQuotaWrite) {
                                    throw new DOMException(
                                        'Storage full',
                                        'QuotaExceededError'
                                    );
                                }
                            }),
                            close: vi.fn().mockImplementation(async () => {
                                files.add(filename);
                            }),
                            abort: abortWrite,
                        }),
                    };
                }
            );
        const directory = {
            getFileHandle,
            removeEntry: mockRemovePackFile,
            entries: async function* () {
                for (const name of files) yield [name, { kind: 'file' }];
            },
        };
        (navigator as any).storage.getDirectory = vi.fn().mockResolvedValue({
            getDirectoryHandle: vi.fn().mockResolvedValue(directory),
        });

        const archiveBytes = new Uint8Array(256);
        let failArchiveFetch = false;
        let waitForArchiveAbort = false;
        const catalog = {
            version: 5,
            packs: [
                {
                    id: 'switzerland',
                    productId: 'suntrail_pack_switzerland',
                    name: { fr: 'Suisse HD' },
                    bounds: {
                        minLat: 45.8,
                        maxLat: 47.8,
                        minLon: 5.9,
                        maxLon: 10.5,
                    },
                    lodRange: { min: 8, max: 14 },
                    version: 6,
                    sizeMB: 592,
                    cdnUrl: 'https://example.test/switzerland-v6.pmtiles',
                    regionCheck: 'CH',
                },
            ],
        };
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockImplementation(
                    (url: string, options?: { signal?: AbortSignal }) => {
                        if (url === catalogUrl) {
                            return Promise.resolve(
                                new Response(JSON.stringify(catalog), {
                                    status: 200,
                                })
                            );
                        }
                        if (waitForArchiveAbort) {
                            return new Promise((_resolve, reject) => {
                                const fail = () =>
                                    reject(
                                        new DOMException(
                                            'Aborted',
                                            'AbortError'
                                        )
                                    );
                                if (options?.signal?.aborted) fail();
                                else
                                    options?.signal?.addEventListener(
                                        'abort',
                                        fail,
                                        {
                                            once: true,
                                        }
                                    );
                            });
                        }
                        if (failArchiveFetch) {
                            return Promise.resolve(
                                new Response(null, { status: 503 })
                            );
                        }
                        return Promise.resolve(
                            new Response(archiveBytes, {
                                status: 200,
                                headers: {
                                    'content-length': String(
                                        archiveBytes.byteLength
                                    ),
                                },
                            })
                        );
                    }
                )
        );

        const { packManager: versionedManager } = await import('./packManager');
        await versionedManager.initialize();
        expect(versionedManager.getPackState('switzerland')).toMatchObject({
            status: 'update_available',
            installedVersion: 3,
            filePath: 'opfs://packs/switzerland.pmtiles',
        });

        waitForArchiveAbort = true;
        const cancelledDownload = versionedManager.downloadPack('switzerland');
        versionedManager.cancelDownload('switzerland');
        await expect(cancelledDownload).resolves.toBe(false);
        expect(abortWrite).toHaveBeenCalledTimes(1);
        expect(files).toEqual(new Set(['switzerland.pmtiles']));
        expect(versionedManager.getPackState('switzerland')).toMatchObject({
            status: 'update_available',
            installedVersion: 3,
            filePath: 'opfs://packs/switzerland.pmtiles',
        });
        expect(localStorage.getItem('suntrail_pack_states')).toBe(legacyState);

        waitForArchiveAbort = false;
        failArchiveFetch = true;
        await expect(
            versionedManager.downloadPack('switzerland')
        ).resolves.toBe(false);
        expect(abortWrite).toHaveBeenCalledTimes(2);
        expect(files).toEqual(new Set(['switzerland.pmtiles']));
        expect(versionedManager.getPackState('switzerland')).toMatchObject({
            status: 'update_available',
            installedVersion: 3,
            filePath: 'opfs://packs/switzerland.pmtiles',
        });
        expect(localStorage.getItem('suntrail_pack_states')).toBe(legacyState);
        await vi.waitFor(() =>
            expect(mockRemovePackFile).toHaveBeenCalledWith(
                'switzerland-v6.pmtiles'
            )
        );

        failArchiveFetch = false;
        failQuotaWrite = true;
        await expect(
            versionedManager.downloadPack('switzerland')
        ).resolves.toBe(false);
        expect(abortWrite).toHaveBeenCalledTimes(3);
        expect(files).toEqual(new Set(['switzerland.pmtiles']));
        expect(versionedManager.getPackState('switzerland')).toMatchObject({
            status: 'update_available',
            installedVersion: 3,
            filePath: 'opfs://packs/switzerland.pmtiles',
        });

        // A process death leaves a persisted `downloading` status. Recovery
        // must remount the old file and discard only the interrupted v6 target.
        const scopedKey = `suntrail_pack_states:${encodeURIComponent(catalogUrl)}`;
        localStorage.setItem(
            scopedKey,
            JSON.stringify({
                switzerland: {
                    ...versionedManager.getPackState('switzerland'),
                    status: 'downloading',
                    downloadProgress: 0.5,
                },
            })
        );
        files.add('switzerland-v6.pmtiles');
        files.add('switzerland-v6.pmtiles.crswap');
        vi.resetModules();
        const { packManager: recoveredManager } = await import('./packManager');
        await recoveredManager.initialize();
        expect(recoveredManager.getPackState('switzerland')).toMatchObject({
            status: 'update_available',
            installedVersion: 3,
            filePath: 'opfs://packs/switzerland.pmtiles',
        });
        expect(files).toEqual(new Set(['switzerland.pmtiles']));
        expect(localStorage.getItem('suntrail_pack_states')).toBe(legacyState);

        failQuotaWrite = false;
        await expect(
            recoveredManager.downloadPack('switzerland')
        ).resolves.toBe(true);
        expect(files).toEqual(
            new Set(['switzerland.pmtiles', 'switzerland-v6.pmtiles'])
        );
        expect(recoveredManager.getPackState('switzerland')).toMatchObject({
            status: 'installed',
            installedVersion: 6,
            filePath: 'opfs://packs/switzerland-v6.pmtiles',
        });
        expect(localStorage.getItem('suntrail_pack_states')).toBe(legacyState);
        expect(localStorage.getItem(scopedKey)).toContain(
            'switzerland-v6.pmtiles'
        );
        expect(getFileHandle).toHaveBeenCalledWith('switzerland-v6.pmtiles', {
            create: true,
        });

        vi.resetModules();
        const { packManager: restartedManager } = await import('./packManager');
        await restartedManager.initialize();
        expect(restartedManager.getPackState('switzerland')).toMatchObject({
            status: 'installed',
            installedVersion: 6,
            filePath: 'opfs://packs/switzerland-v6.pmtiles',
        });
        expect(
            (restartedManager as any).mountedArchives.get('switzerland')
        ).toMatchObject({ source: 'opfs', elevationMaxZoom: 12 });
        expect(localStorage.getItem('suntrail_pack_states')).toBe(legacyState);

        const fetchCount = vi.mocked(fetch).mock.calls.length;
        await expect(
            restartedManager.downloadPack('switzerland')
        ).resolves.toBe(true);
        expect(vi.mocked(fetch).mock.calls.length).toBe(fetchCount);

        failDeleteFilename = 'switzerland.pmtiles';
        await restartedManager.deletePack('switzerland');
        expect(restartedManager.getPackState('switzerland')).toMatchObject({
            status: 'installed',
            installedVersion: 6,
            filePath: 'opfs://packs/switzerland-v6.pmtiles',
        });
        expect(files).toEqual(
            new Set(['switzerland.pmtiles', 'switzerland-v6.pmtiles'])
        );

        failDeleteFilename = null;
        await restartedManager.deletePack('switzerland');
        expect(mockRemovePackFile).toHaveBeenCalledWith(
            'switzerland-v6.pmtiles'
        );
        expect(mockRemovePackFile).toHaveBeenCalledWith('switzerland.pmtiles');
        expect(files.size).toBe(0);
        expect(restartedManager.getPackState('switzerland')).toMatchObject({
            status: 'purchased',
            filePath: null,
        });

        // On rollback, the legacy client still has its original localStorage
        // record, but must reconcile it against the now-empty OPFS directory.
        expect(localStorage.getItem('suntrail_pack_states')).toBe(legacyState);
        vi.stubEnv('VITE_PACKS_CATALOG_URL', '');
        vi.resetModules();
        const { packManager: legacyManager } = await import('./packManager');
        await legacyManager.initialize();
        expect(legacyManager.getPackState('switzerland')).toMatchObject({
            status: 'purchased',
            installedVersion: 0,
            filePath: null,
        });
    });
});
