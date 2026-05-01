import { BaseComponent } from '../core/BaseComponent';
import { state } from '../../state';
import { sheetManager } from '../core/SheetManager';
import { i18n } from '../../../i18n/I18nService';
import { eventBus } from '../../eventBus';
import { worldToLngLat } from '../../geo';
import {
    computeRoute,
    addRouteWaypoint,
    removeRouteWaypoint,
    clearRouteWaypoints,
    reverseWaypoints,
    reverseGeocodeWaypoint,
    getActiveProfile,
} from '../../routingService';
import templateHTML from '../templates/route-planner.html?raw';

export class RoutePlannerSheet extends BaseComponent {
    constructor() {
        super('template-route-planner', 'sheet-container', templateHTML);
    }

    public render(): void {
        if (!this.element) return;

        const closeBtn = this.element.querySelector('#close-route-planner');
        closeBtn?.setAttribute('aria-label', i18n.t('routePlanner.aria.close'));
        closeBtn?.addEventListener('click', () => sheetManager.close());

        this.renderWaypointsList();
        this.renderNoKeyHint();

        document.getElementById('rp-compute')?.addEventListener('click', () => void this.handleCompute());
        document.getElementById('rp-add-point')?.addEventListener('click', () => {
            state.isPlacingWaypoint = true;
            sheetManager.close();
            void showToast(i18n.t('routePlanner.toast.tapMap') || 'Tap the map to add a waypoint');
        });
        document.getElementById('rp-reverse')?.addEventListener('click', () => {
            reverseWaypoints();
            this.renderWaypointsList();
        });
        document.getElementById('rp-clear')?.addEventListener('click', () => {
            clearRouteWaypoints();
            this.renderWaypointsList();
            this.hideStats();
        });

        const loopCheckbox = document.getElementById('rp-loop') as HTMLInputElement;
        loopCheckbox?.addEventListener('change', () => {
            state.routeLoopEnabled = loopCheckbox.checked;
        });
        if (loopCheckbox) loopCheckbox.checked = state.routeLoopEnabled;

        const profileSelect = this.element.querySelector('#rp-profile') as HTMLSelectElement;
        profileSelect?.addEventListener('change', () => {
            state.activeRouteProfile = (profileSelect.value || 'foot-hiking') as any;
        });
        profileSelect.value = getActiveProfile();

        document.getElementById('rp-save-key')?.addEventListener('click', () => {
            const input = this.element!.querySelector('#rp-ors-key-input') as HTMLInputElement;
            const key = input?.value?.trim();
            if (key && key.length > 10) {
                state.ORS_KEY = key;
                try {
                    localStorage.setItem('suntrail_ors_key', key);
                } catch { /* ignore */ }
                this.renderNoKeyHint();
                void showToast(i18n.t('routePlanner.toast.keySaved') || 'ORS key saved');
            }
        });

        this.addSubscription(state.subscribe('routeWaypoints', () => this.renderWaypointsList()));
        this.addSubscription(state.subscribe('routeLoading', () => this.updateLoadingState()));
        this.addSubscription(state.subscribe('routeError', () => this.updateErrorState()));

        this.addSubscription(state.subscribe('hasLastClicked', () => {
            if (state.hasLastClicked && state.lastClickedCoords && state.originTile) {
                const isOpen = this.element?.classList.contains('is-open');
                const isPlacing = state.isPlacingWaypoint;
                if (isOpen || isPlacing) {
                    const gps = worldToLngLat(
                        state.lastClickedCoords.x,
                        state.lastClickedCoords.z,
                        state.originTile,
                    );
                    this.addWaypointFromClick(gps.lat, gps.lon, state.lastClickedCoords.alt);
                    if (isPlacing) {
                        state.isPlacingWaypoint = false;
                        sheetManager.open('route-planner-sheet');
                    }
                }
            }
        }));
    }

    private async addWaypointFromClick(lat: number, lon: number, alt: number): Promise<void> {
        const waypoints = state.routeWaypoints;
        if (waypoints.length >= 10) {
            void showToast(i18n.t('routePlanner.error.maxWaypoints') || 'Maximum 10 waypoints');
            return;
        }

        addRouteWaypoint({ lat, lon, alt });

        const idx = state.routeWaypoints.length - 1;

        const name = await reverseGeocodeWaypoint(lat, lon);
        if (name) {
            const current = state.routeWaypoints;
            current[idx] = { ...current[idx], name };
            state.routeWaypoints = [...current];
        }
    }

    private renderWaypointsList(): void {
        const container = this.element?.querySelector('#rp-waypoints-list');
        if (!container) return;

        const waypoints = state.routeWaypoints;
        if (waypoints.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        container.innerHTML = waypoints.map((wp, i) => {
            const label = wp.name || `${wp.lat.toFixed(5)}, ${wp.lon.toFixed(5)}`;
            const altText = wp.alt ? ` · ${Math.round(wp.alt)} m` : '';
            return `
                <div class="rp-waypoint-item">
                    <span class="rp-waypoint-index">${i + 1}</span>
                    <span class="rp-waypoint-label">${label}${altText}</span>
                    <button class="rp-waypoint-remove" data-index="${i}" aria-label="${i18n.t('routePlanner.aria.removeWaypoint') || 'Remove waypoint'}">&times;</button>
                </div>`;
        }).join('');

        container.querySelectorAll('.rp-waypoint-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt((btn as HTMLElement).dataset.index || '', 10);
                if (!isNaN(idx)) {
                    removeRouteWaypoint(idx);
                }
            });
        });

        const computeBtn = this.element?.querySelector('#rp-compute') as HTMLButtonElement;
        if (computeBtn) {
            computeBtn.disabled = waypoints.length < 2;
        }
    }

    private async handleCompute(): Promise<void> {
        if (state.routeWaypoints.length < 2) {
            void showToast(i18n.t('routePlanner.error.minWaypoints') || 'At least 2 waypoints required');
            return;
        }
        try {
            const result = await computeRoute(state.routeWaypoints);
            this.showStats(result.distance, result.ascent, result.descent, result.duration);
        } catch {
            this.updateErrorState();
        }
    }

    private showStats(distance: number, ascent: number, descent: number, duration: number): void {
        const stats = this.element?.querySelector('#rp-stats');
        if (!stats) return;
        stats.classList.remove('hidden');

        const distEl = this.element?.querySelector('#rp-distance');
        const ascEl = this.element?.querySelector('#rp-ascent');
        const descEl = this.element?.querySelector('#rp-descent');
        const durEl = this.element?.querySelector('#rp-duration');

        if (distEl) distEl.textContent = `📏 ${distance.toFixed(1)} km`;
        if (ascEl) ascEl.textContent = `⛰ +${Math.round(ascent)} m`;
        if (descEl) descEl.textContent = `⛰ −${Math.round(descent)} m`;
        if (durEl) durEl.textContent = this.formatDuration(duration);
    }

    private hideStats(): void {
        const stats = this.element?.querySelector('#rp-stats');
        stats?.classList.add('hidden');
    }

    private formatDuration(minutes: number): string {
        if (minutes <= 0) return '—';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        if (h === 0) return `⏱ ${m} min`;
        return `⏱ ${h}h${m > 0 ? m.toString().padStart(2, '0') : ''}`;
    }

    private updateLoadingState(): void {
        const loading = this.element?.querySelector('#rp-loading');
        const error = this.element?.querySelector('#rp-error');
        if (!loading) return;
        if (state.routeLoading) {
            loading.classList.remove('hidden');
            error?.classList.add('hidden');
        } else {
            loading.classList.add('hidden');
        }
    }

    private updateErrorState(): void {
        const error = this.element?.querySelector('#rp-error');
        if (!error) return;
        if (state.routeError) {
            error.classList.remove('hidden');
            error.textContent = state.routeError;
        } else {
            error.classList.add('hidden');
        }
    }

    private renderNoKeyHint(): void {
        const hint = this.element?.querySelector('#rp-no-key-hint');
        if (!hint) return;
        if (!state.ORS_KEY) {
            hint.classList.remove('hidden');
        } else {
            hint.classList.add('hidden');
        }
    }
}

function showToast(message: string): void {
    import('../../toast').then(({ showToast: st }) => void st(message));
}
