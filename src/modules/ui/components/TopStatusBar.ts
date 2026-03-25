import { BaseComponent } from '../core/BaseComponent';
import { state } from '../../state';

import { sheetManager } from '../core/SheetManager';

export class TopStatusBar extends BaseComponent {
    private lodBadge: HTMLElement | null = null;
    private weatherIcon: HTMLElement | null = null;
    private weatherTemp: HTMLElement | null = null;
    private networkStatus: HTMLElement | null = null;
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
        this.networkStatus = this.element.querySelector('.network-status');
        this.recWidget = this.element.querySelector('.rec-indicator');
        this.recTimer = this.element.querySelector('.rec-timer');

        const weatherWidget = this.element.querySelector('.weather-widget');
        weatherWidget?.addEventListener('click', () => {
            sheetManager.toggle('weather');
        });

        const recWidget = this.element.querySelector('.rec-indicator');
        recWidget?.addEventListener('click', () => {
            sheetManager.toggle('track');
        });

        this.updateLOD(state.ZOOM);
        this.updateWeather(state.weatherData);
        this.updateNetwork(state.IS_OFFLINE);
        this.updateRecStatus(state.isRecording);

        this.addSubscription(state.subscribe('ZOOM', (val: number) => this.updateLOD(val)));
        this.addSubscription(state.subscribe('weatherData', (val: any) => this.updateWeather(val)));
        this.addSubscription(state.subscribe('IS_OFFLINE', (val: boolean) => this.updateNetwork(val)));
        this.addSubscription(state.subscribe('isRecording', (val: boolean) => this.updateRecStatus(val)));
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
            this.lodBadge.textContent = `LVL ${Math.floor(zoom)}`;
        }
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
        }
    }

    private updateNetwork(isOffline: boolean): void {
        if (this.networkStatus) {
            this.networkStatus.textContent = isOffline ? '📶 HORS-LIGNE' : '📶 NET';
            if (isOffline) {
                this.networkStatus.classList.add('offline');
            } else {
                this.networkStatus.classList.remove('offline');
            }
        }
    }
}
