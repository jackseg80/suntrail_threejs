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

    constructor() {
        super('template-zone-select-toolbar', 'body', templateHTML);
    }

    private createViewportOverlay(): HTMLElement {
        const el = document.createElement('div');
        el.id = 'zone-select-viewport';
        el.style.cssText =
            'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:50;' +
            'border:3px solid rgba(0,255,102,0.75);border-radius:6px;background:rgba(0,255,102,0.03);' +
            'box-shadow:0 0 0 1px rgba(0,0,0,0.15);';
        this.updateViewportOverlaySize(el);
        return el;
    }

    private updateViewportOverlaySize(el?: HTMLElement): void {
        const target = el || this.viewportOverlay;
        if (!target) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const size = Math.floor(Math.min(w, h) * 0.75);
        target.style.width = `${size}px`;
        target.style.height = `${size}px`;
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

        btn.classList.add('btn-loading');
        btn.setAttribute('aria-busy', 'true');
        btn.disabled = true;
        const cancelBtn = this.element?.querySelector(
            '#zst-cancel'
        ) as HTMLButtonElement;
        if (cancelBtn) cancelBtn.disabled = true;

        const tileCountEl = this.element?.querySelector('#zst-tile-count');
        const totalInfoEl = this.element?.querySelector('#zst-total-info');

        this.zoneOverlay?.setMode('downloading');

        try {
            const ok = await downloadZoneMultiLOD(
                this.currentSelection.tilesByLod,
                (done, total, _currentLod, lodLabel) => {
                    if (tileCountEl) {
                        const pct =
                            total > 0 ? Math.round((done / total) * 100) : 0;
                        tileCountEl.textContent = `⏬ ${lodLabel}: ${pct}%…`;
                    }
                    if (totalInfoEl) {
                        totalInfoEl.textContent = `${done}/${total}`;
                    }
                }
            );
            if (ok) {
                incrementOfflineZoneCount();
                addCachedZone({
                    label: `${i18n.t('zoneSelect.currentZone') || 'Zone'} (LOD ${this.minLod}→${this.maxLod})`,
                    bbox: this.currentSelection.bbox,
                    minLod: this.minLod,
                    maxLod: this.maxLod,
                    tileCount: this.currentSelection.totalTiles,
                    sizeMB: this.currentSelection.totalSizeMB,
                });
                void haptic('success');
                this.zoneOverlay?.setMode('cached');
                showToast('✅ Zone telechargee !');
                setTimeout(() => this.cancel(), 3000);
                return;
            } else {
                showToast('⛔ Erreur telechargement zone');
            }
        } catch (e) {
            console.warn('[OfflineZone] Download error:', e);
        }
        this.cancel();
    }

    private cancel(): void {
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
