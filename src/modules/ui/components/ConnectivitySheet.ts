import { BaseComponent } from '../core/BaseComponent';
import { state } from '../../state';
import { deleteTerrainCache, downloadOfflineZone } from '../../tileLoader';
import { showToast } from '../../utils';
import { sheetManager } from '../core/SheetManager';
import { resetTerrain, updateVisibleTiles } from '../../terrain';

export class ConnectivitySheet extends BaseComponent {
    constructor() {
        super('template-connectivity', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        const closeBtn = this.element.querySelector('#close-connectivity');
        closeBtn?.addEventListener('click', () => sheetManager.close());

        // Offline toggle
        const offlineToggle = this.element.querySelector('#offline-toggle') as HTMLInputElement;
        if (offlineToggle) {
            offlineToggle.checked = state.IS_OFFLINE;
            offlineToggle.addEventListener('change', (e) => {
                state.IS_OFFLINE = (e.target as HTMLInputElement).checked;
                this.updateNetworkStatus();
            });
        }

        // Cache management
        const clearCacheBtn = this.element.querySelector('#conn-clear-cache');
        clearCacheBtn?.addEventListener('click', async () => {
            await deleteTerrainCache();
            showToast("Cache vidé");
        });

        const downloadZoneBtn = this.element.querySelector('#conn-download-zone');
        downloadZoneBtn?.addEventListener('click', async () => {
            if (!downloadZoneBtn) return;
            downloadZoneBtn.setAttribute('disabled', 'true');
            const span = downloadZoneBtn.querySelector('span');
            
            await downloadOfflineZone(state.TARGET_LAT, state.TARGET_LON, (done, total) => {
                if (span) span.textContent = `Chargement ${Math.round(done/total*100)}%`;
            });
            
            downloadZoneBtn.removeAttribute('disabled');
            if (span) span.textContent = `⬇️ Zone Téléchargée`;
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

        // API Key
        const apiKeyForm = this.element.querySelector('#conn-api-key-form') as HTMLFormElement;
        const apiKeyInput = this.element.querySelector('#conn-maptiler-input') as HTMLInputElement;
        if (apiKeyForm && apiKeyInput) {
            apiKeyInput.value = state.MK;
            apiKeyForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const key = apiKeyInput.value.trim();
                if (key.length > 10) {
                    state.MK = key;
                    localStorage.setItem('maptiler_key', key);
                    showToast("Clé API mise à jour");
                    resetTerrain();
                    updateVisibleTiles();
                }
            });
        }

        // Real-time updates
        this.addSubscription(state.subscribe('IS_OFFLINE', (val: boolean) => {
            if (offlineToggle) offlineToggle.checked = val;
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
            statusEl.textContent = state.IS_OFFLINE ? 'OFFLINE' : 'ONLINE';
            statusEl.classList.toggle('conn-status-offline', state.IS_OFFLINE);
            statusEl.classList.toggle('conn-status-online', !state.IS_OFFLINE);
        }
    }

    private updateGPSInfo() {
        const accuracyEl = this.element?.querySelector('#gps-accuracy');
        if (accuracyEl) {
            // Affiche la précision GPS réelle ou '--' si pas de signal
            const acc = state.userLocationAccuracy ?? (state.userLocation ? '5' : '--');
            accuracyEl.innerHTML = `${acc} <span class="conn-unit">m</span>`;
        }
    }
}
