import { BaseComponent } from '../core/BaseComponent';
import { state, isProActive } from '../../state';
import {
    deleteTerrainCache,
    setPMTilesSource,
    getOfflineZoneCount,
} from '../../tileLoader';
import { showToast } from '../../toast';
import { sheetManager } from '../core/SheetManager';
import { resetTerrain, updateVisibleTiles } from '../../terrain';
import { i18n } from '../../../i18n/I18nService';
import { setManualOffline } from '../../networkMonitor';
import { packManager } from '../../packManager';
import { eventBus } from '../../eventBus';
import templateHTML from '../templates/connectivity.html?raw';
import { ZoneOverlay } from '../../ZoneOverlay';
import { ZoneSelectToolbar } from './ZoneSelectToolbar';
import { showUpgradePrompt } from '../../iap';
import { getCachedZones, removeCachedZone } from '../../cachedZones';
import { flyTo } from '../../cameraManager';
import { lngLatToWorld } from '../../geo';
import { getAltitudeAt } from '../../analysis';

export class ConnectivitySheet extends BaseComponent {
    constructor() {
        super('template-connectivity', 'sheet-container', templateHTML);
    }

    public render(): void {
        if (!this.element) return;

        const closeBtn = this.element.querySelector('#close-connectivity');
        closeBtn?.setAttribute('aria-label', i18n.t('connectivity.aria.close'));
        closeBtn?.addEventListener('click', () => sheetManager.close());

        // Offline toggle
        const offlineToggle = this.element.querySelector(
            '#offline-toggle'
        ) as HTMLInputElement;
        if (offlineToggle) {
            offlineToggle.checked = state.IS_OFFLINE;
            // ARIA: toggle as switch
            offlineToggle.setAttribute('role', 'switch');
            offlineToggle.setAttribute(
                'aria-checked',
                String(offlineToggle.checked)
            );

            offlineToggle.addEventListener('change', (e) => {
                const checked = (e.target as HTMLInputElement).checked;
                setManualOffline(checked);
                // ARIA: sync aria-checked
                offlineToggle.setAttribute('aria-checked', String(checked));
                this.updateNetworkStatus();
            });
        }

        // Cache management
        const clearCacheBtn = this.element.querySelector('#conn-clear-cache');
        clearCacheBtn?.addEventListener('click', async () => {
            await deleteTerrainCache();
            showToast(i18n.t('connectivity.toast.cacheCleared'));
        });

        const downloadZoneBtn = this.element.querySelector(
            '#conn-download-zone'
        ) as HTMLButtonElement | null;

        const syncDownloadBtnGate = () => {
            if (!downloadZoneBtn) return;
            const isFreeAndUsed = !isProActive() && getOfflineZoneCount() >= 1;
            const span = downloadZoneBtn.querySelector('span');
            if (span) {
                span.innerHTML = isFreeAndUsed
                    ? `🔒 ${i18n.t('connectivity.btn.downloadZone')}`
                    : i18n.t('connectivity.btn.downloadZone');
            }
            downloadZoneBtn.classList.toggle('btn-disabled', isFreeAndUsed);
        };

        this.addSubscription(state.subscribe('isPro', syncDownloadBtnGate));
        this.addSubscription(state.subscribe('trialEnd', syncDownloadBtnGate));
        syncDownloadBtnGate();

        downloadZoneBtn?.addEventListener('click', async () => {
            if (!downloadZoneBtn) return;

            if (!isProActive() && getOfflineZoneCount() >= 1) {
                showUpgradePrompt('offline_zones');
                return;
            }

            sheetManager.close();
            state.zoneSelectionActive = true;

            const overlay = new ZoneOverlay();
            state.zoneOverlay = overlay;
            const toolbar = new ZoneSelectToolbar();
            toolbar.setOverlay(overlay);
            toolbar.hydrate();
        });

        // PMTiles
        const pmtilesBtn = this.element.querySelector('#conn-pmtiles-btn');
        const pmtilesUpload = this.element.querySelector(
            '#conn-pmtiles-upload'
        ) as HTMLInputElement;
        pmtilesBtn?.addEventListener('click', () => pmtilesUpload?.click());
        pmtilesUpload?.addEventListener('change', async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                await setPMTilesSource(file);
                resetTerrain();
                updateVisibleTiles();
            }
        });

        // Country Packs button
        const packsBtn = this.element.querySelector('#conn-packs-btn');
        packsBtn?.addEventListener('click', () => {
            sheetManager.close();
            setTimeout(() => sheetManager.open('packs'), 150);
        });

        // Real-time updates
        this.addSubscription(
            state.subscribe('IS_OFFLINE', (val: boolean) => {
                if (offlineToggle) {
                    offlineToggle.checked = val;
                    offlineToggle.setAttribute('aria-checked', String(val));
                }
                this.updateNetworkStatus();
            })
        );
        this.addSubscription(
            state.subscribe('connectionType', () => this.updateNetworkStatus())
        );
        this.addSubscription(
            state.subscribe('isNetworkAvailable', () =>
                this.updateNetworkStatus()
            )
        );
        const onDegraded = () => this.updateNetworkStatus();
        eventBus.on('serviceDegraded', onDegraded);
        this.addSubscription(() => eventBus.off('serviceDegraded', onDegraded));

        this.addSubscription(
            state.subscribe('userLocation', () => this.updateGPSInfo())
        );
        this.addSubscription(
            state.subscribe('userLocationAccuracy', () => this.updateGPSInfo())
        );

        // Initial update
        this.updateNetworkStatus();
        this.updateGPSInfo();
        this.updatePackStatusBadge();

        // Cached zones list + pack status badge refresh
        this.renderCachedZones();
        const onSheetOpened = ({ id }: { id: string }) => {
            if (id === 'connectivity') {
                this.renderCachedZones();
                this.updatePackStatusBadge();
            }
        };
        eventBus.on('sheetOpened', onSheetOpened);
        this.addSubscription(() => eventBus.off('sheetOpened', onSheetOpened));

        // Pack status badge updates when position changes
        this.addSubscription(
            state.subscribe('TARGET_LAT', () => this.updatePackStatusBadge())
        );
        this.addSubscription(
            state.subscribe('TARGET_LON', () => this.updatePackStatusBadge())
        );
    }

    private updatePackStatusBadge(): void {
        const el = this.element?.querySelector(
            '#conn-pack-status'
        ) as HTMLElement | null;
        if (!el) return;

        const pack = packManager.findPackContaining(
            state.TARGET_LAT,
            state.TARGET_LON
        );
        if (!pack) {
            el.style.display = 'none';
            return;
        }

        const ps = packManager.getPackState(pack.id);
        const lang = state.lang || 'fr';
        const name = pack.name[lang] || pack.name['fr'] || pack.id;

        let statusText: string;
        let statusColor: string;
        if (ps?.status === 'installed') {
            statusText = `\u2713 ${name} \u00b7 ${i18n.t('packs.status.installed')}`;
            statusColor = '#22c55e';
        } else if (ps?.status === 'update_available') {
            statusText = `${name} \u00b7 ${i18n.t('packs.status.updateAvailable')}`;
            statusColor = '#f97316';
        } else if (ps?.status === 'purchased') {
            statusText = `${name} \u00b7 ${i18n.t('packs.status.online')}`;
            statusColor = '#f59e0b';
        } else {
            statusText = `\u{1F4E6} ${name} \u00b7 ${i18n.t('connectivity.label.packAvailable')}`;
            statusColor = 'var(--accent, #3b7ef8)';
        }

        el.style.display = 'block';
        el.innerHTML = statusText;
        el.style.color = statusColor;
    }

    private renderCachedZones(): void {
        const container = this.element?.querySelector('#conn-cached-zones');
        if (!container) return;

        const zones = getCachedZones();
        container.classList.toggle('visible', zones.length > 0);
        container.innerHTML = '';

        if (zones.length === 0) return;

        const title = document.createElement('div');
        title.className = 'setting-label';
        title.style.cssText =
            'font-size:11px;color:var(--text-3);margin-bottom:4px';
        title.textContent = `💾 Zones en cache (${zones.length})`;
        container.appendChild(title);

        for (const zone of zones) {
            const item = document.createElement('div');
            item.className = 'cached-zone-item';

            const info = document.createElement('div');
            info.className = 'cached-zone-info';

            const label = document.createElement('div');
            label.className = 'cached-zone-label';
            label.textContent = zone.label;

            const detail = document.createElement('div');
            detail.className = 'cached-zone-detail';
            detail.textContent = `${zone.tileCount} tuiles · ${zone.sizeMB} · ${new Date(zone.timestamp).toLocaleDateString()}`;

            info.appendChild(label);
            info.appendChild(detail);

            const del = document.createElement('button');
            del.className = 'cached-zone-delete';
            del.textContent = '✕';
            del.setAttribute('aria-label', `Supprimer ${zone.label}`);
            del.addEventListener('click', (e) => {
                e.stopPropagation();
                removeCachedZone(zone.id);
                this.renderCachedZones();
            });

            item.addEventListener('click', () => {
                const centerLat = (zone.bbox.minLat + zone.bbox.maxLat) / 2;
                const centerLon = (zone.bbox.minLon + zone.bbox.maxLon) / 2;
                const world = lngLatToWorld(
                    centerLon,
                    centerLat,
                    state.originTile
                );
                const elevation = getAltitudeAt(world.x, world.z);

                // Calculer une distance qui montre la zone entière dans le viewport
                // à partir de la diagonale de la zone en coordonnées world
                const corners = [
                    lngLatToWorld(
                        zone.bbox.minLon,
                        zone.bbox.minLat,
                        state.originTile
                    ),
                    lngLatToWorld(
                        zone.bbox.maxLon,
                        zone.bbox.minLat,
                        state.originTile
                    ),
                    lngLatToWorld(
                        zone.bbox.maxLon,
                        zone.bbox.maxLat,
                        state.originTile
                    ),
                    lngLatToWorld(
                        zone.bbox.minLon,
                        zone.bbox.maxLat,
                        state.originTile
                    ),
                ];
                const minX = Math.min(...corners.map((c) => c.x));
                const maxX = Math.max(...corners.map((c) => c.x));
                const minZ = Math.min(...corners.map((c) => c.z));
                const maxZ = Math.max(...corners.map((c) => c.z));
                const zoneW = maxX - minX;
                const zoneH = maxZ - minZ;
                const fov = (45 * Math.PI) / 180;
                const aspect = window.innerWidth / window.innerHeight;
                const dW = zoneW / (2 * Math.tan(fov / 2) * aspect);
                const dH = zoneH / (2 * Math.tan(fov / 2));
                const distance = Math.max(dW, dH, 500) * 1.2;

                sheetManager.close();
                flyTo(world.x, world.z, elevation || 0, distance).then(() => {
                    const overlay = new ZoneOverlay();
                    overlay.show(zone.bbox, 'cached');
                    state.zoneOverlay = overlay;
                    setTimeout(() => {
                        overlay.hide();
                        if (state.zoneOverlay === overlay)
                            state.zoneOverlay = null;
                    }, 4000);
                });
            });

            item.appendChild(info);
            item.appendChild(del);
            container.appendChild(item);
        }
    }

    private updateNetworkStatus() {
        const statusEl = this.element?.querySelector(
            '#net-status'
        ) as HTMLElement;
        const typeEl = this.element?.querySelector(
            '#net-connection-type'
        ) as HTMLElement;
        const isOffline = state.IS_OFFLINE || !state.isNetworkAvailable;
        const isDegraded = state.isMapTilerDisabled || state.isORSDisabled;

        if (statusEl) {
            statusEl.setAttribute('aria-live', 'polite');
            let statusText: string;
            let isOnline: boolean;
            if (isOffline) {
                statusText = i18n.t('connectivity.status.offline');
                isOnline = false;
            } else if (isDegraded) {
                statusText = i18n.t('connectivity.status.degraded');
                isOnline = false;
            } else {
                statusText = i18n.t('connectivity.status.online');
                isOnline = true;
            }
            statusEl.textContent = statusText;
            statusEl.classList.toggle('conn-status-offline', isOffline);
            statusEl.classList.toggle(
                'conn-status-degraded',
                isDegraded && !isOffline
            );
            statusEl.classList.toggle('conn-status-online', isOnline);
        }

        if (typeEl) {
            if (!state.isNetworkAvailable) {
                typeEl.textContent = i18n.t('network.type.none');
            } else if (state.IS_OFFLINE) {
                typeEl.textContent = i18n.t('network.status.manualOffline');
            } else {
                typeEl.textContent = i18n.t(
                    `network.type.${state.connectionType}`
                );
            }
        }
    }

    private updateGPSInfo() {
        const accuracyEl = this.element?.querySelector('#gps-accuracy');
        if (accuracyEl) {
            // ARIA: live region for dynamic GPS accuracy
            accuracyEl.setAttribute('aria-live', 'polite');
            // Affiche la précision GPS réelle ou '--' si pas de signal
            const acc =
                state.userLocationAccuracy ?? (state.userLocation ? '5' : '--');
            accuracyEl.innerHTML = `${acc} <span class="conn-unit">m</span>`;
        }
    }
}
