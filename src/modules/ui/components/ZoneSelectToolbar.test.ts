import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockState, mockStateProxy, mockIsProActive } = vi.hoisted(() => {
    const state: Record<string, any> = {
        subscribe: vi.fn(() => vi.fn()),
    };
    const proxy = new Proxy(state, {
        get(target, prop) {
            return target[prop as string];
        },
        set(target, prop, value) {
            target[prop as string] = value;
            return true;
        },
    });
    return {
        mockState: state,
        mockStateProxy: proxy,
        mockIsProActive: vi.fn(() => false),
    };
});

vi.mock('../../state', () => ({
    state: mockStateProxy,
    isProActive: mockIsProActive,
}));

const { mockGetViewportBBox, mockComputeZoneSelection } = vi.hoisted(() => ({
    mockGetViewportBBox: vi.fn(),
    mockComputeZoneSelection: vi.fn(),
}));

vi.mock('../../ZoneSelector', () => ({
    getViewportBBox: mockGetViewportBBox,
    computeZoneSelection: mockComputeZoneSelection,
}));

const {
    mockGetOfflineZoneCount,
    mockIncrementOfflineZoneCount,
    mockDecrementOfflineZoneCount,
    mockDownloadZoneMultiLOD,
    mockEstimateZoneSizeMB,
} = vi.hoisted(() => ({
    mockGetOfflineZoneCount: vi.fn(() => 0),
    mockIncrementOfflineZoneCount: vi.fn(),
    mockDecrementOfflineZoneCount: vi.fn(),
    mockDownloadZoneMultiLOD: vi.fn(),
    mockEstimateZoneSizeMB: vi.fn(() => '~10 Ko'),
}));

vi.mock('../../tileLoader', () => ({
    downloadZoneMultiLOD: mockDownloadZoneMultiLOD,
    getOfflineZoneCount: mockGetOfflineZoneCount,
    incrementOfflineZoneCount: mockIncrementOfflineZoneCount,
    decrementOfflineZoneCount: mockDecrementOfflineZoneCount,
    estimateZoneSizeMB: mockEstimateZoneSizeMB,
}));

const { mockShowUpgradePrompt } = vi.hoisted(() => ({
    mockShowUpgradePrompt: vi.fn(),
}));

vi.mock('../../iap', () => ({
    showUpgradePrompt: mockShowUpgradePrompt,
}));

const { mockShowToast } = vi.hoisted(() => ({
    mockShowToast: vi.fn(),
}));

vi.mock('../../toast', () => ({
    showToast: mockShowToast,
}));

const { mockHaptic } = vi.hoisted(() => ({
    mockHaptic: vi.fn(),
}));

vi.mock('../../haptics', () => ({
    haptic: mockHaptic,
}));

vi.mock('../../../i18n/I18nService', () => ({
    i18n: { t: (k: string) => k, applyToDOM: vi.fn() },
}));

const { mockAddCachedZone } = vi.hoisted(() => ({
    mockAddCachedZone: vi.fn(),
}));

vi.mock('../../cachedZones', () => ({
    addCachedZone: mockAddCachedZone,
}));

const { mockGetPlaceName } = vi.hoisted(() => ({
    mockGetPlaceName: vi.fn(() => Promise.resolve('TestCity')),
}));

vi.mock('../../geocodingService', () => ({
    getPlaceName: mockGetPlaceName,
}));

vi.mock('../templates/zone-select-toolbar.html?raw', () => ({
    default: `<div id="zone-select-toolbar" class="zone-select-toolbar">
        <div class="zone-select-info">
            <div class="zone-select-tile-count" id="zst-tile-count">Zone: ...</div>
            <div class="zone-select-lod-range" id="zst-total-info"></div>
            <div class="zone-select-warning" id="zst-warning"></div>
        </div>
        <div class="zone-select-slider-row">
            <div class="zone-select-slider-labels">
                <span id="zst-min-label">LOD 5</span>
                <span class="zone-select-slider-current-label" id="zst-current-label">Plage LOD</span>
                <span id="zst-max-label">LOD 14</span>
            </div>
            <div class="zone-select-range-wrap">
                <input type="range" id="zst-min-slider" class="zone-select-slider" min="5" max="18" value="5" />
                <input type="range" id="zst-max-slider" class="zone-select-slider" min="5" max="18" value="14" />
            </div>
        </div>
        <div class="zone-select-actions">
            <button id="zst-cancel" class="btn-go zone-select-btn-cancel">Annuler</button>
            <button id="zst-download" class="btn-go zone-select-btn-download">Telecharger</button>
        </div>
    </div>`,
}));

import { ZoneSelectToolbar } from './ZoneSelectToolbar';

function makeFakeZoneSelection(overrides: Record<string, any> = {}) {
    return {
        bbox: { minLat: 46.0, maxLat: 47.0, minLon: 6.0, maxLon: 7.0 },
        tilesByLod: new Map([[14, [{ tx: 0, ty: 0, zoom: 14 }]]]),
        totalTiles: 1,
        totalSizeMB: '~10 Ko',
        tooLarge: false,
        hardWarning: false,
        warning: false,
        ...overrides,
    };
}

function setupDOM() {
    if (!document.getElementById('template-zone-select-toolbar')) {
        const template = document.createElement('template');
        template.id = 'template-zone-select-toolbar';
        template.innerHTML = `<div id="zone-select-toolbar" class="zone-select-toolbar">
            <div class="zone-select-info">
                <div class="zone-select-tile-count" id="zst-tile-count">Zone: ...</div>
                <div class="zone-select-lod-range" id="zst-total-info"></div>
                <div class="zone-select-warning" id="zst-warning"></div>
            </div>
            <div class="zone-select-slider-row">
                <div class="zone-select-slider-labels">
                    <span id="zst-min-label">LOD 5</span>
                    <span class="zone-select-slider-current-label" id="zst-current-label">Plage LOD</span>
                    <span id="zst-max-label">LOD 14</span>
                </div>
                <div class="zone-select-range-wrap">
                    <input type="range" id="zst-min-slider" class="zone-select-slider" min="5" max="18" value="5" />
                    <input type="range" id="zst-max-slider" class="zone-select-slider" min="5" max="18" value="14" />
                </div>
            </div>
            <div class="zone-select-actions">
                <button id="zst-cancel" class="btn-go zone-select-btn-cancel">Annuler</button>
                <button id="zst-download" class="btn-go zone-select-btn-download">Telecharger</button>
            </div>
        </div>`;
        document.head.appendChild(template);
    }
}

describe('ZoneSelectToolbar', () => {
    let toolbar: ZoneSelectToolbar;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState.ZOOM = 14;
        mockState.IS_2D_MODE = true;
        mockState.zoneSelectionActive = false;
        mockState.zoneOverlay = null;
        mockState.scene = null;
        mockGetOfflineZoneCount.mockReturnValue(0);
        mockIsProActive.mockReturnValue(false);
        document.body.innerHTML = '';
        setupDOM();
        toolbar = new ZoneSelectToolbar();
        toolbar.hydrate();
        toolbar['viewportOverlay'] = null;
    });

    afterEach(() => {
        toolbar.dispose();
    });

    describe('render', () => {
        it('hydrate la toolbar et appelle render', () => {
            expect(
                document.getElementById('zone-select-toolbar')
            ).not.toBeNull();
            expect(
                document.querySelector('.zone-select-toolbar.active')
            ).not.toBeNull();
        });

        it('configure les sliders avec la plage LOD correcte', () => {
            const minSlider = document.getElementById(
                'zst-min-slider'
            ) as HTMLInputElement;
            const maxSlider = document.getElementById(
                'zst-max-slider'
            ) as HTMLInputElement;
            expect(minSlider.min).toBe('5');
            expect(minSlider.max).toBe('18');
            expect(maxSlider.min).toBe('5');
            expect(maxSlider.max).toBe('18');
        });

        it("s'abonne à ZOOM et IS_2D_MODE pendant le render", () => {
            expect(mockState.subscribe).toHaveBeenCalledWith(
                'ZOOM',
                expect.any(Function)
            );
            expect(mockState.subscribe).toHaveBeenCalledWith(
                'IS_2D_MODE',
                expect.any(Function)
            );
        });
    });

    describe('updateLabels', () => {
        beforeEach(() => {
            mockGetViewportBBox.mockReturnValue({
                minLat: 46,
                maxLat: 47,
                minLon: 6,
                maxLon: 7,
            });
            mockComputeZoneSelection.mockReturnValue(makeFakeZoneSelection());
            toolbar['recomputeFromVisibleTiles']();
        });

        it('affiche le nombre de tuiles visibles au LOD courant', () => {
            const el = document.getElementById('zst-tile-count');
            expect(el?.textContent).toContain('📦');
            expect(el?.textContent).toContain('LOD 14');
        });

        it('affiche le compteur de zones pour un utilisateur Free', () => {
            mockGetOfflineZoneCount.mockReturnValue(1);
            mockIsProActive.mockReturnValue(false);
            toolbar['updateLabels']();
            const totalEl = document.getElementById('zst-total-info');
            expect(totalEl?.textContent).toContain('1/1');
        });

        it("n'affiche pas le compteur de zones pour un utilisateur Pro", () => {
            mockGetOfflineZoneCount.mockReturnValue(5);
            mockIsProActive.mockReturnValue(true);
            toolbar['updateLabels']();
            const totalEl = document.getElementById('zst-total-info');
            expect(totalEl?.textContent).not.toContain('/1');
        });

        it('affiche un warning tooLarge quand la sélection dépasse 2000 tuiles', () => {
            mockComputeZoneSelection.mockReturnValue(
                makeFakeZoneSelection({ tooLarge: true })
            );
            toolbar['currentSelection'] = makeFakeZoneSelection({
                tooLarge: true,
            });
            toolbar['updateLabels']();
            const warning = document.getElementById('zst-warning');
            expect(warning?.textContent).toContain('tooLarge');
            expect(warning?.classList.contains('visible')).toBe(true);
        });

        it('affiche un warning pour plus de 1000 tuiles', () => {
            mockComputeZoneSelection.mockReturnValue(
                makeFakeZoneSelection({ hardWarning: true })
            );
            toolbar['currentSelection'] = makeFakeZoneSelection({
                hardWarning: true,
            });
            toolbar['updateLabels']();
            const warning = document.getElementById('zst-warning');
            expect(warning?.textContent).toContain('hardWarning');
            expect(warning?.classList.contains('visible')).toBe(true);
        });

        it('affiche un warning pour plus de 500 tuiles', () => {
            mockComputeZoneSelection.mockReturnValue(
                makeFakeZoneSelection({ warning: true })
            );
            toolbar['currentSelection'] = makeFakeZoneSelection({
                warning: true,
            });
            toolbar['updateLabels']();
            const warning = document.getElementById('zst-warning');
            expect(warning?.textContent).toContain('warning');
            expect(warning?.classList.contains('visible')).toBe(true);
        });

        it('désactive le bouton download si aucune tuile sélectionnée', () => {
            mockComputeZoneSelection.mockReturnValue(
                makeFakeZoneSelection({ totalTiles: 0 })
            );
            toolbar['currentSelection'] = makeFakeZoneSelection({
                totalTiles: 0,
            });
            toolbar['updateLabels']();
            const btn = document.getElementById(
                'zst-download'
            ) as HTMLButtonElement;
            expect(btn.disabled).toBe(true);
        });
    });

    describe('download — gate Pro', () => {
        beforeEach(() => {
            toolbar['currentSelection'] = makeFakeZoneSelection();
        });

        it('bloque le téléchargement si Free avec >= 1 zone', async () => {
            mockIsProActive.mockReturnValue(false);
            mockGetOfflineZoneCount.mockReturnValue(1);
            const btn = document.getElementById(
                'zst-download'
            ) as HTMLButtonElement;
            await toolbar['download'](btn);
            expect(mockShowUpgradePrompt).toHaveBeenCalledWith('offline_zones');
            expect(mockDownloadZoneMultiLOD).not.toHaveBeenCalled();
        });

        it('permet le téléchargement si Free avec 0 zone (première zone gratuite)', async () => {
            mockIsProActive.mockReturnValue(false);
            mockGetOfflineZoneCount.mockReturnValue(0);
            mockDownloadZoneMultiLOD.mockResolvedValue(true);
            const btn = document.getElementById(
                'zst-download'
            ) as HTMLButtonElement;
            await toolbar['download'](btn);
            expect(mockShowUpgradePrompt).not.toHaveBeenCalled();
            expect(mockDownloadZoneMultiLOD).toHaveBeenCalled();
        });

        it('permet le téléchargement si Pro même avec plusieurs zones', async () => {
            mockIsProActive.mockReturnValue(true);
            mockGetOfflineZoneCount.mockReturnValue(5);
            mockDownloadZoneMultiLOD.mockResolvedValue(true);
            const btn = document.getElementById(
                'zst-download'
            ) as HTMLButtonElement;
            await toolbar['download'](btn);
            expect(mockShowUpgradePrompt).not.toHaveBeenCalled();
            expect(mockDownloadZoneMultiLOD).toHaveBeenCalled();
        });

        it('ne fait rien si currentSelection est null ou sans tuiles', async () => {
            toolbar['currentSelection'] = null;
            const btn = document.getElementById(
                'zst-download'
            ) as HTMLButtonElement;
            await toolbar['download'](btn);
            expect(mockDownloadZoneMultiLOD).not.toHaveBeenCalled();
            expect(mockIncrementOfflineZoneCount).not.toHaveBeenCalled();

            toolbar['currentSelection'] = makeFakeZoneSelection({
                totalTiles: 0,
            });
            await toolbar['download'](btn);
            expect(mockDownloadZoneMultiLOD).not.toHaveBeenCalled();
        });
    });

    describe('download — slot et succès', () => {
        beforeEach(() => {
            toolbar['currentSelection'] = makeFakeZoneSelection();
            mockDownloadZoneMultiLOD.mockResolvedValue(true);
        });

        it('pré-incrémente le compteur avant le téléchargement', async () => {
            const btn = document.getElementById(
                'zst-download'
            ) as HTMLButtonElement;
            await toolbar['download'](btn);
            expect(mockIncrementOfflineZoneCount).toHaveBeenCalled();
        });

        it('enregistre la zone dans cachedZones avec le nom du lieu', async () => {
            const btn = document.getElementById(
                'zst-download'
            ) as HTMLButtonElement;
            await toolbar['download'](btn);
            expect(mockAddCachedZone).toHaveBeenCalledWith(
                expect.objectContaining({
                    label: expect.stringContaining('TestCity'),
                    bbox: expect.any(Object),
                    tileCount: 1,
                })
            );
        });

        it('joue un haptic et affiche un toast de succès', async () => {
            const btn = document.getElementById(
                'zst-download'
            ) as HTMLButtonElement;
            await toolbar['download'](btn);
            expect(mockHaptic).toHaveBeenCalledWith('success');
            expect(mockShowToast).toHaveBeenCalledWith(
                expect.stringContaining('✅')
            );
        });
    });

    describe('download — échec et erreur', () => {
        beforeEach(() => {
            toolbar['currentSelection'] = makeFakeZoneSelection();
        });

        it('décrémente le compteur et affiche une erreur si le téléchargement échoue', async () => {
            mockDownloadZoneMultiLOD.mockResolvedValue(false);
            const btn = document.getElementById(
                'zst-download'
            ) as HTMLButtonElement;
            await toolbar['download'](btn);
            expect(mockDecrementOfflineZoneCount).toHaveBeenCalled();
            expect(mockShowToast).toHaveBeenCalledWith(
                expect.stringContaining('⛔')
            );
        });

        it("décrémente le compteur et log en cas d'exception", async () => {
            const consoleSpy = vi
                .spyOn(console, 'warn')
                .mockImplementation(() => {});
            mockDownloadZoneMultiLOD.mockRejectedValue(
                new Error('Network error')
            );
            const btn = document.getElementById(
                'zst-download'
            ) as HTMLButtonElement;
            await toolbar['download'](btn);
            expect(mockDecrementOfflineZoneCount).toHaveBeenCalled();
            expect(consoleSpy).toHaveBeenCalledWith(
                '[OfflineZone] Download error:',
                expect.any(Error)
            );
            consoleSpy.mockRestore();
        });
    });

    describe('download — annulation', () => {
        beforeEach(() => {
            toolbar['currentSelection'] = makeFakeZoneSelection();
        });

        it('crée un AbortController pendant le téléchargement', async () => {
            mockDownloadZoneMultiLOD.mockImplementation(
                async (_tiles, _onProgress, signal: AbortSignal) => {
                    expect(signal.aborted).toBe(false);
                    return true;
                }
            );
            const btn = document.getElementById(
                'zst-download'
            ) as HTMLButtonElement;
            await toolbar['download'](btn);
            expect(toolbar['downloadAbort']).toBeNull();
        });

        it('bascule le bouton Annuler en btn-abort pendant le téléchargement', async () => {
            let resolveDownload: (v: boolean) => void;
            mockDownloadZoneMultiLOD.mockReturnValue(
                new Promise<boolean>((r) => {
                    resolveDownload = r;
                })
            );
            const btn = document.getElementById(
                'zst-download'
            ) as HTMLButtonElement;
            const cancelBtn = document.getElementById(
                'zst-cancel'
            ) as HTMLButtonElement;

            const promise = toolbar['download'](btn);

            // Vérifier l'état pendant le téléchargement
            expect(cancelBtn.textContent).toBe('⏹ Annuler le téléchargement');
            expect(cancelBtn.classList.contains('btn-abort')).toBe(true);
            expect(cancelBtn.disabled).toBe(false);

            resolveDownload!(true);
            await promise;
        });

        it('abandonne le téléchargement via cancel() et libère le slot', async () => {
            let resolveDownload: (v: boolean) => void;
            let abortSignal: AbortSignal | undefined;
            mockDownloadZoneMultiLOD.mockImplementation(
                async (_tiles, _onProgress, signal: AbortSignal) => {
                    abortSignal = signal;
                    return new Promise<boolean>((r) => {
                        resolveDownload = r;
                    });
                }
            );
            const btn = document.getElementById(
                'zst-download'
            ) as HTMLButtonElement;
            const promise = toolbar['download'](btn);

            // Annuler pendant le téléchargement
            toolbar['cancel']();

            expect(abortSignal?.aborted).toBe(true);
            expect(mockDecrementOfflineZoneCount).toHaveBeenCalled();
            expect(mockShowToast).toHaveBeenCalledWith(
                expect.stringContaining('annule')
            );

            // Résoudre la promesse pour éviter unhandled rejection
            resolveDownload!(false);
            await promise.catch(() => {});
        });

        it("ne crée pas d'AbortController si le gate bloque", async () => {
            mockIsProActive.mockReturnValue(false);
            mockGetOfflineZoneCount.mockReturnValue(1);
            const btn = document.getElementById(
                'zst-download'
            ) as HTMLButtonElement;
            await toolbar['download'](btn);
            expect(toolbar['downloadAbort']).toBeNull();
        });
    });

    describe('cancel', () => {
        it('réinitialise zoneSelectionActive et zoneOverlay', () => {
            const overlay = { hide: vi.fn() } as any;
            toolbar['zoneOverlay'] = overlay;
            toolbar['cancel']();
            expect(mockState.zoneSelectionActive).toBe(false);
            expect(mockState.zoneOverlay).toBeNull();
            expect(overlay.hide).toHaveBeenCalled();
        });

        it('appelle dispose', () => {
            const spy = vi.spyOn(toolbar, 'dispose' as any);
            toolbar['cancel']();
            expect(spy).toHaveBeenCalled();
        });
    });
});
