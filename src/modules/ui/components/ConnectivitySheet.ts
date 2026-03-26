import { BaseComponent } from '../core/BaseComponent';
import { state } from '../../state';
import { deleteTerrainCache, downloadOfflineZone } from '../../tileLoader';
import { showToast } from '../../utils';
import { sheetManager } from '../core/SheetManager';
import { resetTerrain, updateVisibleTiles } from '../../terrain';
import { SharedAPIKeyComponent } from './SharedAPIKeyComponent';
import { haptic } from '../../haptics';

export class ConnectivitySheet extends BaseComponent {
    constructor() {
        super('template-connectivity', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        const closeBtn = this.element.querySelector('#close-connectivity');
        closeBtn?.setAttribute('aria-label', 'Fermer connectivité');
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
            showToast("Cache vidé");
        });

        const downloadZoneBtn = this.element.querySelector('#conn-download-zone') as HTMLElement | null;
        downloadZoneBtn?.addEventListener('click', async () => {
            if (!downloadZoneBtn) return;
            downloadZoneBtn.classList.add('btn-loading');
            downloadZoneBtn.setAttribute('aria-busy', 'true');
            downloadZoneBtn.setAttribute('disabled', 'true');
            const span = downloadZoneBtn.querySelector('span');
            const originalText = span?.textContent ?? '';

            try {
                await downloadOfflineZone(state.TARGET_LAT, state.TARGET_LON, (done, total) => {
                    if (span) span.textContent = `Chargement ${Math.round(done/total*100)}%`;
                });
                if (span) span.textContent = `⬇️ Zone Téléchargée`;
                void haptic('success');
            } catch (e) {
                console.warn('Download zone error:', e);
                if (span) span.textContent = originalText;
            } finally {
                downloadZoneBtn.classList.remove('btn-loading');
                downloadZoneBtn.removeAttribute('aria-busy');
                downloadZoneBtn.removeAttribute('disabled');
            }
        });

        // PMTiles
        const pmtilesBtn = this.element.querySelector('#conn-pmtiles-btn');
        const pmtilesUpload = this.element.querySelector('#conn-pmtiles-upload') as HTMLInputElement;
        pmtilesBtn?.addEventListener('click', () => pmtilesUpload?.click());
        pmtilesUpload?.addEventListener('change', async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                const { setPMTilesSource } = await import('../../tileLoader');
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
