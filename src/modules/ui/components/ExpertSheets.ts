import { BaseComponent } from '../core/BaseComponent';
import { state, saveSettings } from '../../state';
import { runSolarProbe, getAltitudeAt, type SolarAnalysisResult } from '../../analysis';
import { worldToLngLat } from '../../geo';
import { showToast } from '../../utils';
import { getWeatherIcon } from '../../weather';
import { sheetManager } from '../core/SheetManager';

export class WeatherSheet extends BaseComponent {
    private contentEl: HTMLElement | null = null;
    private expertPanel: HTMLElement | null = null;

    constructor() {
        super('template-weather', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        this.contentEl = document.getElementById('weather-content');
        // ARIA: weather content is a live region
        this.contentEl?.setAttribute('aria-live', 'polite');
        
        // Create expert panel dynamically
        this.expertPanel = document.createElement('div');
        this.expertPanel.id = 'expert-weather-panel';
        this.expertPanel.style.display = 'none';
        this.expertPanel.classList.add('exp-expert-panel');
        this.element.appendChild(this.expertPanel);

        const closeWeather = document.getElementById('close-weather');
        closeWeather?.setAttribute('aria-label', 'Fermer météo');
        closeWeather?.addEventListener('click', () => {
            sheetManager.close();
        });

        const openExpert = document.getElementById('open-expert-weather');
        openExpert?.setAttribute('aria-label', 'Données météo avancées');
        openExpert?.addEventListener('click', () => {
            if (this.expertPanel) {
                this.expertPanel.style.display = this.expertPanel.style.display === 'none' ? 'block' : 'none';
            }
        });

        // Simulation Météo Manuelle
        this.element.querySelectorAll('.weather-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.currentWeather = (btn as HTMLElement).dataset.weather as any;
                state.WEATHER_DENSITY = (state.currentWeather === 'clear') ? 0 : 5000;
            });
        });

        // Sliders
        this.bindSlider('weather-density-slider', 'WEATHER_DENSITY', 'weather-density-disp');
        this.bindSlider('weather-speed-slider', 'WEATHER_SPEED', 'weather-speed-disp');

        // Subscribe to weather data
        this.addSubscription(state.subscribe('weatherData', () => this.updateUI()));
        this.addSubscription(state.subscribe('WEATHER_DENSITY', (val: number) => this.updateSlider('weather-density-slider', 'weather-density-disp', val)));
        this.addSubscription(state.subscribe('WEATHER_SPEED', (val: number) => this.updateSlider('weather-speed-slider', 'weather-speed-disp', val)));
        
        // Initial update
        this.updateUI();
        this.updateSlider('weather-density-slider', 'weather-density-disp', state.WEATHER_DENSITY);
        this.updateSlider('weather-speed-slider', 'weather-speed-disp', state.WEATHER_SPEED);
    }

    private bindSlider(id: string, stateKey: keyof typeof state, dispId: string, onChange?: () => void) {
        if (!this.element) return;
        const slider = document.getElementById(id) as HTMLInputElement;
        const disp = document.getElementById(dispId);
        if (slider) {
            // ARIA: slider attributes
            slider.setAttribute('aria-label', stateKey);
            slider.setAttribute('aria-valuemin', slider.min);
            slider.setAttribute('aria-valuemax', slider.max);
            slider.setAttribute('aria-valuenow', slider.value);

            slider.addEventListener('input', () => {
                (state as any)[stateKey] = parseFloat(slider.value);
                if (disp) disp.textContent = slider.value;
                // ARIA: sync valuenow
                slider.setAttribute('aria-valuenow', slider.value);
            });
            slider.addEventListener('change', () => {
                saveSettings();
                if (onChange) onChange();
            });
        }
    }

    private updateSlider(id: string, dispId: string, value: number) {
        if (!this.element) return;
        const slider = document.getElementById(id) as HTMLInputElement;
        const disp = document.getElementById(dispId);
        if (slider) {
            slider.value = value.toString();
            // ARIA: sync valuenow
            slider.setAttribute('aria-valuenow', value.toString());
        }
        if (disp) disp.textContent = value.toString();
    }

    private updateUI() {
        const wd = state.weatherData;
        if (!wd || !this.contentEl || !this.expertPanel) return;

        // Clear existing content
        this.contentEl.textContent = '';
        this.expertPanel.textContent = '';

        // Basic Info
        const basicGrid = document.createElement('div');
        basicGrid.classList.add('exp-stat-grid', 'exp-stat-grid-mb');

        const addStat = (parent: HTMLElement, label: string, value: string) => {
            const div = document.createElement('div');
            div.classList.add('exp-stat-card');
            
            const lbl = document.createElement('div');
            lbl.classList.add('exp-stat-label');
            lbl.textContent = label;
            
            const val = document.createElement('div');
            val.classList.add('exp-stat-value');
            val.textContent = value;
            
            div.appendChild(lbl);
            div.appendChild(val);
            parent.appendChild(div);
        };

        addStat(basicGrid, 'Température', `${Math.round(wd.temp)}°C`);
        addStat(basicGrid, 'Ressenti', `${Math.round(wd.apparentTemp)}°C`);
        addStat(basicGrid, 'Vent', `${Math.round(wd.windSpeed)} km/h`);
        addStat(basicGrid, 'Humidité', `${wd.humidity}%`);

        this.contentEl.appendChild(basicGrid);

        // Hourly
        if (wd.hourly) {
            const hourlyContainer = document.createElement('div');
            hourlyContainer.classList.add('exp-hourly-scroll');

            wd.hourly.forEach(h => {
                const hDiv = document.createElement('div');
                hDiv.classList.add('exp-hourly-item');

                const timeDiv = document.createElement('div');
                timeDiv.classList.add('exp-hourly-time');
                timeDiv.textContent = h.time;

                const iconDiv = document.createElement('div');
                iconDiv.classList.add('exp-hourly-icon');
                iconDiv.textContent = getWeatherIcon(h.code);

                const tempDiv = document.createElement('div');
                tempDiv.classList.add('exp-hourly-temp');
                tempDiv.textContent = `${Math.round(h.temp)}°`;

                hDiv.appendChild(timeDiv);
                hDiv.appendChild(iconDiv);
                hDiv.appendChild(tempDiv);
                hourlyContainer.appendChild(hDiv);
            });
            this.contentEl.appendChild(hourlyContainer);
        }

        // Expert Panel
        const expertTitle = document.createElement('h4');
        expertTitle.classList.add('exp-expert-title');
        expertTitle.textContent = 'Données Avancées';
        this.expertPanel.appendChild(expertTitle);

        const expertGrid = document.createElement('div');
        expertGrid.classList.add('exp-stat-grid');

        addStat(expertGrid, 'Lieu', wd.locationName || 'Inconnu');
        addStat(expertGrid, 'Rafales', `${Math.round(wd.windGusts || 0)} km/h`);
        addStat(expertGrid, 'Visibilité', `${Math.round(wd.visibility || 0)} km`);
        addStat(expertGrid, 'Précipitations', `${Math.round(wd.precProb || 0)}%`);
        addStat(expertGrid, 'Point de rosée', `${Math.round(wd.dewPoint || 0)}°C`);
        addStat(expertGrid, 'Isotherme 0°', `${Math.round(wd.freezingLevel || 0)} m`);

        this.expertPanel.appendChild(expertGrid);

        // Chart
        if (wd.hourly) {
            const chartContainer = document.createElement('div');
            chartContainer.classList.add('exp-chart');

            const temps = wd.hourly.map(h => h.temp);
            const min = Math.min(...temps);
            const max = Math.max(...temps);
            const range = max - min || 1;

            wd.hourly.forEach((h, i) => {
                const hPerc = ((h.temp - min) / range) * 70 + 10;
                const bar = document.createElement('div');
                bar.classList.add('exp-chart-bar');
                bar.style.height = `${hPerc}%`;
                bar.style.opacity = `${0.3 + (i/24)*0.7}`;
                bar.title = `${h.time}: ${h.temp}°C`;

                const lbl = document.createElement('div');
                lbl.classList.add('exp-chart-label');
                lbl.textContent = `${Math.round(h.temp)}°`;

                bar.appendChild(lbl);
                chartContainer.appendChild(bar);
            });
            this.expertPanel.appendChild(chartContainer);
        }
    }
}

export class SolarProbeSheet extends BaseComponent {
    private contentEl: HTMLElement | null = null;

    constructor() {
        super('template-solar-probe', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        this.contentEl = document.getElementById('probe-content');
        // ARIA: solar results are a live region
        this.contentEl?.setAttribute('aria-live', 'polite');

        const closeProbe = document.getElementById('close-probe');
        closeProbe?.setAttribute('aria-label', 'Fermer analyse solaire');
        closeProbe?.addEventListener('click', () => {
            sheetManager.close();
        });

        // Attach to the probe button which is in the WidgetsComponent (coords-panel)
        const attachProbeBtn = () => {
            const probeBtn = document.getElementById('probe-btn');
            if (probeBtn) {
                probeBtn.onclick = () => {
                    if (state.hasLastClicked) {
                        const result = runSolarProbe(state.lastClickedCoords.x, state.lastClickedCoords.z, state.lastClickedCoords.alt);
                        if (result) {
                            this.updateUI(result);
                            sheetManager.open('solar-probe');
                        }
                    } else {
                        showToast("Cliquez sur le terrain d'abord");
                    }
                };
            } else {
                // If not yet in DOM, retry shortly
                setTimeout(attachProbeBtn, 500);
            }
        };
        attachProbeBtn();
    }

    private updateUI(result: SolarAnalysisResult) {
        if (!this.contentEl) return;

        this.contentEl.textContent = '';

        const totalStr = `${Math.floor(result.totalSunlightMinutes / 60)}h ${result.totalSunlightMinutes % 60}m`;
        const sunriseStr = result.firstSunTime ? result.firstSunTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—:—";

        // Status
        const statusEl = document.createElement('div');
        statusEl.classList.add('exp-probe-status');
        statusEl.textContent = 'Analyse terminée';
        this.contentEl.appendChild(statusEl);

        // Stats Grid
        const statsGrid = document.createElement('div');
        statsGrid.classList.add('exp-stat-grid', 'exp-probe-grid-mb');

        const addStat = (label: string, value: string) => {
            const div = document.createElement('div');
            div.classList.add('exp-probe-card');
            
            const lbl = document.createElement('div');
            lbl.classList.add('exp-probe-label');
            lbl.textContent = label;
            
            const val = document.createElement('div');
            val.classList.add('exp-probe-value');
            val.textContent = value;
            
            div.appendChild(lbl);
            div.appendChild(val);
            statsGrid.appendChild(div);
        };

        addStat('Ensoleillement', totalStr);
        addStat('Premier rayon', sunriseStr);
        this.contentEl.appendChild(statsGrid);

        // Timeline
        const timelineTitle = document.createElement('div');
        timelineTitle.classList.add('exp-timeline-title');
        timelineTitle.textContent = 'Évolution sur 24h';
        this.contentEl.appendChild(timelineTitle);

        const timelineContainer = document.createElement('div');
        timelineContainer.classList.add('exp-timeline');

        result.timeline.forEach((t: any) => {
            const bar = document.createElement('div');
            bar.classList.add('exp-timeline-bar');
            
            if (t.isNight) {
                bar.style.background = '#000';
            } else if (t.inShadow) {
                bar.style.background = '#444';
            } else {
                bar.style.background = '#ffd700';
            }
            
            timelineContainer.appendChild(bar);
        });
        this.contentEl.appendChild(timelineContainer);

        // Copy Button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn-go';
        copyBtn.setAttribute('aria-label', 'Copier le rapport solaire');
        copyBtn.textContent = '📋 Copier le rapport';
        copyBtn.onclick = () => {
            const report = `SunTrail Solar Report\nLocation: ${result.gps.lat.toFixed(5)}, ${result.gps.lon.toFixed(5)}\nSunlight: ${totalStr}\nSunrise: ${sunriseStr}`;
            navigator.clipboard.writeText(report);
            showToast("📋 Rapport copié");
        };
        this.contentEl.appendChild(copyBtn);
    }
}

export class SOSSheet extends BaseComponent {
    constructor() {
        super('template-sos', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        const sosCopyBtn = document.getElementById('sos-copy-btn');
        sosCopyBtn?.setAttribute('aria-label', 'Copier le message SOS');
        sosCopyBtn?.addEventListener('click', () => {
            const txt = document.getElementById('sos-text-container')?.textContent;
            if (txt) { 
                navigator.clipboard.writeText(txt); 
                showToast("🆘 Message copié"); 
            }
        });

        const sosCloseBtn = document.getElementById('sos-close-btn');
        sosCloseBtn?.setAttribute('aria-label', 'Fermer SOS');
        sosCloseBtn?.addEventListener('click', () => { 
            sheetManager.close();
        });

        // ARIA: SOS text container is a live region
        const sosTextContainer = document.getElementById('sos-text-container');
        sosTextContainer?.setAttribute('aria-live', 'polite');

        // Attach to the SOS button which is in the WidgetsComponent (coords-pill)
        const attachSosBtn = () => {
            const sosBtn = document.getElementById('sos-btn-pill');
            if (sosBtn) {
                sosBtn.setAttribute('aria-label', 'Appel SOS urgence');
                sosBtn.onclick = this.openSOSModal.bind(this);
            } else {
                // If not yet in DOM, retry shortly
                setTimeout(attachSosBtn, 500);
            }
        };
        attachSosBtn();
    }

    private async openSOSModal() {
        if (!this.element) return;
        
        const textContainer = document.getElementById('sos-text-container');
        if (!textContainer) return;

        sheetManager.open('sos');
        textContainer.textContent = "⌛ Localisation en cours...";
        
        let lat: number, lon: number, alt: number;
        
        if (state.userLocation) { 
            lat = state.userLocation.lat; 
            lon = state.userLocation.lon; 
            alt = state.userLocation.alt; 
        } else { 
            const gps = worldToLngLat(state.controls?.target.x || 0, state.controls?.target.z || 0, state.originTile); 
            lat = gps.lat; 
            lon = gps.lon; 
            alt = getAltitudeAt(state.controls?.target.x || 0, state.controls?.target.z || 0) / state.RELIEF_EXAGGERATION; 
        }
        
        let bat = "??"; 
        try { 
            const battery = await (navigator as any).getBattery(); 
            bat = Math.round(battery.level * 100).toString(); 
        } catch(e) {}
        
        const now = new Date(); 
        const time = `${now.getHours()}h${now.getMinutes().toString().padStart(2, '0')}`;
        
        textContainer.textContent = `🆘 SOS SUNTRAIL: ${lat.toFixed(5)},${lon.toFixed(5)} | ALT:${Math.round(alt)}m | BAT:${bat}% | ${time}`;
    }
}
