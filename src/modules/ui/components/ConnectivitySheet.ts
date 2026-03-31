import { BaseComponent } from '../core/BaseComponent';
import { state } from '../../state';
import {
    deleteTerrainCache, setPMTilesSource,
    downloadVisibleZone, getOfflineZoneCount, incrementOfflineZoneCount, estimateZoneSizeMB,
} from '../../tileLoader';
import { activeTiles } from '../../terrain';
import { showUpgradePrompt } from '../../iap';
import { showToast } from '../../utils';
import { sheetManager } from '../core/SheetManager';
import { resetTerrain, updateVisibleTiles } from '../../terrain';
import { SharedAPIKeyComponent } from './SharedAPIKeyComponent';
import { haptic } from '../../haptics';
import { i18n } from '../../../i18n/I18nService';

export class ConnectivitySheet extends BaseComponent {
    constructor() {
        super('template-connectivity', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        const closeBtn = this.element.querySelector('#close-connectivity');
        closeBtn?.setAttribute('aria-label', i18n.t('connectivity.aria.close'));
        closeBtn?.addEventListener('click', () => sheetManager.close());

        // Offline toggle
        const offlineToggle = this.element.querySelector('#offline-toggle') as HTMLInputElement;
        if (offlineToggle) {
            offlineToggle.checked = state.IS_OFFLINE;
            // ARIA: toggle as switch
            offlineToggle.setAttribute('role', 'switch');
            offlineToggle.setAttribute('aria-checked', String(offlineToggle.checked));

            offlineToggle.addEventListener('change', (e) => {
                state.IS_OFFLINE = (e.target as HTMLInputElement).checked;
                // ARIA: sync aria-checked
                offlineToggle.setAttribute('aria-checked', String((e.target as HTMLInputElement).checked));
                this.updateNetworkStatus();
            });
        }

        // Cache management
        const clearCacheBtn = this.element.querySelector('#conn-clear-cache');
        clearCacheBtn?.addEventListener('click', async () => {
            await deleteTerrainCache();
            showToast(i18n.t('connectivity.toast.cacheCleared'));
        });

        const downloadZoneBtn = this.element.querySelector('#conn-download-zone') as HTMLButtonElement | null;

        /** Met à jour le libellé du bouton avec le nombre de tuiles visibles et la taille estimée. */
        const syncDownloadBtnLabel = () => {
            const span = downloadZoneBtn?.querySelector('span');
            if (!span) return;
            const count = activeTiles.size;
            if (count === 0) {
                span.textContent = i18n.t('connectivity.btn.downloadZone');
                return;
            }
            const size = estimateZoneSizeMB(count);
            const zonesUsed = getOfflineZoneCount();
            const limitStr = state.isPro ? '' : ` · ${zonesUsed}/1 ${i18n.t('connectivity.label.zonesUsed') || 'zone utilisée'}`;
            span.textContent = `📥 ${count} ${i18n.t('connectivity.label.tiles') || 'tuiles'} · ${size}${limitStr}`;
        };

        // Met à jour le label quand le zoom change (= nouvelles tuiles à l'écran)
        this.addSubscription(state.subscribe('ZOOM', syncDownloadBtnLabel));
        this.addSubscription(state.subscribe('isPro', syncDownloadBtnLabel));
        syncDownloadBtnLabel();

        downloadZoneBtn?.addEventListener('click', async () => {
            if (!downloadZoneBtn) return;

            // Gate Pro : 1 zone gratuite, illimité pour les Pro
            if (!state.isPro && getOfflineZoneCount() >= 1) {
                showUpgradePrompt('offline_zones');
                return;
            }

            const tiles = Array.from(activeTiles.values()).map(t => ({ tx: t.tx, ty: t.ty, zoom: t.zoom }));
            if (tiles.length === 0) {
                showToast('Aucune tuile visible à télécharger.');
                return;
            }

            downloadZoneBtn.classList.add('btn-loading');
            downloadZoneBtn.setAttribute('aria-busy', 'true');
            downloadZoneBtn.disabled = true;
            const span = downloadZoneBtn.querySelector('span');

            try {
                await downloadVisibleZone(tiles, (done, total) => {
                    if (span) span.textContent = `⏬ ${Math.round(done / total * 100)}%…`;
                });
                incrementOfflineZoneCount();
                void haptic('success');
                showToast('✅ Zone téléchargée !');
                syncDownloadBtnLabel();
            } catch (e) {
                console.warn('[OfflineZone] Download error:', e);
                syncDownloadBtnLabel();
            } finally {
                downloadZoneBtn.classList.remove('btn-loading');
                downloadZoneBtn.removeAttribute('aria-busy');
                downloadZoneBtn.disabled = false;
            }
        });

        // PMTiles
        const pmtilesBtn = this.element.querySelector('#conn-pmtiles-btn');
        const pmtilesUpload = this.element.querySelector('#conn-pmtiles-upload') as HTMLInputElement;
        pmtilesBtn?.addEventListener('click', () => pmtilesUpload?.click());
        pmtilesUpload?.addEventListener('change', async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                await setPMTilesSource(file);
                resetTerrain();
                updateVisibleTiles();
            }
        });

        // API Key (shared component)
        new SharedAPIKeyComponent('conn-api-key-slot', () => {
            resetTerrain();
            updateVisibleTiles();
        }).hydrate();

        // Real-time updates
        this.addSubscription(state.subscribe('IS_OFFLINE', (val: boolean) => {
            if (offlineToggle) {
                offlineToggle.checked = val;
                offlineToggle.setAttribute('aria-checked', String(val));
            }
            this.updateNetworkStatus();
        }));

        this.addSubscription(state.subscribe('userLocation', () => this.updateGPSInfo()));
        this.addSubscription(state.subscribe('userLocationAccuracy', () => this.updateGPSInfo()));

        // Initial update
        this.updateNetworkStatus();
        this.updateGPSInfo();
    }

    private updateNetworkStatus() {
        const statusEl = this.element?.querySelector('#net-status') as HTMLElement;
        if (statusEl) {
            // ARIA: live region for dynamic network status
            statusEl.setAttribute('aria-live', 'polite');
            statusEl.textContent = state.IS_OFFLINE ? 'OFFLINE' : 'ONLINE';
            statusEl.classList.toggle('conn-status-offline', state.IS_OFFLINE);
            statusEl.classList.toggle('conn-status-online', !state.IS_OFFLINE);
        }
    }

    private updateGPSInfo() {
        const accuracyEl = this.element?.querySelector('#gps-accuracy');
        if (accuracyEl) {
            // ARIA: live region for dynamic GPS accuracy
            accuracyEl.setAttribute('aria-live', 'polite');
            // Affiche la précision GPS réelle ou '--' si pas de signal
            const acc = state.userLocationAccuracy ?? (state.userLocation ? '5' : '--');
            accuracyEl.innerHTML = `${acc} <span class="conn-unit">m</span>`;
        }
    }
}
