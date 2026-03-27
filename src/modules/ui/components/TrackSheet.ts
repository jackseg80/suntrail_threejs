import { BaseComponent } from '../core/BaseComponent';
import { state } from '../../state';
import { showToast } from '../../utils';
import { startLocationTracking } from '../../location';
import { sheetManager } from '../core/SheetManager';
import { haptic } from '../../haptics';
import { i18n } from '../../../i18n/I18nService';
// @ts-ignore
import gpxParser from 'gpxparser';
import { updateVisibleTiles, addGPXLayer, removeGPXLayer, toggleGPXLayer, updateRecordedTrackMesh } from '../../terrain';
import { lngLatToTile, lngLatToWorld } from '../../geo';
import { updateElevationProfile } from '../../profile';
import { eventBus } from '../../eventBus';

export class TrackSheet extends BaseComponent {
    constructor() {
        super('template-track', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        // --- Empty state ---
        this.createEmptyState();
        this.updateEmptyState();

        // --- Layers list container ---
        this.createLayersListContainer();
        this.renderLayersList();

        const closeBtn = document.getElementById('close-track');
        closeBtn?.setAttribute('aria-label', i18n.t('track.aria.close'));
        closeBtn?.addEventListener('click', () => {
            sheetManager.close();
        });

        const recBtn = document.getElementById('rec-btn-sheet') as HTMLButtonElement;
        recBtn?.setAttribute('aria-label', i18n.t('track.aria.rec'));
        recBtn?.addEventListener('click', async () => {
            state.isRecording = !state.isRecording;
            this.updateRecUI();
            
            if (state.isRecording) {
                showToast(i18n.t('track.toast.recStarted'));
                if (!state.isFollowingUser) await startLocationTracking();
                if (state.userLocation) {
                    state.recordedPoints = [{ ...state.userLocation, timestamp: Date.now() }];
                    updateRecordedTrackMesh();
                } else {
                    state.recordedPoints = [];
                }
            } else {
                showToast(i18n.t('track.toast.recStopped'));
            }
        });

        const importBtn = document.getElementById('import-gpx-sheet');
        importBtn?.setAttribute('aria-label', i18n.t('track.aria.import'));
        const gpxUpload = document.getElementById('gpx-upload') as HTMLInputElement;
        
        // Enable multi-file selection
        if (gpxUpload) gpxUpload.setAttribute('multiple', '');

        importBtn?.addEventListener('click', () => {
            gpxUpload?.click();
        });

        gpxUpload?.addEventListener('change', (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (!files || files.length === 0) return;
            importBtn?.classList.add('btn-loading');
            importBtn?.setAttribute('aria-busy', 'true');
            
            const promises: Promise<void>[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                promises.push(new Promise<void>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = async (ev) => {
                        try {
                            await this.handleGPX(ev.target!.result as string, file.name);
                        } catch (_e) { /* handled inside */ }
                        resolve();
                    };
                    reader.onerror = () => resolve();
                    reader.readAsText(file);
                }));
            }
            
            Promise.all(promises).then(() => {
                importBtn?.classList.remove('btn-loading');
                importBtn?.removeAttribute('aria-busy');
                // Reset the input so re-importing the same file works
                if (gpxUpload) gpxUpload.value = '';
            });
        });

        const exportBtn = document.getElementById('export-gpx-sheet');
        exportBtn?.setAttribute('aria-label', i18n.t('track.aria.export'));
        exportBtn?.addEventListener('click', () => {
            if (state.recordedPoints.length < 2) {
                showToast(i18n.t('track.toast.tooShort'));
                return;
            }
            this.exportRecordedGPX();
        });

        this.addSubscription(state.subscribe('isRecording', () => this.updateRecUI()));
        this.addSubscription(state.subscribe('recordedPoints', () => {
            this.updateStats();
            this.updateEmptyState();
        }));
        this.addSubscription(state.subscribe('gpxLayers', () => {
            this.renderLayersList();
            this.updateEmptyState();
        }));
        
        this.updateRecUI();
        this.updateStats();
    }

    private createEmptyState(): void {
        if (!this.element) return;
        // this.element IS the #track div (first child of template-track)
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        emptyDiv.id = 'track-empty-state';
        emptyDiv.innerHTML = `
            <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 17l4-8 4 5 3-3 4 6"/>
                <circle cx="19" cy="5" r="2"/>
            </svg>
            <p class="empty-state-title">${i18n.t('track.empty.title')}</p>
            <p class="empty-state-subtitle">${i18n.t('track.empty.subtitle')}</p>`;
        this.element.appendChild(emptyDiv);
    }

    private createLayersListContainer(): void {
        if (!this.element) return;
        // Insert layers list container right after the track-stats section
        const container = document.createElement('div');
        container.id = 'gpx-layers-list';
        container.className = 'gpx-layers-list';
        container.style.display = 'none';
        // Insert after track-actions (which contains the buttons)
        const trackActions = this.element.querySelector('.track-actions');
        if (trackActions && trackActions.nextSibling) {
            this.element.insertBefore(container, trackActions.nextSibling);
        } else {
            this.element.appendChild(container);
        }
    }

    public renderLayersList(): void {
        const container = document.getElementById('gpx-layers-list');
        if (!container) return;

        const layers = state.gpxLayers;
        if (layers.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        container.innerHTML = `
            <div class="gpx-layers-header">${i18n.t('track.imported.title')}</div>
            ${layers.map(layer => {
                const truncName = layer.name.length > 20 ? layer.name.slice(0, 20) + '...' : layer.name;
                const isActive = state.activeGPXLayerId === layer.id;
                return `
                <div class="gpx-layer-item${isActive ? ' active' : ''}" data-layer-id="${layer.id}">
                    <span class="gpx-layer-dot" style="background:${layer.color}"></span>
                    <div class="gpx-layer-info">
                        <span class="gpx-layer-name">${truncName}</span>
                        <span class="gpx-layer-stats">${layer.stats.distance.toFixed(1)} km · D+ ${Math.round(layer.stats.dPlus)} m · D- ${Math.round(layer.stats.dMinus)} m</span>
                    </div>
                    <button class="gpx-layer-toggle" data-action="toggle" data-id="${layer.id}" 
                            aria-label="${i18n.t('track.imported.toggleVisible')}"
                            title="${i18n.t('track.imported.toggleVisible')}">
                        ${layer.visible ? '👁' : '🚫'}
                    </button>
                    <button class="gpx-layer-remove" data-action="remove" data-id="${layer.id}"
                            aria-label="${i18n.t('track.imported.remove')}"
                            title="${i18n.t('track.imported.remove')}">×</button>
                </div>`;
            }).join('')}`;

        // Bind events
        container.querySelectorAll('.gpx-layer-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                // Don't activate if clicking a button
                if (target.closest('[data-action]')) return;
                const layerId = (item as HTMLElement).dataset.layerId;
                if (!layerId) return;
                state.activeGPXLayerId = layerId;
                updateElevationProfile(layerId);
                // FlyTo
                const layer = state.gpxLayers.find(l => l.id === layerId);
                if (layer && layer.rawData?.tracks?.[0]?.points?.length > 0) {
                    // Always derive from raw lat/lon using CURRENT originTile
                    // so coords are correct regardless of any origin shifts that happened
                    const rawPts = layer.rawData.tracks[0].points as any[];
                    const lats = rawPts.map(p => p.lat as number);
                    const lons = rawPts.map(p => p.lon as number);
                    const eles = rawPts.map(p => (p.ele as number) || 0);
                    const centerLat = (Math.max(...lats) + Math.min(...lats)) / 2;
                    const centerLon = (Math.max(...lons) + Math.min(...lons)) / 2;
                    const avgEle = eles.reduce((s, v) => s + v, 0) / eles.length;
                    const worldPos = lngLatToWorld(centerLon, centerLat, state.originTile);
                    const targetElevation = avgEle * state.RELIEF_EXAGGERATION;
                    // Use spread from stored points for distance (they're correct after origin-shift updates)
                    const xs = layer.points.map(p => p.x);
                    const zs = layer.points.map(p => p.z);
                    const spread = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
                    const viewDistance = Math.max(spread * 1.5, 3000);
                    eventBus.emit('flyTo', { worldX: worldPos.x, worldZ: worldPos.z, targetElevation, targetDistance: viewDistance });
                }
                this.renderLayersList();
            });
        });

        container.querySelectorAll('[data-action="toggle"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = (btn as HTMLElement).dataset.id;
                if (id) {
                    toggleGPXLayer(id);
                    this.renderLayersList();
                }
            });
        });

        container.querySelectorAll('[data-action="remove"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = (btn as HTMLElement).dataset.id;
                if (id) {
                    removeGPXLayer(id);
                }
            });
        });
    }

    private updateEmptyState(): void {
        const emptyEl = document.getElementById('track-empty-state');
        const statsEl = this.element?.querySelector('.track-stats') as HTMLElement | null;
        if (!emptyEl) return;

        const hasData = state.gpxLayers.length > 0 || state.recordedPoints.length > 0;
        emptyEl.style.display = hasData ? 'none' : 'flex';
        if (statsEl) statsEl.style.display = hasData ? '' : 'none';
    }

    private updateRecUI() {
        const recBtn = document.getElementById('rec-btn-sheet') as HTMLButtonElement;
        const navTab = document.querySelector('.nav-tab[data-tab="track"]');
        if (!recBtn) return;
        
        if (state.isRecording) {
            recBtn.classList.add('active');
            recBtn.innerHTML = `
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" class="trk-rec-icon">
                    <rect x="2" y="2" width="6" height="6" rx="1" fill="white"/>
                </svg> ${i18n.t('track.btn.stop')}`;
            navTab?.classList.add('has-notif');
        } else {
            recBtn.classList.remove('active');
            recBtn.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" class="trk-rec-icon">
                    <circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.3"/>
                    <circle cx="6" cy="6" r="3" fill="currentColor"/>
                </svg> ${i18n.t('track.btn.rec')}`;
            navTab?.classList.remove('has-notif');
        }
    }

    private updateStats() {
        if (!this.element) return;
        
        const distEl = document.getElementById('track-dist');
        const pointsEl = document.getElementById('track-points');
        const dplusEl = document.getElementById('track-dplus');
        const dminusEl = document.getElementById('track-dminus');

        // ARIA: stats are live regions
        distEl?.setAttribute('aria-live', 'polite');
        pointsEl?.setAttribute('aria-live', 'polite');
        dplusEl?.setAttribute('aria-live', 'polite');
        dminusEl?.setAttribute('aria-live', 'polite');

        if (pointsEl) pointsEl.textContent = state.recordedPoints.length.toString();
        
        if (state.recordedPoints.length < 2) {
            if (distEl) distEl.innerHTML = `0.0 <span class="trk-stat-unit">km</span>`;
            if (dplusEl) dplusEl.innerHTML = `+0 <span class="trk-stat-unit-plain">m</span>`;
            if (dminusEl) dminusEl.innerHTML = `−0 <span class="trk-stat-unit-plain">m</span>`;
            return;
        }

        let dist = 0;
        let dplus = 0;
        let dminus = 0;

        for (let i = 1; i < state.recordedPoints.length; i++) {
            const p1 = state.recordedPoints[i-1];
            const p2 = state.recordedPoints[i];
            
            const dx = (p2.lon - p1.lon) * 111320 * Math.cos(p1.lat * Math.PI / 180);
            const dy = (p2.lat - p1.lat) * 111320;
            dist += Math.sqrt(dx*dx + dy*dy);

            const diff = p2.alt - p1.alt;
            if (diff > 0) dplus += diff;
            else dminus += Math.abs(diff);
        }

        if (distEl) distEl.innerHTML = `${(dist / 1000).toFixed(2)} <span class="trk-stat-unit">km</span>`;
        if (dplusEl) dplusEl.innerHTML = `+${Math.round(dplus)} <span class="trk-stat-unit-plain">m</span>`;
        if (dminusEl) dminusEl.innerHTML = `−${Math.round(dminus)} <span class="trk-stat-unit-plain">m</span>`;
    }

    private exportRecordedGPX() {
        let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SunTrail 3D" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>SunTrail Recorded Track - ${new Date().toLocaleDateString()}</name>
    <trkseg>`;

        state.recordedPoints.forEach(p => {
            gpx += `
      <trkpt lat="${p.lat}" lon="${p.lon}">
        <ele>${p.alt.toFixed(1)}</ele>
        <time>${new Date(p.timestamp).toISOString()}</time>
      </trkpt>`;
        });

        gpx += `
    </trkseg>
  </trk>
</gpx>`;

        const blob = new Blob([gpx], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `suntrail-track-${Date.now()}.gpx`;
        link.click();
        URL.revokeObjectURL(url);
        showToast(i18n.t('track.toast.exported'));
    }

    private async handleGPX(xml: string, fileName: string = 'track.gpx') {
        try {
            const gpx = new gpxParser(); 
            gpx.parse(xml);
            if (!gpx.tracks?.length) {
                void haptic('warning');
                return;
            }
            
            const startPt = gpx.tracks[0].points[0];
            
            // Only recenter map on first import
            if (state.gpxLayers.length === 0) {
                state.TARGET_LAT = startPt.lat; 
                state.TARGET_LON = startPt.lon;
                state.ZOOM = 13; 
                state.originTile = lngLatToTile(startPt.lon, startPt.lat, 13);
                await updateVisibleTiles();
            }
            
            const name = fileName.replace(/\.gpx$/i, '');
            addGPXLayer(gpx, name);
            void haptic('success');
        } catch (e) {
            void haptic('warning');
            throw e;
        }
    }
}
