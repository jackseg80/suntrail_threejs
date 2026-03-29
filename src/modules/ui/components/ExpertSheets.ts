import { BaseComponent } from '../core/BaseComponent';
import { state, saveSettings } from '../../state';
import { runSolarProbe, getAltitudeAt, type SolarAnalysisResult } from '../../analysis';
import { worldToLngLat } from '../../geo';
import { showToast } from '../../utils';
import { getWeatherIcon } from '../../weather';
import { sheetManager } from '../core/SheetManager';
import { i18n } from '../../../i18n/I18nService';
import { showUpgradePrompt } from '../../iap';
import SunCalc from 'suncalc';

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
        closeWeather?.setAttribute('aria-label', i18n.t('weather.aria.close') || 'Fermer météo');
        closeWeather?.addEventListener('click', () => {
            sheetManager.close();
        });

        const openExpert = document.getElementById('open-expert-weather');
        openExpert?.setAttribute('aria-label', i18n.t('weather.btn.expert'));
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

        addStat(basicGrid, i18n.t('weather.temp'), `${Math.round(wd.temp)}°C`);
        addStat(basicGrid, i18n.t('weather.feelsLike'), `${Math.round(wd.apparentTemp)}°C`);
        addStat(basicGrid, i18n.t('weather.wind'), `${Math.round(wd.windSpeed)} km/h`);
        addStat(basicGrid, i18n.t('weather.humidity'), `${wd.humidity}%`);

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
        expertTitle.textContent = i18n.t('weather.expert.title');
        this.expertPanel.appendChild(expertTitle);

        const expertGrid = document.createElement('div');
        expertGrid.classList.add('exp-stat-grid');

        addStat(expertGrid, i18n.t('weather.location'), wd.locationName || i18n.t('weather.unknown'));
        addStat(expertGrid, i18n.t('weather.gusts'), `${Math.round(wd.windGusts || 0)} km/h`);
        addStat(expertGrid, i18n.t('weather.visibility'), `${Math.round(wd.visibility || 0)} km`);
        addStat(expertGrid, i18n.t('weather.precipitation'), `${Math.round(wd.precProb || 0)}%`);
        addStat(expertGrid, i18n.t('weather.dewPoint'), `${Math.round(wd.dewPoint || 0)}°C`);
        addStat(expertGrid, i18n.t('weather.freezingLevel'), `${Math.round(wd.freezingLevel || 0)} m`);

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
    private currentResult: SolarAnalysisResult | null = null;
    // Elements updated in real-time
    private realtimeAzimuthEl: HTMLElement | null = null;
    private realtimeElevationEl: HTMLElement | null = null;
    private realtimeCompassEl: SVGPathElement | null = null;
    private realtimeElevBarEl: HTMLElement | null = null;
    private svgCurrentLineEl: SVGLineElement | null = null;

    constructor() {
        super('template-solar-probe', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        this.contentEl = document.getElementById('probe-content');
        this.contentEl?.setAttribute('aria-live', 'polite');

        const closeProbe = document.getElementById('close-probe');
        closeProbe?.setAttribute('aria-label', i18n.t('solar.aria.close'));
        closeProbe?.addEventListener('click', () => {
            sheetManager.close();
        });

        // Subscribe to simDate for real-time updates
        this.addSubscription(state.subscribe('simDate', () => {
            if (this.currentResult) this.updateRealtimeElements();
        }));

        // Re-render when Pro status changes
        this.addSubscription(state.subscribe('isPro', () => {
            if (this.currentResult) this.updateUI(this.currentResult);
        }));

        const attachProbeBtn = () => {
            const probeBtn = document.getElementById('probe-btn');
            if (probeBtn) {
                probeBtn.onclick = () => {
                    if (state.hasLastClicked) {
                        const result = runSolarProbe(state.lastClickedCoords.x, state.lastClickedCoords.z, state.lastClickedCoords.alt);
                        if (result) {
                            this.currentResult = result;
                            this.updateUI(result);
                            sheetManager.open('solar-probe');
                        }
                    } else {
                        showToast(i18n.t('solar.toast.clickFirst'));
                    }
                };
            } else {
                setTimeout(attachProbeBtn, 500);
            }
        };
        attachProbeBtn();
    }

    private fmtTime(d: Date | null): string {
        if (!d) return '—:—';
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    private fmtDuration(minutes: number): string {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h}h ${m.toString().padStart(2, '0')}m`;
    }

    private moonEmoji(name: string): string {
        const map: Record<string, string> = {
            new: '🌑', waxing_crescent: '🌒', first_quarter: '🌓',
            waxing_gibbous: '🌔', full: '🌕', waning_gibbous: '🌖',
            last_quarter: '🌗', waning_crescent: '🌘',
        };
        return map[name] ?? '🌙';
    }

    private updateUI(result: SolarAnalysisResult) {
        if (!this.contentEl) return;
        this.contentEl.textContent = '';
        // Reset real-time refs
        this.realtimeAzimuthEl = null;
        this.realtimeElevationEl = null;
        this.realtimeCompassEl = null;
        this.realtimeElevBarEl = null;
        this.svgCurrentLineEl = null;

        const addStat = (parent: HTMLElement, label: string, value: string) => {
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
            parent.appendChild(div);
            return val;
        };

        // ── Status ───────────────────────────────────────────────────────────
        const statusEl = document.createElement('div');
        statusEl.classList.add('exp-probe-status');
        statusEl.textContent = i18n.t('solar.status.done');
        this.contentEl.appendChild(statusEl);

        if (!state.isPro) {
            // ── FREE version ──────────────────────────────────────────────────
            const grid = document.createElement('div');
            grid.classList.add('exp-stat-grid', 'exp-probe-grid-mb');
            addStat(grid, i18n.t('solar.stat.sunlight'), this.fmtDuration(result.totalSunlightMinutes));
            addStat(grid, i18n.t('solar.stat.firstRay'), this.fmtTime(result.firstSunTime));
            this.contentEl.appendChild(grid);

            this.buildTimeline(this.contentEl, result);

            // Upsell banner
            const upsell = document.createElement('div');
            upsell.classList.add('solar-upsell-banner');
            upsell.innerHTML = `<span>${i18n.t('solar.upsell.solar')}</span>`;
            const upsellBtn = document.createElement('button');
            upsellBtn.className = 'btn-go solar-upsell-btn';
            upsellBtn.textContent = 'Pro ↗';
            upsellBtn.onclick = () => showUpgradePrompt('solar_full');
            upsell.appendChild(upsellBtn);
            this.contentEl.appendChild(upsell);

        } else {
            // ── PRO version ───────────────────────────────────────────────────

            // Bloc 1 — Données du jour
            const sectionTitle1 = document.createElement('div');
            sectionTitle1.classList.add('exp-probe-section-title');
            sectionTitle1.textContent = i18n.t('solar.section.dayData');
            this.contentEl.appendChild(sectionTitle1);

            const grid1 = document.createElement('div');
            grid1.classList.add('exp-stat-grid', 'exp-probe-grid-mb', 'exp-stat-grid-3');
            addStat(grid1, i18n.t('solar.stat.sunrise'), this.fmtTime(result.sunrise));
            addStat(grid1, i18n.t('solar.stat.noon'), this.fmtTime(result.solarNoon));
            addStat(grid1, i18n.t('solar.stat.sunset'), this.fmtTime(result.sunset));
            addStat(grid1, i18n.t('solar.stat.goldenMorning'),
                `${this.fmtTime(result.goldenHourMorningStart)} → ${this.fmtTime(result.goldenHourMorningEnd)}`);
            addStat(grid1, i18n.t('solar.stat.goldenEvening'),
                `${this.fmtTime(result.goldenHourEveningStart)} → ${this.fmtTime(result.goldenHourEveningEnd)}`);
            addStat(grid1, i18n.t('solar.stat.dayDuration'), this.fmtDuration(result.dayDurationMinutes));
            addStat(grid1, i18n.t('solar.stat.sunlight'), this.fmtDuration(result.totalSunlightMinutes));
            this.contentEl.appendChild(grid1);

            // Bloc 2 — Temps réel
            const sectionTitle2 = document.createElement('div');
            sectionTitle2.classList.add('exp-probe-section-title');
            sectionTitle2.textContent = i18n.t('solar.section.realtime');
            this.contentEl.appendChild(sectionTitle2);

            const rtContainer = document.createElement('div');
            rtContainer.classList.add('solar-realtime-block');

            // Azimuth with compass
            const azRow = document.createElement('div');
            azRow.classList.add('solar-realtime-row');
            const azLabel = document.createElement('span');
            azLabel.classList.add('exp-probe-label');
            azLabel.textContent = i18n.t('solar.stat.azimuth');
            const azValue = document.createElement('span');
            azValue.classList.add('exp-probe-value', 'solar-rt-value');
            this.realtimeAzimuthEl = azValue;

            // Inline SVG compass arrow
            const compassSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            compassSvg.setAttribute('viewBox', '0 0 24 24');
            compassSvg.setAttribute('width', '20');
            compassSvg.setAttribute('height', '20');
            compassSvg.classList.add('solar-compass-svg');
            const compassArrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            compassArrow.setAttribute('fill', '#FFD700');
            compassArrow.setAttribute('d', 'M12 2 L14 20 L12 17 L10 20 Z');
            this.realtimeCompassEl = compassArrow;
            compassSvg.appendChild(compassArrow);

            azRow.appendChild(azLabel);
            azRow.appendChild(azValue);
            azRow.appendChild(compassSvg);
            rtContainer.appendChild(azRow);

            // Elevation with progress bar
            const elevRow = document.createElement('div');
            elevRow.classList.add('solar-realtime-row');
            const elevLabel = document.createElement('span');
            elevLabel.classList.add('exp-probe-label');
            elevLabel.textContent = i18n.t('solar.stat.elevation');
            const elevValue = document.createElement('span');
            elevValue.classList.add('exp-probe-value', 'solar-rt-value');
            this.realtimeElevationEl = elevValue;
            const elevBarWrap = document.createElement('div');
            elevBarWrap.classList.add('solar-elev-bar-wrap');
            const elevBar = document.createElement('div');
            elevBar.classList.add('solar-elev-bar');
            this.realtimeElevBarEl = elevBar;
            elevBarWrap.appendChild(elevBar);
            elevRow.appendChild(elevLabel);
            elevRow.appendChild(elevValue);
            elevRow.appendChild(elevBarWrap);
            rtContainer.appendChild(elevRow);

            // Moon phase
            const moonRow = document.createElement('div');
            moonRow.classList.add('solar-realtime-row');
            const moonLabel = document.createElement('span');
            moonLabel.classList.add('exp-probe-label');
            moonLabel.textContent = i18n.t('solar.stat.moonPhase');
            const moonValue = document.createElement('span');
            moonValue.classList.add('exp-probe-value', 'solar-rt-value');
            moonValue.textContent = `${this.moonEmoji(result.moonPhaseName)} ${Math.round(result.moonPhase * 100)}%`;
            moonRow.appendChild(moonLabel);
            moonRow.appendChild(moonValue);
            rtContainer.appendChild(moonRow);

            this.contentEl.appendChild(rtContainer);

            // Bloc 3 — Graphique d'élévation 24h
            const sectionTitle3 = document.createElement('div');
            sectionTitle3.classList.add('exp-probe-section-title');
            sectionTitle3.textContent = i18n.t('solar.stat.elevationChart');
            this.contentEl.appendChild(sectionTitle3);

            this.contentEl.appendChild(this.buildElevationChart(result));

            // Bloc 4 — Timeline
            this.buildTimeline(this.contentEl, result);

            // Bloc 5 — Rapport exportable
            const copyBtn = document.createElement('button');
            copyBtn.className = 'btn-go';
            copyBtn.setAttribute('aria-label', i18n.t('solar.btn.copy'));
            copyBtn.textContent = i18n.t('solar.btn.copy');
            copyBtn.onclick = () => this.copyReport(result);
            this.contentEl.appendChild(copyBtn);

            // Init real-time display
            this.updateRealtimeElements();
        }
    }

    private buildTimeline(parent: HTMLElement, result: SolarAnalysisResult): void {
        const timelineTitle = document.createElement('div');
        timelineTitle.classList.add('exp-timeline-title');
        timelineTitle.textContent = i18n.t('solar.stat.evolution');
        parent.appendChild(timelineTitle);

        const timelineContainer = document.createElement('div');
        timelineContainer.classList.add('exp-timeline');
        result.timeline.forEach((t) => {
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
        parent.appendChild(timelineContainer);
    }

    private buildElevationChart(result: SolarAnalysisResult): SVGSVGElement {
        const W = 288;
        const H = 80;
        const PADDING_BOTTOM = 14; // space for hour labels
        const CHART_H = H - PADDING_BOTTOM;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.classList.add('solar-elevation-chart');

        // Background — night base
        const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bgRect.setAttribute('x', '0'); bgRect.setAttribute('y', '0');
        bgRect.setAttribute('width', String(W)); bgRect.setAttribute('height', String(CHART_H));
        bgRect.setAttribute('fill', '#0a0a1a');
        svg.appendChild(bgRect);

        // Colored zones: day vs twilight based on elevation
        const curve = result.elevationCurve; // 144 pts
        const xStep = W / 144;
        // Draw daytime fill (elevation > 0) as sky blue
        // Draw twilight band (elevation -6..0) as gradient orange-ish
        // We'll do a simple approach: sky blue above 0°, dark below
        const yForElev = (elev: number) => {
            // Map -90..90 → CHART_H..0
            return CHART_H - ((elev + 90) / 180) * CHART_H;
        };
        const horizonY = yForElev(0);

        // Day zone background fill (above horizon)
        const dayRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        dayRect.setAttribute('x', '0'); dayRect.setAttribute('y', '0');
        dayRect.setAttribute('width', String(W)); dayRect.setAttribute('height', String(horizonY));
        dayRect.setAttribute('fill', '#87ceeb');
        dayRect.setAttribute('opacity', '0.25');
        svg.appendChild(dayRect);

        // Shadow segments (inShadow bars) — one per 30min = 2 pts on chart (2/144 = 1 bar = 4px wide)
        result.timeline.forEach((t, i) => {
            if (!t.isNight && t.inShadow) {
                const x = (i / 48) * W;
                const barW = W / 48;
                const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                r.setAttribute('x', String(x));
                r.setAttribute('y', '0');
                r.setAttribute('width', String(barW));
                r.setAttribute('height', String(CHART_H));
                r.setAttribute('fill', 'rgba(255,80,80,0.18)');
                svg.appendChild(r);
            }
        });

        // Elevation curve path
        let d = '';
        curve.forEach((elev, i) => {
            const x = i * xStep;
            const y = yForElev(elev);
            d += i === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : ` L${x.toFixed(1)},${y.toFixed(1)}`;
        });
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('stroke', '#FFD700');
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('fill', 'none');
        svg.appendChild(path);

        // Horizon line
        const horizLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        horizLine.setAttribute('x1', '0'); horizLine.setAttribute('x2', String(W));
        horizLine.setAttribute('y1', String(horizonY)); horizLine.setAttribute('y2', String(horizonY));
        horizLine.setAttribute('stroke', 'rgba(255,255,255,0.2)');
        horizLine.setAttribute('stroke-width', '0.5');
        svg.appendChild(horizLine);

        // Current time vertical line
        const currentMins = state.simDate.getHours() * 60 + state.simDate.getMinutes();
        const currentX = (currentMins / 1440) * W;
        const currentLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        currentLine.setAttribute('x1', String(currentX)); currentLine.setAttribute('x2', String(currentX));
        currentLine.setAttribute('y1', '0'); currentLine.setAttribute('y2', String(CHART_H));
        currentLine.setAttribute('stroke', 'rgba(255,255,255,0.7)');
        currentLine.setAttribute('stroke-width', '1');
        currentLine.setAttribute('stroke-dasharray', '2,2');
        this.svgCurrentLineEl = currentLine as unknown as SVGLineElement;
        svg.appendChild(currentLine);

        // Hour labels
        [0, 6, 12, 18, 24].forEach((h) => {
            const x = (h / 24) * W;
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', String(x));
            label.setAttribute('y', String(H - 2));
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('fill', 'rgba(255,255,255,0.5)');
            label.setAttribute('font-size', '8');
            label.textContent = `${String(h).padStart(2, '0')}:00`;
            svg.appendChild(label);
        });

        return svg;
    }

    private updateRealtimeElements(): void {
        if (!this.currentResult) return;
        const { lat, lon } = this.currentResult.gps;
        const pos = SunCalc.getPosition(state.simDate, lat, lon);
        const elevDeg = pos.altitude * (180 / Math.PI);
        const azDeg   = ((pos.azimuth * (180 / Math.PI)) + 180 + 360) % 360;

        if (this.realtimeAzimuthEl) {
            this.realtimeAzimuthEl.textContent = `${Math.round(azDeg)}°`;
        }
        if (this.realtimeElevationEl) {
            this.realtimeElevationEl.textContent = `${Math.round(elevDeg)}°`;
        }
        if (this.realtimeCompassEl) {
            this.realtimeCompassEl.setAttribute('transform', `rotate(${azDeg}, 12, 12)`);
        }
        if (this.realtimeElevBarEl) {
            const pct = Math.max(0, Math.min(100, (elevDeg / 90) * 100));
            this.realtimeElevBarEl.style.width = `${pct}%`;
        }
        if (this.svgCurrentLineEl) {
            const currentMins = state.simDate.getHours() * 60 + state.simDate.getMinutes();
            const x = String((currentMins / 1440) * 288);
            this.svgCurrentLineEl.setAttribute('x1', x);
            this.svgCurrentLineEl.setAttribute('x2', x);
        }
    }

    private copyReport(result: SolarAnalysisResult): void {
        const lines = [
            'SunTrail Solar Report',
            `Location: ${result.gps.lat.toFixed(5)}, ${result.gps.lon.toFixed(5)}`,
            `${i18n.t('solar.stat.sunlight')}: ${this.fmtDuration(result.totalSunlightMinutes)}`,
            `${i18n.t('solar.stat.sunrise')}: ${this.fmtTime(result.sunrise)}`,
            `${i18n.t('solar.stat.noon')}: ${this.fmtTime(result.solarNoon)}`,
            `${i18n.t('solar.stat.sunset')}: ${this.fmtTime(result.sunset)}`,
            `${i18n.t('solar.stat.dayDuration')}: ${this.fmtDuration(result.dayDurationMinutes)}`,
            `${i18n.t('solar.stat.goldenMorning')}: ${this.fmtTime(result.goldenHourMorningStart)} → ${this.fmtTime(result.goldenHourMorningEnd)}`,
            `${i18n.t('solar.stat.goldenEvening')}: ${this.fmtTime(result.goldenHourEveningStart)} → ${this.fmtTime(result.goldenHourEveningEnd)}`,
            `${i18n.t('solar.stat.azimuth')}: ${Math.round(result.currentAzimuthDeg)}°`,
            `${i18n.t('solar.stat.elevation')}: ${Math.round(result.currentElevationDeg)}°`,
            `${i18n.t('solar.stat.moonPhase')}: ${this.moonEmoji(result.moonPhaseName)} ${Math.round(result.moonPhase * 100)}%`,
        ];
        navigator.clipboard.writeText(lines.join('\n'));
        showToast(i18n.t('solar.toast.copied'));
    }
}

export class SOSSheet extends BaseComponent {
    constructor() {
        super('template-sos', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        const sosCopyBtn = document.getElementById('sos-copy-btn');
        sosCopyBtn?.setAttribute('aria-label', i18n.t('sos.copy'));
        sosCopyBtn?.addEventListener('click', () => {
            const txt = document.getElementById('sos-text-container')?.textContent;
            if (txt) { 
                navigator.clipboard.writeText(txt); 
                showToast("🆘 Message copié"); 
            }
        });

        const sosCloseBtn = document.getElementById('sos-close-btn');
        sosCloseBtn?.setAttribute('aria-label', i18n.t('sos.close'));
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
