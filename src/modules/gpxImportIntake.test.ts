import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPlugin, mockCapacitor, mockImportGpxTrack, mockShowToast, mockT } =
    vi.hoisted(() => ({
        mockPlugin: {
            addListener: vi.fn(),
            openAppAssociationSettings: vi.fn(),
        },
        mockCapacitor: { isNativePlatform: vi.fn(() => true) },
        mockImportGpxTrack: vi.fn(),
        mockShowToast: vi.fn(),
        mockT: vi.fn((key: string) => key),
    }));

vi.mock('@capacitor/core', () => ({
    Capacitor: mockCapacitor,
    registerPlugin: vi.fn(() => mockPlugin),
}));

vi.mock('./gpxImportFlow', () => ({
    importGpxTrack: mockImportGpxTrack,
}));

vi.mock('./toast', () => ({ showToast: mockShowToast }));
vi.mock('../i18n/I18nService', () => ({ i18n: { t: mockT } }));
vi.mock('./state', () => ({ state: { DEBUG_MODE: false } }));

import {
    initGpxImportIntake,
    openGpxAssociationSettings,
} from './gpxImportIntake';

function lastHandler(): (payload: unknown) => void {
    return mockPlugin.addListener.mock.calls.at(-1)![1];
}

describe('gpxImportIntake', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCapacitor.isNativePlatform.mockReturnValue(true);
        mockImportGpxTrack.mockResolvedValue({
            status: 'imported',
            opened: true,
        });
        mockPlugin.addListener.mockResolvedValue({ remove: vi.fn() });
    });

    it('enregistre l’écouteur natif sur Android', async () => {
        await initGpxImportIntake();

        expect(mockPlugin.addListener).toHaveBeenCalledWith(
            'gpxImportReceived',
            expect.any(Function)
        );
    });

    it('ne fait rien sur le Web', async () => {
        mockCapacitor.isNativePlatform.mockReturnValue(false);

        await initGpxImportIntake();

        expect(mockPlugin.addListener).not.toHaveBeenCalled();
    });

    it('importe un GPX partagé via le pipeline commun', async () => {
        await initGpxImportIntake();

        lastHandler()({ files: [{ name: 'Boucle.gpx', xml: '<gpx/>' }] });

        await vi.waitFor(() =>
            expect(mockImportGpxTrack).toHaveBeenCalledWith(
                '<gpx/>',
                'Boucle.gpx'
            )
        );
    });

    it('signale une lecture native en échec sans importer', async () => {
        await initGpxImportIntake();

        lastHandler()({ files: [{ name: 'x.gpx', error: 'too-large' }] });

        await vi.waitFor(() =>
            expect(mockShowToast).toHaveBeenCalledWith('gpx.shareTooLarge')
        );
        expect(mockImportGpxTrack).not.toHaveBeenCalled();
    });

    it('signale un échec d’import', async () => {
        mockImportGpxTrack.mockRejectedValueOnce(new Error('boom'));
        await initGpxImportIntake();

        lastHandler()({ files: [{ name: 'x.gpx', xml: '<gpx/>' }] });

        await vi.waitFor(() =>
            expect(mockShowToast).toHaveBeenCalledWith('gpx.importError')
        );
    });

    it('ouvre les réglages d’association sur Android', async () => {
        mockPlugin.openAppAssociationSettings.mockResolvedValue(undefined);

        const opened = await openGpxAssociationSettings();

        expect(opened).toBe(true);
        expect(mockPlugin.openAppAssociationSettings).toHaveBeenCalledTimes(1);
    });

    it('ne demande aucun réglage sur le Web', async () => {
        mockCapacitor.isNativePlatform.mockReturnValue(false);

        const opened = await openGpxAssociationSettings();

        expect(opened).toBe(false);
        expect(mockPlugin.openAppAssociationSettings).not.toHaveBeenCalled();
    });
});
