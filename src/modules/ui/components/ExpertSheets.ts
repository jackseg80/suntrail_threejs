import { BaseComponent } from '../core/BaseComponent';
import { state, saveSettings } from '../../state';
import { runSolarProbe, getAltitudeAt, type SolarAnalysisResult } from '../../analysis';
import { worldToLngLat } from '../../geo';
import { showToast } from '../../utils';
import { getWeatherIcon } from '../../weather';
import { getUVCategory, getComfortIndex, getFreezingAlert, fmtWindDir } from '../../weatherUtils';
import { sheetManager } from '../core/SheetManager';
import { i18n } from '../../../i18n/I18nService';
import { showUpgradePrompt } from '../../iap';
import SunCalc from 'suncalc';

export class WeatherSheet extends BaseComponent {
    private contentEl: HTMLElement | null = null;

    constructor() {
        super('template-weather', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        this.contentEl = document.getElementById('weather-content');
        this.contentEl?.setAttribute('aria-live', 'polite');

        const closeWeather = document.getElementById('close-weather');
        closeWeather?.setAttribute('aria-label', i18n.t('weather.aria.close') || 'Fermer météo');
        closeWeather?.addEventListener('click', () => {
            sheetManager.close();
        });

        // Simulation Météo Manuelle (conservé intact)
        this.element.querySelectorAll('.weather-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.currentWeather = (btn as HTMLElement).dataset.weather as any;
                state.WEATHER_DENSITY = (state.currentWeather === 'clear') ? 0 : 5000;
            });
        });

        // Sliders (conservés intacts)
        this.bindSlider('weather-density-slider', 'WEATHER_DENSITY', 'weather-density-disp');
        this.bindSlider('weather-speed-slider', 'WEATHER_SPEED', 'weather-speed-disp');

        // Subscriptions
        this.addSubscription(state.subscribe('weatherData', () => this.updateUI()));
        this.addSubscription(state.subscribe('isPro', () => this.updateUI()));
        this.addSubscription(state.subscribe('WEATHER_DENSITY', (val: number) => this.updateSlider('weather-density-slider', 'weather-density-disp', val)));
        this.addSubscription(state.subscribe('WEATHER_SPEED', (val: number) => this.updateSlider('weather-speed-slider', 'weather-speed-disp', val)));
        
        this.updateUI();
        this.updateSlider('weather-density-slider', 'weather-density-disp', state.WEATHER_DENSITY);
        this.updateSlider('weather-speed-slider', 'weather-speed-disp', state.WEATHER_SPEED);
    }

    private bindSlider(id: string, stateKey: keyof typeof state, dispId: string, onChange?: () => void) {
        if (!this.element) return;
        const slider = document.getElementById(id) as HTMLInputElement;
        const disp = document.getElementById(dispId);
        if (slider) {
            slider.setAttribute('aria-label', stateKey);
            slider.setAttribute('aria-valuemin', slider.min);
            slider.setAttribute('aria-valuemax', slider.max);
            slider.setAttribute('aria-valuenow', slider.value);
            slider.addEventListener('input', () => {
                (state as any)[stateKey] = parseFloat(slider.value);
                if (disp) disp.textContent = slider.value;
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
            slider.setAttribute('aria-valuenow', value.toString());
        }
        if (disp) disp.textContent = value.toString();
    }

    private makeStat(parent: HTMLElement, label: string, value: string, cssClass = 'exp-stat-card') {
        const div = document.createElement('div');
        div.classList.add(cssClass);
        const lbl = document.createElement('div');
        lbl.classList.add('exp-stat-label');
        lbl.textContent = label;
        const val = document.createElement('div');
        val.classList.add('exp-stat-value');
        val.textContent = value;
        div.appendChild(lbl);
        div.appendChild(val);
        parent.appendChild(div);
        return val;
    }

    private buildWindArrowSVG(deg: number): SVGSVGElement {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 20 20');
        svg.setAttribute('width', '20');
        svg.setAttribute('height', '20');
        svg.style.verticalAlign = 'middle';
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', '#60a5fa');
        path.setAttribute('d', 'M10 2 L12 16 L10 13 L8 16 Z');
        path.setAttribute('transform', `rotate(${deg}, 10, 10)`);
        svg.appendChild(path);
        return svg;
    }

    private buildHourlyScroll(wd: NonNullable<typeof state.weatherData>, maxItems: number): HTMLElement {
        const container = document.createElement('div');
        container.classList.add('exp-hourly-scroll');
        const items = wd.hourly ? wd.hourly.slice(0, maxItems) : [];
        items.forEach(h => {
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

            if (h.precip !== undefined && h.precip > 0) {
                const precipDiv = document.createElement('div');
                precipDiv.style.fontSize = '9px';
                precipDiv.style.color = '#60a5fa';
                precipDiv.textContent = `${h.precip}%`;
                hDiv.appendChild(timeDiv);
                hDiv.appendChild(iconDiv);
                hDiv.appendChild(tempDiv);
                hDiv.appendChild(precipDiv);
            } else {
                hDiv.appendChild(timeDiv);
                hDiv.appendChild(iconDiv);
                hDiv.appendChild(tempDiv);
            }
            container.appendChild(hDiv);
        });
        return container;
    }

    private buildTempChart(wd: NonNullable<typeof state.weatherData>): SVGSVGElement {
        const W = 300;
        const H = 80;
        const hourly = wd.hourly ? wd.hourly.slice(0, 24) : [];
        const temps = hourly.map(h => h.temp);
        const minT = Math.min(...temps);
        const maxT = Math.max(...temps);
        const rangeT = maxT - minT || 1;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.classList.add('weather-svg-chart');

        // Background
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
        bg.setAttribute('width', String(W)); bg.setAttribute('height', String(H));
        bg.setAttribute('fill', 'rgba(0,0,0,0.2)');
        svg.appendChild(bg);

        const xStep = W / Math.max(hourly.length - 1, 1);
        const yFor = (t: number) => H - 8 - ((t - minT) / rangeT) * (H - 16);

        // Precipitation bars (blue rects)
        hourly.forEach((h, i) => {
            if ((h.precip ?? 0) > 30) {
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                const bh = ((h.precip ?? 0) / 100) * (H - 16);
                rect.setAttribute('x', String(i * xStep));
                rect.setAttribute('y', String(H - 8 - bh));
                rect.setAttribute('width', String(xStep));
                rect.setAttribute('height', String(bh));
                rect.setAttribute('fill', 'rgba(96,165,250,0.25)');
                svg.appendChild(rect);
            }
        });

        // Isotherme 0°C line
        if (minT < 0 && maxT > 0) {
            const y0 = yFor(0);
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', '0'); line.setAttribute('x2', String(W));
            line.setAttribute('y1', String(y0)); line.setAttribute('y2', String(y0));
            line.setAttribute('stroke', '#ef4444');
            line.setAttribute('stroke-width', '1');
            line.setAttribute('stroke-dasharray', '3,2');
            svg.appendChild(line);
        }

        // Temperature polyline
        if (hourly.length > 1) {
            const pts = hourly.map((h, i) => `${i * xStep},${yFor(h.temp)}`).join(' ');
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            poly.setAttribute('points', pts);
            poly.setAttribute('stroke', '#ffd700');
            poly.setAttribute('stroke-width', '2');
            poly.setAttribute('fill', 'none');
            svg.appendChild(poly);
        }

        // Min/Max labels
        const lblMin = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lblMin.setAttribute('x', '2'); lblMin.setAttribute('y', String(H - 2));
        lblMin.setAttribute('fill', 'rgba(255,255,255,0.6)'); lblMin.setAttribute('font-size', '8');
        lblMin.textContent = `${Math.round(minT)}°`;
        svg.appendChild(lblMin);

        const lblMax = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lblMax.setAttribute('x', '2'); lblMax.setAttribute('y', '10');
        lblMax.setAttribute('fill', 'rgba(255,255,255,0.6)'); lblMax.setAttribute('font-size', '8');
        lblMax.textContent = `${Math.round(maxT)}°`;
        svg.appendChild(lblMax);

        return svg;
    }

    private buildDailyForecast(wd: NonNullable<typeof state.weatherData>): HTMLElement {
        const container = document.createElement('div');
        const days = (wd.daily ?? []).slice(0, 3);
        days.forEach(d => {
            const row = document.createElement('div');
            row.classList.add('weather-daily-row');

            const icon = document.createElement('span');
            icon.classList.add('weather-daily-icon');
            icon.textContent = getWeatherIcon(d.code);

            const dateEl = document.createElement('span');
            dateEl.classList.add('weather-daily-date');
            const dt = new Date(d.date);
            dateEl.textContent = dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

            const temps = document.createElement('span');
            temps.classList.add('weather-daily-temps');
            temps.textContent = `${Math.round(d.tempMax)}°/${Math.round(d.tempMin)}°`;

            const sub = document.createElement('span');
            sub.classList.add('weather-daily-sub');
            const uvCat = getUVCategory(d.uvIndexMax);
            const uvColor = { low: '#22c55e', moderate: '#eab308', high: '#f97316', veryHigh: '#ef4444', extreme: '#a855f7' }[uvCat];
            sub.innerHTML = `💧${d.precipSum.toFixed(1)}mm · <span style="color:${uvColor}">UV${Math.round(d.uvIndexMax)}</span> · 💨${Math.round(d.windSpeedMax)}km/h`;

            row.appendChild(icon);
            row.appendChild(dateEl);
            row.appendChild(temps);
            row.appendChild(sub);
            container.appendChild(row);
        });
        return container;
    }

    private buildMountainAlert(wd: NonNullable<typeof state.weatherData>): HTMLElement {
        const container = document.createElement('div');
        container.classList.add('weather-mountain-alert');

        const freezingLevel = wd.freezingLevel ?? 0;
        const alt = state.hasLastClicked ? state.lastClickedCoords.alt : 0;

        // Freezing level alert
        if (freezingLevel > 0) {
            const alertKey = getFreezingAlert(alt, freezingLevel);
            const alertTexts: Record<string, string> = {
                aboveFreezing: `❄️ ${i18n.t('weather.mountain.aboveFreezing')} (${Math.round(freezingLevel)}m)`,
                nearFreezing: `⚠️ ${i18n.t('weather.mountain.nearFreezing')} (${Math.round(freezingLevel)}m)`,
                belowFreezing: `✅ ${i18n.t('weather.mountain.belowFreezing')} — ${Math.round(freezingLevel)}m`
            };
            const alertDiv = document.createElement('div');
            alertDiv.style.marginBottom = 'var(--space-2)';
            alertDiv.textContent = alertTexts[alertKey];
            container.appendChild(alertDiv);
        }

        // Comfort index
        const score = getComfortIndex(wd.temp, wd.windSpeed, wd.uvIndex ?? 0);
        const scoreRounded = Math.round(score * 10) / 10;
        const comfortDiv = document.createElement('div');
        comfortDiv.style.marginTop = 'var(--space-2)';
        const comfortLabel = document.createElement('span');
        comfortLabel.classList.add('exp-stat-label');
        comfortLabel.textContent = `${i18n.t('weather.mountain.comfort')}: `;
        const comfortScore = document.createElement('span');
        comfortScore.classList.add('weather-comfort-score');
        const comfortText = score >= 8 ? '😊 Excellent' : score >= 6 ? '👍 Bon' : score >= 4 ? '😐 Moyen' : '😟 Difficile';
        comfortScore.textContent = `${comfortText} (${scoreRounded}/10)`;
        comfortDiv.appendChild(comfortLabel);
        comfortDiv.appendChild(comfortScore);
        container.appendChild(comfortDiv);

        return container;
    }

    private updateUI() {
        const wd = state.weatherData;
        if (!this.contentEl) return;

        this.contentEl.textContent = '';

        if (!wd) return;

        if (!state.isPro) {
            // ── FREE version ──────────────────────────────────────────────────
            const basicGrid = document.createElement('div');
            basicGrid.classList.add('exp-stat-grid', 'exp-stat-grid-mb');
            this.makeStat(basicGrid, i18n.t('weather.temp'), `${Math.round(wd.temp)}°C`);
            this.makeStat(basicGrid, i18n.t('weather.feelsLike'), `${Math.round(wd.apparentTemp)}°C`);
            this.makeStat(basicGrid, i18n.t('weather.wind'), `${Math.round(wd.windSpeed)} km/h`);
            this.makeStat(basicGrid, i18n.t('weather.humidity'), `${wd.humidity}%`);
            this.contentEl.appendChild(basicGrid);

            // Scroll 12h seulement
            this.contentEl.appendChild(this.buildHourlyScroll(wd, 12));

            // Upsell banner
            const upsell = document.createElement('div');
            upsell.classList.add('weather-upsell-banner');
            const upsellSpan = document.createElement('span');
            upsellSpan.textContent = i18n.t('weather.upsell.pro');
            const upsellBtn = document.createElement('button');
            upsellBtn.className = 'btn-go weather-upsell-btn';
            upsellBtn.textContent = 'Pro ↗';
            upsellBtn.onclick = () => showUpgradePrompt('weather_pro');
            upsell.appendChild(upsellSpan);
            upsell.appendChild(upsellBtn);
            this.contentEl.appendChild(upsell);

        } else {
            // ── PRO version — 5 blocs ─────────────────────────────────────────

            // Bloc 1 — Conditions actuelles complètes
            const sec1 = document.createElement('div');
            sec1.classList.add('exp-probe-section-title');
            sec1.textContent = i18n.t('weather.section.current');
            this.contentEl.appendChild(sec1);

            const grid1 = document.createElement('div');
            grid1.classList.add('exp-stat-grid', 'exp-stat-grid-3', 'exp-stat-grid-mb');

            // Row 1: Temp | Ressenti | Humidité
            this.makeStat(grid1, i18n.t('weather.temp'), `${Math.round(wd.temp)}°C`);
            this.makeStat(grid1, i18n.t('weather.feelsLike'), `${Math.round(wd.apparentTemp)}°C`);
            this.makeStat(grid1, i18n.t('weather.humidity'), `${wd.humidity}%`);

            // Row 2: Point de rosée | UV Index | Couverture nuageuse
            this.makeStat(grid1, i18n.t('weather.dewPoint'), `${Math.round(wd.dewPoint ?? 0)}°C`);

            // UV Index with color
            const uvCat = getUVCategory(wd.uvIndex ?? 0);
            const uvColor = { low: '#22c55e', moderate: '#eab308', high: '#f97316', veryHigh: '#ef4444', extreme: '#a855f7' }[uvCat];
            const uvCard = document.createElement('div');
            uvCard.classList.add('exp-stat-card');
            const uvLbl = document.createElement('div'); uvLbl.classList.add('exp-stat-label');
            uvLbl.textContent = i18n.t('weather.stat.uvIndex');
            const uvVal = document.createElement('div'); uvVal.classList.add('exp-stat-value');
            uvVal.style.color = uvColor;
            uvVal.textContent = `${Math.round(wd.uvIndex ?? 0)} — ${i18n.t('weather.uv.' + uvCat)}`;
            uvCard.appendChild(uvLbl); uvCard.appendChild(uvVal);
            grid1.appendChild(uvCard);

            this.makeStat(grid1, i18n.t('weather.stat.cloudCover'), `${Math.round(wd.cloudCover)}%`);

            // Row 3: Vent + flèche | Rafales | Visibilité
            const windCard = document.createElement('div');
            windCard.classList.add('exp-stat-card');
            const windLbl = document.createElement('div'); windLbl.classList.add('exp-stat-label');
            windLbl.textContent = i18n.t('weather.stat.windDir');
            const windVal = document.createElement('div'); windVal.classList.add('exp-stat-value');
            windVal.style.display = 'flex'; windVal.style.alignItems = 'center'; windVal.style.gap = '4px';
            const windText = document.createTextNode(`${Math.round(wd.windSpeed)} km/h ${fmtWindDir(wd.windDirDeg ?? wd.windDir)} `);
            windVal.appendChild(windText);
            windVal.appendChild(this.buildWindArrowSVG(wd.windDirDeg ?? wd.windDir));
            windCard.appendChild(windLbl); windCard.appendChild(windVal);
            grid1.appendChild(windCard);

            this.makeStat(grid1, i18n.t('weather.gusts'), `${Math.round(wd.windGusts ?? 0)} km/h`);
            this.makeStat(grid1, i18n.t('weather.visibility'), `${Math.round(wd.visibility ?? 0)} km`);

            // Row 4: Isotherme 0°C | Précip % | vide
            this.makeStat(grid1, i18n.t('weather.freezingLevel'), `${Math.round(wd.freezingLevel ?? 0)} m`);
            this.makeStat(grid1, i18n.t('weather.stat.precipProb'), `${Math.round(wd.precProb ?? 0)}%`);
            // vide (3ème colonne)
            const empty = document.createElement('div');
            grid1.appendChild(empty);

            this.contentEl.appendChild(grid1);

            // Bloc 2 — Scroll 24h enrichi
            const sec2 = document.createElement('div');
            sec2.classList.add('exp-probe-section-title');
            sec2.textContent = i18n.t('weather.section.forecast24h');
            this.contentEl.appendChild(sec2);
            this.contentEl.appendChild(this.buildHourlyScroll(wd, 24));

            // Bloc 3 — Graphique SVG température 24h
            this.contentEl.appendChild(this.buildTempChart(wd));

            // Bloc 4 — Prévisions 3 jours
            if (wd.daily && wd.daily.length > 0) {
                const sec4 = document.createElement('div');
                sec4.classList.add('exp-probe-section-title');
                sec4.textContent = i18n.t('weather.section.forecast3d');
                this.contentEl.appendChild(sec4);
                this.contentEl.appendChild(this.buildDailyForecast(wd));
            }

            // Bloc 5 — Alerte Montagne
            const sec5 = document.createElement('div');
            sec5.classList.add('exp-probe-section-title');
            sec5.textContent = i18n.t('weather.section.mountain');
            this.contentEl.appendChild(sec5);
            this.contentEl.appendChild(this.buildMountainAlert(wd));

            // Bouton copier rapport
            const copyBtn = document.createElement('button');
            copyBtn.className = 'btn-go';
            copyBtn.textContent = i18n.t('solar.btn.copy');
            copyBtn.style.marginTop = 'var(--space-4)';
            copyBtn.onclick = () => this.copyWeatherReport(wd);
            this.contentEl.appendChild(copyBtn);
        }

    }

    private copyWeatherReport(wd: NonNullable<typeof state.weatherData>): void {
        const lines = [
            'SunTrail Weather Report',
            `${i18n.t('weather.location')}: ${wd.locationName ?? '—'}`,
            `${i18n.t('weather.temp')}: ${Math.round(wd.temp)}°C`,
            `${i18n.t('weather.feelsLike')}: ${Math.round(wd.apparentTemp)}°C`,
            `${i18n.t('weather.humidity')}: ${wd.humidity}%`,
            `${i18n.t('weather.wind')}: ${Math.round(wd.windSpeed)} km/h ${fmtWindDir(wd.windDirDeg ?? wd.windDir)}`,
            `${i18n.t('weather.gusts')}: ${Math.round(wd.windGusts ?? 0)} km/h`,
            `${i18n.t('weather.stat.uvIndex')}: ${Math.round(wd.uvIndex ?? 0)}`,
            `${i18n.t('weather.freezingLevel')}: ${Math.round(wd.freezingLevel ?? 0)} m`,
            `${i18n.t('weather.visibility')}: ${Math.round(wd.visibility ?? 0)} km`,
            `${i18n.t('weather.stat.comfortIndex')}: ${Math.round(getComfortIndex(wd.temp, wd.windSpeed, wd.uvIndex ?? 0) * 10) / 10}/10`,
        ];
        if (wd.daily) {
            lines.push('');
            lines.push(i18n.t('weather.section.forecast3d') + ':');
            wd.daily.slice(0, 3).forEach(d => {
                lines.push(`  ${d.date}: ${Math.round(d.tempMax)}°/${Math.round(d.tempMin)}° · 💧${d.precipSum.toFixed(1)}mm · UV${Math.round(d.uvIndexMax)} · 💨${Math.round(d.windSpeedMax)}km/h`);
            });
        }
        navigator.clipboard.writeText(lines.join('\n'));
        showToast(i18n.t('solar.toast.copied'));
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
