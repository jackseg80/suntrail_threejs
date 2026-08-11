import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { i18n } from '../../i18n/I18nService';
import { eventBus } from '../eventBus';
import { haptic } from '../haptics';
import {
    centerOnUser,
    setUserFollowViewport,
    startLocationTracking,
} from '../location';
import { closeElevationProfile, updateElevationProfile } from '../profile';
import type { PreparedRouteV1 } from '../preparedRoutes/preparedRoute';
import { preparedRouteService } from '../preparedRoutes/preparedRouteService';
import { recordingService } from '../recordingService';
import { releaseFlags } from '../releaseFlags';
import { state } from '../state';
import { GuidanceEngine } from './GuidanceEngine';
import type {
    GuidanceCueKind,
    GuidanceSnapshot,
    GuidanceUpdate,
} from './guidanceTypes';

function formatDistance(meters: number): string {
    return meters >= 1000
        ? `${(meters / 1000).toFixed(meters >= 10_000 ? 0 : 1)} km`
        : `${Math.round(meters)} m`;
}

function formatEta(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    });
}

function cueLabel(kind: GuidanceCueKind): string {
    return i18n.t(`guidance.cue.${kind}`) || kind;
}

function cueDisplayLabel(cue: GuidanceSnapshot['nextCue']): string {
    if (!cue) return i18n.t('guidance.cue.none');
    const canonical = cueLabel(cue.kind);
    if (cue.source === 'ors' || cue.source === 'geometry-derived') {
        return canonical;
    }
    if (cue.source === 'osrm' && cue.label) {
        return `${canonical} · ${cue.label}`;
    }
    return cue.label || canonical;
}

export class GuidanceForegroundService {
    private engine: GuidanceEngine | null = null;
    private route: PreparedRouteV1 | null = null;
    private snapshot: GuidanceSnapshot | null = null;
    private unsubscribeLocation: (() => void) | null = null;
    private unsubscribeRecording: (() => void) | null = null;
    private tickTimer: number | null = null;
    private alertTimer: number | null = null;
    private element: HTMLElement | null = null;
    private expanded = false;
    private recordingActionPending = false;

    public isActive(): boolean {
        return !!this.engine && this.snapshot?.status !== 'idle';
    }

    public getSnapshot(): GuidanceSnapshot | null {
        return this.snapshot ? { ...this.snapshot } : null;
    }

    public async start(
        route: PreparedRouteV1,
        options: { approximateConfirmed?: boolean } = {}
    ): Promise<boolean> {
        if (!releaseFlags.isEnabled('guidanceForeground')) return false;
        if (route.guidanceQuality === 'not-ready') return false;
        if (
            route.guidanceQuality === 'approximate' &&
            options.approximateConfirmed !== true
        ) {
            return false;
        }
        if (!(await this.ensureLocationPermission())) return false;

        this.stop(false);
        this.expanded = false;
        setUserFollowViewport('guidanceCompact');
        closeElevationProfile();
        const plan = await preparedRouteService.getGuidancePlan(route);
        this.route = route;
        this.engine = new GuidanceEngine({
            routeId: route.id,
            geometry: route.geometry,
            plannedPaceKmh: route.plannedPaceKmh,
            plan,
        });
        this.ensureUI();
        document.body.classList.add('guidance-active');
        this.applyUpdate(this.engine.start());
        this.unsubscribeLocation = state.subscribe(
            'userLocation',
            (location) => {
                if (!location || !this.engine) return;
                const timestamp = state.lastTrackingUpdate || Date.now();
                this.applyUpdate(
                    this.engine.update(
                        {
                            lat: location.lat,
                            lon: location.lon,
                            accuracyMeters: state.userLocationAccuracy,
                            timestamp,
                        },
                        Date.now()
                    )
                );
            }
        );
        this.unsubscribeRecording = state.subscribe('isRecording', () =>
            this.render()
        );
        this.tickTimer = window.setInterval(() => {
            if (this.engine) this.applyUpdate(this.engine.tick());
        }, 1000);
        await startLocationTracking();
        if (state.userLocation && this.engine) {
            this.applyUpdate(
                this.engine.update({
                    ...state.userLocation,
                    accuracyMeters: state.userLocationAccuracy,
                    timestamp: state.lastTrackingUpdate || Date.now(),
                })
            );
        }
        return true;
    }

    public pause(): void {
        if (this.engine) this.applyUpdate(this.engine.pause());
    }

    public resume(): void {
        if (this.engine) this.applyUpdate(this.engine.resume());
    }

    public stop(announce = true): void {
        if (this.engine) this.applyUpdate(this.engine.stop());
        if (document.body.classList.contains('guidance-active')) {
            closeElevationProfile();
        }
        this.unsubscribeLocation?.();
        this.unsubscribeLocation = null;
        this.unsubscribeRecording?.();
        this.unsubscribeRecording = null;
        if (this.tickTimer !== null) window.clearInterval(this.tickTimer);
        this.tickTimer = null;
        if (this.alertTimer !== null) window.clearTimeout(this.alertTimer);
        this.alertTimer = null;
        this.engine = null;
        this.route = null;
        this.snapshot = null;
        this.expanded = false;
        setUserFollowViewport('center');
        document.body.classList.remove('guidance-active');
        if (this.element) this.element.hidden = true;
        eventBus.emit('guidanceStopped');
        if (announce) void haptic('light');
    }

    private async ensureLocationPermission(): Promise<boolean> {
        const { requestGPSDisclosure } = await import('../gpsDisclosure');
        if (!(await requestGPSDisclosure())) return false;
        if (!Capacitor.isNativePlatform()) return true;
        let permissions = await Geolocation.checkPermissions();
        if (permissions.location !== 'granted') {
            permissions = await Geolocation.requestPermissions({
                permissions: ['location'],
            });
        }
        return permissions.location === 'granted';
    }

    private ensureUI(): void {
        this.element = document.getElementById('guidance-foreground');
        if (this.element) return;
        const element = document.createElement('section');
        element.id = 'guidance-foreground';
        element.className = 'guidance-foreground';
        element.hidden = true;
        element.dataset.expanded = 'false';
        element.setAttribute('aria-label', i18n.t('guidance.title'));
        element.innerHTML = `
            <div class="guidance-alert" id="guidance-alert" role="alert" hidden></div>
            <div class="guidance-heading">
                <div>
                    <span class="guidance-eyebrow">${i18n.t('guidance.foregroundBeta')}</span>
                    <strong id="guidance-route-name"></strong>
                </div>
                <div class="guidance-heading-tools">
                    <span id="guidance-status" class="guidance-status" role="status"></span>
                    <button type="button" class="guidance-expand" data-guidance-action="expand" aria-expanded="false">
                        <span class="guidance-expand-label">${i18n.t('guidance.actions.details')}</span>
                        <span aria-hidden="true">⌃</span>
                    </button>
                </div>
            </div>
            <div class="guidance-cue" aria-live="polite">
                <span id="guidance-cue-distance" class="guidance-cue-distance"></span>
                <span id="guidance-direction" class="guidance-direction" hidden>
                    <svg id="guidance-direction-arrow" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 2 19 21 12 17 5 21 12 2Z"></path>
                    </svg>
                    <span id="guidance-direction-label" class="sr-only"></span>
                </span>
                <strong id="guidance-cue-label"></strong>
                <span id="guidance-cue-confidence" class="guidance-cue-confidence"></span>
            </div>
            <div class="guidance-metrics">
                <div><span>${i18n.t('guidance.remaining')}</span><strong id="guidance-remaining">—</strong></div>
                <div><span>${i18n.t('guidance.eta')}</span><strong id="guidance-eta">—</strong></div>
                <div><span>${i18n.t('guidance.progress')}</span><strong id="guidance-progress">0%</strong></div>
                <div><span>${i18n.t('guidance.crossTrack')}</span><strong id="guidance-cross-track">—</strong></div>
            </div>
            <div class="guidance-gps-row">
                <span id="guidance-gps">${i18n.t('guidance.gps.acquiring')}</span>
                <span id="guidance-bearing">—</span>
            </div>
            <div class="guidance-actions">
                <button type="button" data-guidance-action="pause">${i18n.t('guidance.actions.pause')}</button>
                <button type="button" data-guidance-action="profile" aria-pressed="false">${i18n.t('guidance.actions.profile')}</button>
                <button type="button" data-guidance-action="record">REC</button>
                <button type="button" data-guidance-action="stop" class="guidance-stop">${i18n.t('guidance.actions.stop')}</button>
            </div>
            <p class="guidance-limit">${i18n.t('guidance.foregroundLimit')}</p>
        `;
        element.addEventListener('click', (event) => {
            const action = (event.target as HTMLElement).closest<HTMLElement>(
                '[data-guidance-action]'
            )?.dataset.guidanceAction;
            if (action === 'pause') {
                if (this.snapshot?.status === 'paused') this.resume();
                else this.pause();
            } else if (action === 'expand') {
                this.setExpanded(!this.expanded);
            } else if (action === 'profile') {
                this.toggleProfile();
            } else if (action === 'record') {
                void this.toggleRecording();
            } else if (action === 'stop') {
                this.stop();
            }
        });
        document.body.appendChild(element);
        this.element = element;
    }

    private setExpanded(expanded: boolean): void {
        this.expanded = expanded;
        setUserFollowViewport(
            expanded ? 'guidanceExpanded' : 'guidanceCompact'
        );
        if (this.element) this.element.dataset.expanded = String(expanded);
        this.render();
        // Le changement de hauteur est une intention explicite. On repositionne
        // une fois la carte après la mise à jour du panneau, sans imposer le
        // suivi permanent si l'utilisateur l'avait désactivé.
        window.requestAnimationFrame(() => {
            if (state.userLocation) centerOnUser(0.5);
            eventBus.emit('sceneRenderRequested');
        });
        void haptic('selection');
    }

    private async toggleRecording(): Promise<void> {
        if (this.recordingActionPending) return;
        this.recordingActionPending = true;
        this.render();
        try {
            if (state.isRecording) await recordingService.stopRecording();
            else await recordingService.toggleRecording();
        } finally {
            this.recordingActionPending = false;
            this.render();
        }
    }

    private toggleProfile(): void {
        const profile = document.getElementById('elevation-profile');
        if (profile?.classList.contains('is-open')) {
            closeElevationProfile();
        } else {
            const preparedLayerId = this.route
                ? `prepared-${this.route.id}`
                : null;
            const profileLayer =
                state.gpxLayers.find(
                    (layer) =>
                        layer.id === preparedLayerId && layer.points.length >= 2
                ) ??
                state.gpxLayers.find(
                    (layer) =>
                        layer.id === state.activeGPXLayerId &&
                        layer.points.length >= 2
                ) ??
                state.gpxLayers.find((layer) => layer.points.length >= 2);
            updateElevationProfile(profileLayer?.id);
        }
        this.render();
        void haptic('selection');
    }

    private applyUpdate(update: GuidanceUpdate): void {
        this.snapshot = update.snapshot;
        this.render();
        eventBus.emit('guidanceSnapshot', update.snapshot);
        for (const event of update.events) {
            if (event === 'off-route') {
                this.showAlert(i18n.t('guidance.alert.offRoute'));
                void haptic('warning');
            } else if (event === 'recovered') {
                this.showAlert(i18n.t('guidance.alert.recovered'));
                void haptic('success');
            } else if (event === 'arrived') {
                this.showAlert(i18n.t('guidance.alert.arrived'));
                void haptic('success');
            }
        }
    }

    private showAlert(message: string): void {
        const alert =
            this.element?.querySelector<HTMLElement>('#guidance-alert');
        if (!alert) return;
        alert.textContent = message;
        alert.hidden = false;
        if (this.alertTimer !== null) window.clearTimeout(this.alertTimer);
        this.alertTimer = window.setTimeout(() => {
            alert.hidden = true;
            this.alertTimer = null;
        }, 5000);
    }

    private render(): void {
        if (!this.element || !this.snapshot || !this.route) return;
        const snapshot = this.snapshot;
        this.element.hidden = snapshot.status === 'idle';
        this.element.dataset.status = snapshot.status;
        this.element.dataset.expanded = String(this.expanded);
        const total = snapshot.progressMeters + snapshot.remainingMeters;
        const progressPercent =
            total > 0
                ? Math.min(100, (snapshot.progressMeters / total) * 100)
                : 0;
        const cue = snapshot.nextCue;
        const set = (selector: string, value: string) => {
            const target = this.element?.querySelector<HTMLElement>(selector);
            if (target) target.textContent = value;
        };
        set('#guidance-route-name', this.route.name);
        set('#guidance-status', i18n.t(`guidance.status.${snapshot.status}`));
        set(
            '#guidance-cue-distance',
            snapshot.distanceToNextCueMeters === null
                ? '—'
                : formatDistance(snapshot.distanceToNextCueMeters)
        );
        set('#guidance-cue-label', cueDisplayLabel(cue));
        set(
            '#guidance-cue-confidence',
            cue?.confidence === 'derived'
                ? i18n.t('guidance.cue.approximate')
                : cue
                  ? i18n.t(`guidance.confidence.${cue.confidence}`)
                  : ''
        );
        set('#guidance-remaining', formatDistance(snapshot.remainingMeters));
        set('#guidance-eta', formatEta(snapshot.eta));
        set('#guidance-progress', `${Math.round(progressPercent)}%`);
        set('#guidance-cross-track', formatDistance(snapshot.crossTrackMeters));
        const direction = this.element.querySelector<HTMLElement>(
            '#guidance-direction'
        );
        const directionArrow = this.element.querySelector<SVGElement>(
            '#guidance-direction-arrow'
        );
        const directionLabel =
            snapshot.status === 'offRoute'
                ? i18n.t('guidance.direction.rejoin')
                : i18n.t('guidance.direction.ahead');
        if (direction) {
            direction.hidden = snapshot.bearing === null;
            direction.setAttribute('aria-label', directionLabel);
        }
        set('#guidance-direction-label', directionLabel);
        if (directionArrow && snapshot.bearing !== null) {
            const relativeBearing = snapshot.bearing - (state.userHeading ?? 0);
            directionArrow.style.transform = `rotate(${relativeBearing}deg)`;
        }
        const gpsState =
            snapshot.status === 'acquiring'
                ? i18n.t('guidance.gps.acquiring')
                : `${i18n.t('guidance.gps.ready')} · ±${Math.round(snapshot.accuracyMeters ?? 0)} m · ${Math.round((snapshot.positionAgeMs ?? 0) / 1000)} s`;
        set('#guidance-gps', gpsState);
        set(
            '#guidance-bearing',
            snapshot.bearing === null
                ? i18n.t('guidance.orientation.northUp')
                : `${Math.round(snapshot.bearing)}° · ${state.userHeading === null ? i18n.t('guidance.orientation.northUp') : i18n.t('guidance.orientation.headingUp')}`
        );
        const pause = this.element.querySelector<HTMLButtonElement>(
            '[data-guidance-action="pause"]'
        );
        if (pause) {
            pause.textContent = i18n.t(
                snapshot.status === 'paused'
                    ? 'guidance.actions.resume'
                    : 'guidance.actions.pause'
            );
        }
        const expand = this.element.querySelector<HTMLButtonElement>(
            '[data-guidance-action="expand"]'
        );
        if (expand) {
            expand.setAttribute('aria-expanded', String(this.expanded));
            const label = expand.querySelector<HTMLElement>(
                '.guidance-expand-label'
            );
            if (label) {
                label.textContent = i18n.t(
                    this.expanded
                        ? 'guidance.actions.compact'
                        : 'guidance.actions.details'
                );
            }
        }
        const record = this.element.querySelector<HTMLButtonElement>(
            '[data-guidance-action="record"]'
        );
        if (record) {
            record.textContent = state.isRecording
                ? i18n.t('guidance.actions.stopRec')
                : 'REC';
            record.dataset.recording = String(state.isRecording);
            record.disabled = this.recordingActionPending;
            record.setAttribute(
                'aria-busy',
                String(this.recordingActionPending)
            );
        }
        const profile = this.element.querySelector<HTMLButtonElement>(
            '[data-guidance-action="profile"]'
        );
        if (profile) {
            profile.setAttribute(
                'aria-pressed',
                String(
                    document.body.classList.contains('guidance-profile-open')
                )
            );
        }
    }
}

export const guidanceForegroundService = new GuidanceForegroundService();
