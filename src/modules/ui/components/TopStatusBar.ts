import { BaseComponent } from '../core/BaseComponent';
import { state } from '../../state';
import { i18n } from '../../../i18n/I18nService';
import { eventBus } from '../../eventBus';
import { sheetManager } from '../core/SheetManager';

export class TopStatusBar extends BaseComponent {
    private lodBadge: HTMLElement | null = null;
    private weatherIcon: HTMLElement | null = null;
    private weatherTemp: HTMLElement | null = null;
    private netStatusIcon: HTMLElement | null = null;
    private recWidget: HTMLElement | null = null;
    private recTimer: HTMLElement | null = null;
    private recInterval: any = null;

    constructor() {
        super('template-top-status-bar', 'top-status-bar');
    }

    public render(): void {
        if (!this.element) return;

        this.lodBadge = this.element.querySelector('.lod-badge');
        this.weatherIcon = this.element.querySelector('.weather-icon');
        this.weatherTemp = this.element.querySelector('.weather-temp');
        this.netStatusIcon = this.element.querySelector('#net-status-icon') as HTMLElement;
        this.recWidget = this.element.querySelector('.rec-indicator');
        this.recTimer = this.element.querySelector('.rec-timer');

        // ARIA: LOD badge is a live region (updates dynamically)
        this.lodBadge?.setAttribute('aria-live', 'polite');

        const mainPill = this.element.querySelector('#top-pill-main');
        mainPill?.addEventListener('click', () => {
            sheetManager.toggle('weather');
        });

        // ARIA: icon buttons need aria-label
        this.netStatusIcon?.setAttribute('aria-label', i18n.t('topbar.aria.network'));
        this.netStatusIcon?.addEventListener('click', (e) => {
            e.stopPropagation();
            sheetManager.toggle('connectivity');
        });

        const recWidget = this.element.querySelector('.rec-indicator');
        recWidget?.setAttribute('aria-label', i18n.t('topbar.aria.recording'));
        recWidget?.setAttribute('aria-live', 'polite');
        recWidget?.addEventListener('click', () => {
            sheetManager.toggle('track');
        });

        const sosBtn = this.element.querySelector('#sos-main-btn');
        sosBtn?.setAttribute('aria-label', i18n.t('topbar.aria.sos'));
        sosBtn?.addEventListener('click', () => {
            sheetManager.toggle('sos');
        });

        this.updateLOD(state.ZOOM);
        this.updateWeather(state.weatherData);
        this.updateNetwork();
        this.updateRecStatus(state.isRecording);

        this.addSubscription(state.subscribe('ZOOM', (val: number) => this.updateLOD(val)));
        this.addSubscription(state.subscribe('weatherData', (val: any) => this.updateWeather(val)));
        this.addSubscription(state.subscribe('IS_OFFLINE', () => this.updateNetwork()));
        this.addSubscription(state.subscribe('isNetworkAvailable', () => this.updateNetwork()));
        this.addSubscription(state.subscribe('isRecording', (val: boolean) => this.updateRecStatus(val)));

        // Update aria-labels on locale change
        const onLocaleChanged = () => this.updateAriaLabels();
        eventBus.on('localeChanged', onLocaleChanged);
        this.addSubscription(() => eventBus.off('localeChanged', onLocaleChanged));
    }

    private updateAriaLabels(): void {
        if (!this.element) return;
        this.updatePillAriaLabel();
        this.netStatusIcon?.setAttribute('aria-label', i18n.t('topbar.aria.network'));
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
        const startTime = state.recordedPoints.length > 0 ? state.recordedPoints[0].timestamp : Date.now();
        
        const update = () => {
            if (!this.recTimer) return;
            const elapsed = Date.now() - startTime;
            const sec = Math.floor((elapsed / 1000) % 60);
            const min = Math.floor((elapsed / 60000) % 60);
            const hrs = Math.floor(elapsed / 3600000);
            
            const timeStr = hrs > 0 
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
            const country = state.ZOOM > 10 ? i18n.t('topbar.lod.swiss') : i18n.t('topbar.lod.world');
            this.lodBadge.textContent = i18n.t('topbar.lod.format', { country, level: Math.floor(zoom).toString() });
            this.updatePillAriaLabel();
        }
    }

    private updatePillAriaLabel(): void {
        const mainPill = this.element?.querySelector('#top-pill-main');
        if (!mainPill) return;
        const lod = this.lodBadge?.textContent ?? '';
        const temp = this.weatherTemp?.textContent ?? '';
        mainPill.setAttribute('aria-label', `${lod} ${temp}`.trim());
    }

    public override dispose(): void {
        this.stopTimer();
        super.dispose();
    }

    private updateWeather(weatherData: any): void {
        if (this.weatherIcon && this.weatherTemp) {
            if (weatherData) {
                let icon = '☀️';
                if (state.currentWeather === 'rain') icon = '🌧️';
                else if (state.currentWeather === 'snow') icon = '❄️';
                else if (weatherData.cloudCover > 50) icon = '☁️';
                
                this.weatherIcon.textContent = icon;
                this.weatherTemp.textContent = `${Math.round(weatherData.temp)}°C`;
            } else {
                this.weatherIcon.textContent = '☀️';
                this.weatherTemp.textContent = '--°C';
            }
            this.updatePillAriaLabel();
        }
    }

    private updateNetwork(): void {
        if (this.netStatusIcon) {
            const isOffline = state.IS_OFFLINE || !state.isNetworkAvailable;
            this.netStatusIcon.innerHTML = isOffline
                ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.7 12.3a2.5 2.5 0 0 1 3.6 3.6m-2.2-12.7a5 5 0 0 1 7.1 7.1m-1.8 4.2A5 5 0 0 1 3 10.5a5 5 0 0 1 4.5-4.9M1 1l22 22"/></svg>`
                : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`;
        }
    }
}
