import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../iapService', () => ({
    iapService: {
        waitForInit: vi.fn().mockResolvedValue(true),
        checkAllPackPurchases: vi.fn().mockResolvedValue([]),
        getPackPrice: vi.fn().mockResolvedValue('—'),
    },
}));

vi.mock('../../toast', () => ({ showToast: vi.fn() }));
vi.mock('../../haptics', () => ({ haptic: { light: vi.fn() } }));
vi.mock('../../packCatalog', () => ({
    getAvailablePacks: vi.fn(() => [
        {
            id: 'switzerland',
            productId: 'suntrail_pack_switzerland',
            name: {
                fr: 'Suisse HD',
                en: 'Switzerland HD',
                de: 'Schweiz HD',
                it: 'Svizzera HD',
            },
            bounds: { minLat: 45, maxLat: 48, minLon: 5, maxLon: 11 },
            lodRange: { min: 8, max: 14 },
            version: 3,
            sizeMB: 664,
            cdnUrl: 'https://example.com/pack.pmtiles',
            regionCheck: 'CH',
        },
    ]),
    fetchCatalog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../packManager', () => ({
    packManager: {
        getPackState: vi.fn(() => ({
            status: 'not_purchased',
            downloadProgress: 0,
            installedVersion: 0,
        })),
        deletePack: vi.fn(),
        cancelDownload: vi.fn(),
        downloadPack: vi.fn(),
        getStorageInfo: vi.fn(() => ({ usedMB: 0, quotaMB: 1024 })),
    },
}));

import { PacksSheet } from './PacksSheet';

describe('PacksSheet', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="template-packs">
                <button id="close-packs"></button>
                <div id="packs-list"></div>
                <div id="packs-storage-info"></div>
            </div>
            <div id="sheet-container"></div>
        `;
        vi.clearAllMocks();
    });

    it('constructs without throwing', () => {
        const sheet = new PacksSheet();
        expect(sheet).toBeDefined();
        sheet.dispose();
    });

    it("render ne lance pas d'erreur", () => {
        const sheet = new PacksSheet();
        (sheet as any).element = document.getElementById('template-packs');
        sheet.render();
        sheet.dispose();
    });

    it('dispose cleans up without errors', () => {
        const sheet = new PacksSheet();
        (sheet as any).element = document.getElementById('template-packs');
        sheet.render();
        sheet.dispose();
        expect((sheet as any).element).toBeNull();
    });
});
