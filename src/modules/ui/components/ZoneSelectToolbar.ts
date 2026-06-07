import { BaseComponent } from '../core/BaseComponent';
import { state, isProActive } from '../../state';
import {
    getViewportBBox,
    computeZoneSelection,
    type ZoneSelection,
} from '../../ZoneSelector';
import {
    downloadZoneMultiLOD,
    getOfflineZoneCount,
    incrementOfflineZoneCount,
    decrementOfflineZoneCount,
    estimateZoneSizeMB,
} from '../../tileLoader';
import { showUpgradePrompt } from '../../iap';
import { showToast } from '../../toast';
import { haptic } from '../../haptics';
import { i18n } from '../../../i18n/I18nService';
import { addCachedZone } from '../../cachedZones';
import templateHTML from '../templates/zone-select-toolbar.html?raw';

const MIN_LOD = 5;
const MAX_LOD = 18;

export class ZoneSelectToolbar extends BaseComponent {
    private zoneOverlay: import('../../ZoneOverlay').ZoneOverlay | null = null;
    private currentSelection: ZoneSelection | null = null;
    private minLod = 5;
    private maxLod = 14;
    private viewportOverlay: HTMLElement | null = null;
    private resizeHandler: (() => void) | null = null;
    private downloadAbort: AbortController | null = null;

    constructor() {
        super('template-zone-select-toolbar', 'body', templateHTML);
    }

    private createViewportOverlay(): HTMLElement {
        const el = document.createElement('div');
        el.id = 'zone-select-viewport';
        el.style.cssText =
            'position:fixed;top:6%;left:50%;transform:translateX(-50%);pointer-events:none;z-index:20000;' +
            'border:3px solid rgba(255,160,0,0.85);border-radius:8px;background:rgba(255,160,0,0.2);' +
            'box-shadow:0 0 0 1px rgba(0,0,0,0.25);';
        this.updateViewportOverlaySize(el);
        return el;
    }

    private updateViewportOverlaySize(el?: HTMLElement): void {
        const target = el || this.viewportOverlay;
        if (!target) return;
        target.style.width = `${Math.floor(window.innerWidth * 0.85)}px`;
        target.style.height = `${Math.floor(window.innerHeight * 0.55)}px`;
    }

    setOverlay(overlay: import('../../ZoneOverlay').ZoneOverlay): void {
        this.zoneOverlay = overlay;
    }

    public render(): void {
        const toolbar = this.element as HTMLElement;

        const minSlider = toolbar.querySelector(
            '#zst-min-slider'
        ) as HTMLInputElement;
        const maxSlider = toolbar.querySelector(
            '#zst-max-slider'
        ) as HTMLInputElement;

        const currentZoom = state.ZOOM;
        this.maxLod = Math.min(currentZoom + 4, MAX_LOD);
        this.minLod = Math.min(MIN_LOD, currentZoom);
        if (this.minLod > this.maxLod) this.minLod = MIN_LOD;

        minSlider.min = String(MIN_LOD);
        minSlider.max = String(MAX_LOD);
        maxSlider.min = String(MIN_LOD);
        maxSlider.max = String(MAX_LOD);
        minSlider.value = String(this.minLod);
        maxSlider.value = String(this.maxLod);

        this.updateLabels();

        minSlider.addEventListener('input', () => {
            const min = parseInt(minSlider.value, 10);
            const max = parseInt(maxSlider.value, 10);
            if (min > max) {
                maxSlider.value = String(min);
            }
            this.minLod = Math.min(min, parseInt(maxSlider.value, 10));
            this.maxLod = Math.max(min, parseInt(maxSlider.value, 10));
            this.recomputeFromVisibleTiles();
        });

        maxSlider.addEventListener('input', () => {
            const min = parseInt(minSlider.value, 10);
            const max = parseInt(maxSlider.value, 10);
            if (max < min) {
                minSlider.value = String(max);
            }
            this.minLod = Math.min(parseInt(minSlider.value, 10), max);
            this.maxLod = Math.max(parseInt(minSlider.value, 10), max);
            this.recomputeFromVisibleTiles();
        });

        const cancelBtn = toolbar.querySelector('#zst-cancel');
        cancelBtn?.addEventListener('click', () => this.cancel());

        const downloadBtn = toolbar.querySelector(
            '#zst-download'
        ) as HTMLButtonElement;

        downloadBtn?.addEventListener('click', () =>
            this.download(downloadBtn)
        );

        toolbar.classList.add('active');

        // v5.57.2 : Overlay viewport fixe (écran) pour sélection visible sur mobile portrait
        this.viewportOverlay = this.createViewportOverlay();
        document.body.appendChild(this.viewportOverlay);
        this.resizeHandler = () => this.updateViewportOverlaySize();
        window.addEventListener('resize', this.resizeHandler);
        window.addEventListener('orientationchange', this.resizeHandler);

        this.recomputeFromVisibleTiles();

        if (this.zoneOverlay && this.currentSelection) {
            this.zoneOverlay.show(this.currentSelection.bbox);
        }

        this.addSubscription(
            state.subscribe('ZOOM', () => this.onZoomChanged())
        );

        // En 3D la projection perspective déforme la zone → utiliser le ZoneOverlay 3D plutôt que le cadre CSS
        this.addSubscription(
            state.subscribe('IS_2D_MODE', (is2D: boolean) => {
                if (!this.viewportOverlay) return;
                this.viewportOverlay.style.display = is2D ? 'block' : 'none';
            })
        );
    }

    private onZoomChanged(): void {
        this.recomputeFromVisibleTiles();
    }

    private recomputeFromVisibleTiles(): void {
        const bbox = getViewportBBox();
        if (!bbox) return;

        this.minLod = Math.min(this.minLod, this.maxLod);
        this.maxLod = Math.max(this.minLod, this.maxLod);

        this.currentSelection = computeZoneSelection(
            bbox,
            this.minLod,
            this.maxLod
        );

        if (this.zoneOverlay) {
            this.zoneOverlay.updateFromBBox(bbox);
        }

        this.updateLabels();
    }

    private updateLabels(): void {
        const toolbar = this.element;
        if (!toolbar) return;

        const tileCountEl = toolbar.querySelector('#zst-tile-count');
        const totalInfoEl = toolbar.querySelector('#zst-total-info');
        const warningEl = toolbar.querySelector('#zst-warning');
        const minLabel = toolbar.querySelector('#zst-min-label');
        const maxLabel = toolbar.querySelector('#zst-max-label');
        const currentLabel = toolbar.querySelector('#zst-current-label');
        const downloadBtn = toolbar.querySelector(
            '#zst-download'
        ) as HTMLButtonElement;

        const sel = this.currentSelection;
        const visibleCount = sel?.tilesByLod.get(state.ZOOM)?.length ?? 0;
        const currentLOD = state.ZOOM;

        if (tileCountEl) {
            tileCountEl.textContent =
                visibleCount > 0
                    ? `📦 ${visibleCount} ${i18n.t('connectivity.label.tiles') || 'tuiles'} · ${estimateZoneSizeMB(visibleCount)} (LOD ${currentLOD})`
                    : i18n.t('connectivity.btn.downloadZone');
        }

        if (totalInfoEl) {
            const zonesUsed = isProActive()
                ? ''
                : ` · ${getOfflineZoneCount()}/1`;
            totalInfoEl.textContent = sel
                ? `${i18n.t('zoneSelect.totalLODs') || 'Total (LOD'} ${this.minLod}→${this.maxLod}) : ${sel.totalTiles} ${i18n.t('connectivity.label.tiles') || 'tuiles'} · ${sel.totalSizeMB}${zonesUsed}`
                : '';
        }

        if (minLabel) minLabel.textContent = `LOD ${this.minLod}`;
        if (maxLabel) maxLabel.textContent = `LOD ${this.maxLod}`;
        if (currentLabel)
            currentLabel.textContent =
                i18n.t('zoneSelect.lodRange') || 'Plage LOD';

        if (warningEl && sel) {
            if (sel.tooLarge) {
                warningEl.textContent =
                    i18n.t('zoneSelect.tooLarge') ||
                    'Certains niveaux de zoom ignores (limite 2000 tuiles)';
                warningEl.classList.add('visible');
            } else if (sel.hardWarning) {
                warningEl.textContent =
                    i18n.t('zoneSelect.hardWarning') ||
                    'Plus de 1000 tuiles - telechargement tres long';
                warningEl.classList.add('visible');
            } else if (sel.warning) {
                warningEl.textContent =
                    i18n.t('zoneSelect.warning') ||
                    'Plus de 500 tuiles - telechargement long';
                warningEl.classList.add('visible');
            } else {
                warningEl.classList.remove('visible');
            }
        }

        if (downloadBtn && sel) {
            downloadBtn.disabled = sel.totalTiles === 0;
        }
    }

    private async download(btn: HTMLButtonElement): Promise<void> {
        if (!this.currentSelection || this.currentSelection.totalTiles === 0)
            return;

        if (!isProActive() && getOfflineZoneCount() >= 1) {
            showUpgradePrompt('offline_zones');
            return;
        }

        // Figer le bbox au moment du clic — ne pas utiliser currentBbox (update continu de scene.ts)
        const capturedBbox = this.currentSelection.bbox;
        const capturedTilesByLod = this.currentSelection.tilesByLod;
        const capturedTotalTiles = this.currentSelection.totalTiles;
        const capturedSizeMB = this.currentSelection.totalSizeMB;

        // Réserver le slot avant téléchargement (évite double-download si localStorage fail)
        incrementOfflineZoneCount();

        btn.classList.add('btn-loading');
        btn.setAttribute('aria-busy', 'true');
        btn.disabled = true;

        // Basculer le bouton Annuler en bouton d'abandon
        const cancelBtn = this.element?.querySelector(
            '#zst-cancel'
        ) as HTMLButtonElement;
        if (cancelBtn) {
            cancelBtn.textContent = '⏹ Annuler le téléchargement';
            cancelBtn.classList.add('btn-abort');
            cancelBtn.disabled = false;
        }

        const tileCountEl = this.element?.querySelector('#zst-tile-count');
        const totalInfoEl = this.element?.querySelector('#zst-total-info');

        this.zoneOverlay?.setMode('downloading');

        this.downloadAbort = new AbortController();

        try {
            const ok = await downloadZoneMultiLOD(
                capturedTilesByLod,
                (done, total, _currentLod, lodLabel) => {
                    if (tileCountEl) {
                        const pct =
                            total > 0 ? Math.round((done / total) * 100) : 0;
                        tileCountEl.textContent = `⏬ ${lodLabel}: ${pct}%…`;
                    }
                    if (totalInfoEl) {
                        totalInfoEl.textContent = `${done}/${total}`;
                    }
                },
                this.downloadAbort.signal
            );
            // Restaurer le bouton Annuler
            if (cancelBtn) {
                cancelBtn.textContent = 'Annuler';
                cancelBtn.classList.remove('btn-abort');
            }

            if (ok) {
                addCachedZone({
                    label: `${i18n.t('zoneSelect.currentZone') || 'Zone'} (LOD ${this.minLod}→${this.maxLod})`,
                    bbox: capturedBbox,
                    minLod: this.minLod,
                    maxLod: this.maxLod,
                    tileCount: capturedTotalTiles,
                    sizeMB: capturedSizeMB,
                });
                if (this.zoneOverlay) {
                    this.zoneOverlay.setMode('cached', capturedBbox);
                }
                void haptic('success');
                showToast('✅ Zone telechargee !');
                setTimeout(() => this.cancel(), 3000);
                return;
            }
            // Échec ou abandon — libérer le slot
            decrementOfflineZoneCount();
            if (this.downloadAbort.signal.aborted) {
                showToast('⛔ Telechargement annule');
            } else {
                showToast('⛔ Erreur telechargement zone');
            }
        } catch (e) {
            decrementOfflineZoneCount();
            console.warn('[OfflineZone] Download error:', e);
        }
        if (cancelBtn) {
            cancelBtn.textContent = 'Annuler';
            cancelBtn.classList.remove('btn-abort');
            cancelBtn.disabled = false;
        }
        this.downloadAbort = null;
        this.cancel();
    }

    private cancel(): void {
        // Si un téléchargement est en cours, l'arrêter
        if (this.downloadAbort) {
            this.downloadAbort.abort();
            this.downloadAbort = null;
            decrementOfflineZoneCount();
            showToast('⛔ Telechargement annule');
        }
        state.zoneSelectionActive = false;
        state.zoneOverlay = null;
        if (this.zoneOverlay) {
            this.zoneOverlay.hide();
        }
        if (this.viewportOverlay) {
            this.viewportOverlay.remove();
            this.viewportOverlay = null;
        }
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            window.removeEventListener('orientationchange', this.resizeHandler);
            this.resizeHandler = null;
        }
        this.dispose();
    }
}
