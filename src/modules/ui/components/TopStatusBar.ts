import { BaseComponent } from '../core/BaseComponent';
import { state } from '../../state';
import { i18n } from '../../../i18n/I18nService';
import { eventBus } from '../../eventBus';
import { sheetManager } from '../core/SheetManager';
import { packManager } from '../../packManager';
import { getWeatherIcon } from '../../weather';
import { getCountryCode } from '../../geo';
import { createTooltip, type TooltipHandle } from '../tooltip';
import templateHTML from '../templates/top-status-bar.html?raw';

export class TopStatusBar extends BaseComponent {
    private lodBadge: HTMLElement | null = null;
    private weatherIcon: HTMLElement | null = null;
    private weatherTemp: HTMLElement | null = null;
    private netStatusIcon: HTMLElement | null = null;
    private recWidget: HTMLElement | null = null;
    private recTimer: HTMLElement | null = null;
    private recInterval: any = null;
    private lodTooltip: TooltipHandle | null = null;

    constructor() {
        super('template-top-status-bar', 'top-status-bar', templateHTML);
    }

    public render(): void {
        if (!this.element) return;

        this.lodBadge = this.element.querySelector('.lod-badge');
        this.weatherIcon = this.element.querySelector('.weather-icon');
        this.weatherTemp = this.element.querySelector('.weather-temp');
        this.netStatusIcon = this.element.querySelector(
            '#net-status-icon'
        ) as HTMLElement;
        this.recWidget = this.element.querySelector('.rec-indicator');
        this.recTimer = this.element.querySelector('.rec-timer');

        // ARIA: LOD badge is a live region (updates dynamically)
        this.lodBadge?.setAttribute('aria-live', 'polite');

        const weatherPill = this.element.querySelector('#top-pill-weather');
        weatherPill?.addEventListener('click', () => {
            sheetManager.toggle('weather');
        });

        // LOD tooltip icon on the LOD pill
        const centerWidgets = this.element.querySelector('.top-center-widgets');
        const lodInfoIcon = document.createElement('span');
        lodInfoIcon.className = 'lod-info-trigger';
        lodInfoIcon.textContent = 'ⓘ';
        lodInfoIcon.style.cssText =
            'font-size:var(--text-xs);opacity:0.4;cursor:pointer;margin-left:2px;align-self:center;';
        centerWidgets?.appendChild(lodInfoIcon);
        const lodContent = document.createElement('div');
        lodContent.innerHTML = i18n.t('topbar.tooltipLOD');
        this.lodTooltip = createTooltip(lodInfoIcon, lodContent, {
            trigger: 'click',
        });

        // LOD badge click → adaptive: packs if pack covers current zone, else layers
        const lodPill = this.element.querySelector('#top-pill-lod');
        lodPill?.addEventListener('click', () => {
            const lat = state.TARGET_LAT;
            const lon = state.TARGET_LON;
            const pack = packManager.findPackContaining(lat, lon);
            if (pack) {
                eventBus.emit('packHighlight', { packId: pack.id });
                sheetManager.open('packs');
            } else {
                sheetManager.toggle('layers-sheet');
            }
        });

        // ARIA: icon buttons need aria-label
        this.netStatusIcon?.setAttribute(
            'aria-label',
            i18n.t('topbar.aria.network')
        );
        this.netStatusIcon?.addEventListener('click', (e) => {
            e.stopPropagation();
            sheetManager.toggle('connectivity');
        });

        const recWidget = this.element.querySelector('.rec-indicator');
        recWidget?.setAttribute('aria-label', i18n.t('topbar.aria.recording'));
        recWidget?.setAttribute('aria-live', 'polite');
        recWidget?.addEventListener('click', () => {
            // Une session REC ouvre toujours le tableau Sortie, même si la
            // dernière destination de cette feuille était Préparer ou la Bibliothèque.
            document.body.dataset.trackDestination = 'outing';
            eventBus.emit('trackDestinationChanged', { destination: 'outing' });
            sheetManager.open('track');
        });

        const sosBtn = this.element.querySelector('#sos-main-btn');
        sosBtn?.setAttribute('aria-label', i18n.t('topbar.aria.sos'));
        sosBtn?.addEventListener('click', () => {
            sheetManager.toggle('sos');
        });

        const parent = this.element?.parentElement;
        const collapseToggle = parent?.querySelector('.top-collapse-toggle');
        collapseToggle?.addEventListener('click', (e) => {
            e.stopPropagation();
            parent?.classList.toggle('collapsed');
        });

        this.updateLOD(state.ZOOM);
        this.updateWeather(state.weatherData);
        this.updateNetwork();
        this.updateRecStatus(state.isRecording);

        this.addSubscription(
            state.subscribe('ZOOM', (val: number) => this.updateLOD(val))
        );
        this.addSubscription(
            state.subscribe('MAP_SOURCE', () => this.updateLOD(state.ZOOM))
        );
        this.addSubscription(
            state.subscribe('TARGET_LAT', () => this.updateLOD(state.ZOOM))
        );
        const onViewportResize = () => this.updateLOD(state.ZOOM);
        window.addEventListener('resize', onViewportResize);
        this.addSubscription(() =>
            window.removeEventListener('resize', onViewportResize)
        );
        this.addSubscription(
            state.subscribe('weatherData', (val: any) =>
                this.updateWeather(val)
            )
        );
        this.addSubscription(
            state.subscribe('IS_OFFLINE', () => this.updateNetwork())
        );
        this.addSubscription(
            state.subscribe('isNetworkAvailable', () => this.updateNetwork())
        );
        this.addSubscription(
            state.subscribe('isRecording', (val: boolean) =>
                this.updateRecStatus(val)
            )
        );

        const degradedServices = new Set<string>();
        const onServiceDegraded = (payload: {
            service: string;
            disabled: boolean;
        }) => {
            if (payload.disabled) {
                degradedServices.add(payload.service);
            } else {
                degradedServices.delete(payload.service);
            }
            this.updateNetwork(degradedServices.size > 0);
        };
        eventBus.on('serviceDegraded', onServiceDegraded);
        this.addSubscription(() =>
            eventBus.off('serviceDegraded', onServiceDegraded)
        );

        this.updateAriaLabels();
        const onLocaleChanged = () => this.updateAriaLabels();
        eventBus.on('localeChanged', onLocaleChanged);
        this.addSubscription(() =>
            eventBus.off('localeChanged', onLocaleChanged)
        );
    }

    private updateAriaLabels(): void {
        if (!this.element) return;
        this.updatePillAriaLabel();
        this.netStatusIcon?.setAttribute(
            'aria-label',
            i18n.t('topbar.aria.network')
        );
        const recWidget = this.element.querySelector('.rec-indicator');
        recWidget?.setAttribute('aria-label', i18n.t('topbar.aria.recording'));
        const sosBtn = this.element.querySelector('#sos-main-btn');
        sosBtn?.setAttribute('aria-label', i18n.t('topbar.aria.sos'));
        // Also refresh LOD badge with new locale strings
        this.updateLOD(state.ZOOM);
    }

    private updateRecStatus(isRecording: boolean): void {
        if (!this.recWidget) return;

        if (isRecording) {
            this.recWidget.style.display = 'flex';
            this.startTimer();
        } else {
            this.recWidget.style.display = 'none';
            this.stopTimer();
        }
    }

    private startTimer() {
        if (this.recInterval) clearInterval(this.recInterval);
        const startTime =
            state.recordedPoints.length > 0
                ? state.recordedPoints[0].timestamp
                : Date.now();

        const update = () => {
            if (!this.recTimer) return;
            const elapsed = Date.now() - startTime;
            const sec = Math.floor((elapsed / 1000) % 60);
            const min = Math.floor((elapsed / 60000) % 60);
            const hrs = Math.floor(elapsed / 3600000);

            const timeStr =
                hrs > 0
                    ? `${hrs}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
                    : `${min}:${sec.toString().padStart(2, '0')}`;

            this.recTimer.textContent = timeStr;
        };

        update();
        this.recInterval = setInterval(update, 1000);
    }

    private stopTimer() {
        if (this.recInterval) {
            clearInterval(this.recInterval);
            this.recInterval = null;
        }
    }

    private updateLOD(zoom: number): void {
        if (this.lodBadge) {
            let sourceKey = 'world';

            if (state.MAP_SOURCE === 'opentopomap') {
                sourceKey = 'opentopo';
            } else if (state.MAP_SOURCE === 'satellite') {
                sourceKey = 'sat';
            } else {
                const lat = state.TARGET_LAT;
                const lon = state.TARGET_LON;
                const code = getCountryCode(lat, lon);

                switch (code) {
                    case 'CH':
                        sourceKey = 'swiss';
                        break;
                    case 'IT':
                        sourceKey = 'italy';
                        break;
                    case 'FR':
                        sourceKey = 'ign';
                        break;
                    case 'DE':
                        sourceKey = 'germany';
                        break;
                    case 'AT':
                        sourceKey = 'austria';
                        break;
                    case 'ES':
                        sourceKey = 'spain';
                        break;
                    case 'NO':
                        sourceKey = 'norway';
                        break;
                }
            }

            const country = i18n.t(`topbar.lod.${sourceKey}`);

            // Pack visual indicator
            const lat = state.TARGET_LAT;
            const lon = state.TARGET_LON;
            const pack = packManager.findPackContaining(lat, lon);
            const ps = pack ? packManager.getPackState(pack.id) : null;

            this.lodBadge.dataset.lod = String(Math.floor(zoom));
            const isCompact = window.innerWidth <= 500;
            const badgeTextKey = isCompact
                ? 'topbar.mapDetailCompact'
                : 'topbar.mapDetail';
            let badgeText = i18n.t(badgeTextKey, {
                source: isCompact
                    ? i18n.t(`topbar.lodShort.${sourceKey}`)
                    : country,
                detail: String(Math.floor(zoom)),
            });
            if (
                ps?.status === 'installed' ||
                ps?.status === 'update_available'
            ) {
                badgeText = `\u2713 ${badgeText}`;
                this.lodBadge.dataset.packState = 'installed';
            } else if (pack) {
                badgeText = `\u{1F4E6} ${badgeText}`;
                delete this.lodBadge.dataset.packState;
            } else {
                delete this.lodBadge.dataset.packState;
            }

            this.lodBadge.textContent = badgeText;
            this.updatePillAriaLabel();
        }
    }

    private updatePillAriaLabel(): void {
        const weatherPill = this.element?.querySelector('#top-pill-weather');
        if (weatherPill) {
            const temp = this.weatherTemp?.textContent ?? '';
            weatherPill.setAttribute('aria-label', `Météo ${temp}`.trim());
        }
        const lodPill = this.element?.querySelector('#top-pill-lod');
        if (lodPill) {
            const lod = this.lodBadge?.textContent ?? '';
            lodPill.setAttribute('aria-label', lod.trim());
        }
    }

    public override dispose(): void {
        this.stopTimer();
        if (this.lodTooltip) {
            this.lodTooltip.dispose();
            this.lodTooltip = null;
        }
        super.dispose();
    }

    private updateWeather(weatherData: any): void {
        if (this.weatherIcon && this.weatherTemp) {
            if (weatherData) {
                const currentCode = weatherData.hourly?.[0]?.code ?? 0;
                this.weatherIcon.textContent = getWeatherIcon(currentCode);
                this.weatherTemp.textContent = `${Math.round(weatherData.temp)}°C`;
            } else {
                this.weatherIcon.textContent = '☀️';
                this.weatherTemp.textContent = '--°C';
            }
            this.updatePillAriaLabel();
        }
    }

    private updateNetwork(degraded: boolean = false): void {
        if (this.netStatusIcon) {
            const isOffline = state.IS_OFFLINE || !state.isNetworkAvailable;
            if (isOffline) {
                this.netStatusIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.7 12.3a2.5 2.5 0 0 1 3.6 3.6m-2.2-12.7a5 5 0 0 1 7.1 7.1m-1.8 4.2A5 5 0 0 1 3 10.5a5 5 0 0 1 4.5-4.9M1 1l22 22"/></svg>`;
            } else if (degraded) {
                this.netStatusIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warning, #f59e0b)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/><line x1="17" y1="7" x2="22" y2="2"/></svg>`;
            } else {
                this.netStatusIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`;
            }
        }
    }
}
