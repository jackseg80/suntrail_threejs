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
        
        // Create expert panel dynamically
        this.expertPanel = document.createElement('div');
        this.expertPanel.id = 'expert-weather-panel';
        this.expertPanel.style.display = 'none';
        this.expertPanel.style.marginTop = '15px';
        this.expertPanel.style.padding = '15px';
        this.expertPanel.style.background = 'rgba(255,255,255,0.05)';
        this.expertPanel.style.borderRadius = '12px';
        this.element.appendChild(this.expertPanel);

        const closeWeather = document.getElementById('close-weather');
        closeWeather?.addEventListener('click', () => {
            sheetManager.close();
        });

        const openExpert = document.getElementById('open-expert-weather');
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
            slider.addEventListener('input', () => {
                (state as any)[stateKey] = parseFloat(slider.value);
                if (disp) disp.textContent = slider.value;
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
        if (slider) slider.value = value.toString();
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
        basicGrid.style.display = 'grid';
        basicGrid.style.gridTemplateColumns = '1fr 1fr';
        basicGrid.style.gap = '10px';
        basicGrid.style.marginBottom = '15px';

        const addStat = (parent: HTMLElement, label: string, value: string) => {
            const div = document.createElement('div');
            div.style.background = 'rgba(255,255,255,0.03)';
            div.style.padding = '10px';
            div.style.borderRadius = '8px';
            
            const lbl = document.createElement('div');
            lbl.style.fontSize = '11px';
            lbl.style.color = 'var(--t2)';
            lbl.textContent = label;
            
            const val = document.createElement('div');
            val.style.fontSize = '16px';
            val.style.fontWeight = 'bold';
            val.style.marginTop = '4px';
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
            hourlyContainer.style.display = 'flex';
            hourlyContainer.style.overflowX = 'auto';
            hourlyContainer.style.gap = '10px';
            hourlyContainer.style.paddingBottom = '10px';

            wd.hourly.forEach(h => {
                const hDiv = document.createElement('div');
                hDiv.style.minWidth = '50px';
                hDiv.style.textAlign = 'center';

                const timeDiv = document.createElement('div');
                timeDiv.style.fontSize = '9px';
                timeDiv.style.color = 'var(--t2)';
                timeDiv.textContent = h.time;

                const iconDiv = document.createElement('div');
                iconDiv.style.fontSize = '14px';
                iconDiv.style.margin = '5px 0';
                iconDiv.textContent = getWeatherIcon(h.code);

                const tempDiv = document.createElement('div');
                tempDiv.style.fontSize = '11px';
                tempDiv.style.fontWeight = '700';
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
        expertTitle.style.margin = '0 0 10px 0';
        expertTitle.style.color = 'var(--gold)';
        expertTitle.textContent = 'Données Avancées';
        this.expertPanel.appendChild(expertTitle);

        const expertGrid = document.createElement('div');
        expertGrid.style.display = 'grid';
        expertGrid.style.gridTemplateColumns = '1fr 1fr';
        expertGrid.style.gap = '10px';

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
            chartContainer.style.display = 'flex';
            chartContainer.style.alignItems = 'flex-end';
            chartContainer.style.height = '60px';
            chartContainer.style.marginTop = '20px';
            chartContainer.style.gap = '2px';

            const temps = wd.hourly.map(h => h.temp);
            const min = Math.min(...temps);
            const max = Math.max(...temps);
            const range = max - min || 1;

            wd.hourly.forEach((h, i) => {
                const hPerc = ((h.temp - min) / range) * 70 + 10;
                const bar = document.createElement('div');
                bar.style.flex = '1';
                bar.style.height = `${hPerc}%`;
                bar.style.background = 'var(--accent)';
                bar.style.opacity = `${0.3 + (i/24)*0.7}`;
                bar.style.borderRadius = '4px 4px 0 0';
                bar.style.position = 'relative';
                bar.title = `${h.time}: ${h.temp}°C`;

                const lbl = document.createElement('div');
                lbl.style.position = 'absolute';
                lbl.style.top = '-15px';
                lbl.style.width = '100%';
                lbl.style.textAlign = 'center';
                lbl.style.fontSize = '8px';
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

        const closeProbe = document.getElementById('close-probe');
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
        statusEl.style.marginBottom = '15px';
        statusEl.style.color = 'var(--t2)';
        statusEl.style.fontSize = '13px';
        statusEl.textContent = 'Analyse terminée';
        this.contentEl.appendChild(statusEl);

        // Stats Grid
        const statsGrid = document.createElement('div');
        statsGrid.style.display = 'grid';
        statsGrid.style.gridTemplateColumns = '1fr 1fr';
        statsGrid.style.gap = '10px';
        statsGrid.style.marginBottom = '20px';

        const addStat = (label: string, value: string) => {
            const div = document.createElement('div');
            div.style.background = 'rgba(255,255,255,0.03)';
            div.style.padding = '15px';
            div.style.borderRadius = '12px';
            
            const lbl = document.createElement('div');
            lbl.style.fontSize = '11px';
            lbl.style.color = 'var(--t2)';
            lbl.style.textTransform = 'uppercase';
            lbl.style.letterSpacing = '1px';
            lbl.textContent = label;
            
            const val = document.createElement('div');
            val.style.fontSize = '20px';
            val.style.fontWeight = 'bold';
            val.style.marginTop = '5px';
            val.style.color = 'var(--gold)';
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
        timelineTitle.style.fontSize = '11px';
        timelineTitle.style.color = 'var(--t2)';
        timelineTitle.style.textTransform = 'uppercase';
        timelineTitle.style.letterSpacing = '1px';
        timelineTitle.style.marginBottom = '10px';
        timelineTitle.textContent = 'Évolution sur 24h';
        this.contentEl.appendChild(timelineTitle);

        const timelineContainer = document.createElement('div');
        timelineContainer.style.display = 'flex';
        timelineContainer.style.height = '30px';
        timelineContainer.style.borderRadius = '6px';
        timelineContainer.style.overflow = 'hidden';
        timelineContainer.style.marginBottom = '20px';

        result.timeline.forEach((t: any) => {
            const bar = document.createElement('div');
            bar.style.flex = '1';
            bar.style.height = '100%';
            
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
        copyBtn.style.width = '100%';
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
        sosCopyBtn?.addEventListener('click', () => {
            const txt = document.getElementById('sos-text-container')?.textContent;
            if (txt) { 
                navigator.clipboard.writeText(txt); 
                showToast("🆘 Message copié"); 
            }
        });

        const sosCloseBtn = document.getElementById('sos-close-btn');
        sosCloseBtn?.addEventListener('click', () => { 
            sheetManager.close();
        });

        // Attach to the SOS button which is in the WidgetsComponent (coords-panel)
        const attachSosBtn = () => {
            const sosBtn = document.getElementById('sos-btn');
            if (sosBtn) {
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
