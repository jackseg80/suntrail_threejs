import { BaseComponent } from '../core/BaseComponent';
import { state } from '../../state';

import { sheetManager } from '../core/SheetManager';

export class TopStatusBar extends BaseComponent {
    private lodBadge: HTMLElement | null = null;
    private weatherIcon: HTMLElement | null = null;
    private weatherTemp: HTMLElement | null = null;
    private networkStatus: HTMLElement | null = null;

    constructor() {
        super('template-top-status-bar', 'top-status-bar');
    }

    public render(): void {
        if (!this.element) return;

        this.lodBadge = this.element.querySelector('.lod-badge');
        this.weatherIcon = this.element.querySelector('.weather-icon');
        this.weatherTemp = this.element.querySelector('.weather-temp');
        this.networkStatus = this.element.querySelector('.network-status');

        const weatherWidget = this.element.querySelector('.weather-widget');
        weatherWidget?.addEventListener('click', () => {
            sheetManager.toggle('weather');
        });

        this.updateLOD(state.ZOOM);
        this.updateWeather(state.weatherData);
        this.updateNetwork(state.IS_OFFLINE);

        this.addSubscription(state.subscribe('ZOOM', (val: number) => this.updateLOD(val)));
        this.addSubscription(state.subscribe('weatherData', (val: any) => this.updateWeather(val)));
        this.addSubscription(state.subscribe('IS_OFFLINE', (val: boolean) => this.updateNetwork(val)));
    }

    private updateLOD(zoom: number): void {
        if (this.lodBadge) {
            this.lodBadge.textContent = `LVL ${Math.floor(zoom)}`;
        }
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
