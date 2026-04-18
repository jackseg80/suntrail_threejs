import { BaseComponent } from '../core/BaseComponent';
import { state, isProActive } from '../../state';
import { worldToLngLat } from '../../geo';
import { getWeatherIcon } from '../../weather';
import { getUVCategory, getComfortIndex, getFreezingAlert } from '../../weatherUtils';
import { sheetManager } from '../core/SheetManager';
import { i18n } from '../../../i18n/I18nService';
import SunCalc from 'suncalc';
import { expertService } from '../../expertService';
import { showUpgradePrompt } from '../../iap';
import { showToast } from '../../toast';

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

        // Subscriptions
        this.addSubscription(state.subscribe('weatherData', () => this.updateUI()));
        this.addSubscription(state.subscribe('weatherUnavailable', () => this.updateUI()));
        this.addSubscription(state.subscribe('isPro', () => this.updateUI()));
        this.addSubscription(state.subscribe('trialEnd', () => this.updateUI()));
        this.addSubscription(state.subscribe('SHOW_WEATHER_PRO', () => this.updateUI()));

        this.updateUI();
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

    private buildHourlyScroll(wd: NonNullable<typeof state.weatherData>, maxItems: number): HTMLElement {
        const container = document.createElement('div');
        container.classList.add('exp-hourly-scroll');
        const items = wd.hourly ? wd.hourly.slice(0, maxItems) : [];

        // Simple helper to find sunrise/sunset for the current day
        const now = new Date();
        const { lat, lon } = worldToLngLat(state.lastClickedCoords.x, state.lastClickedCoords.z, state.originTile);
        const sun = SunCalc.getTimes(now, lat, lon);
        const sunEvents = [
            { time: sun.sunrise, icon: '🌅', label: 'Sunrise' },
            { time: sun.sunset, icon: '🌇', label: 'Sunset' }
        ];

        items.forEach((h) => {
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

            if (h.precip !== undefined && h.precip > 0) {
                const precipDiv = document.createElement('div');
                precipDiv.style.fontSize = '9px';
                precipDiv.style.color = '#60a5fa';
                precipDiv.textContent = `${h.precip}%`;
                hDiv.appendChild(precipDiv);
            }
            container.appendChild(hDiv);

            // Insert sunrise/sunset if it happens between this hour and next
            const hHour = parseInt(h.time.split(':')[0]);
            sunEvents.forEach(ev => {
                if (ev.time.getHours() === hHour) {
                    const evDiv = document.createElement('div');
                    evDiv.classList.add('exp-hourly-item');
                    evDiv.style.opacity = '0.7';
                    evDiv.innerHTML = `
                        <div class="exp-hourly-time">${ev.time.getHours()}h${ev.time.getMinutes().toString().padStart(2,'0')}</div>
                        <div class="exp-hourly-icon">${ev.icon}</div>
                        <div class="exp-hourly-temp" style="font-size:9px; color:var(--gold)">${ev.label}</div>
                    `;
                    container.appendChild(evDiv);
                }
            });
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
        bg.setAttribute('fill', 'var(--canvas-bg)');
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
        lblMin.setAttribute('fill', 'var(--canvas-text)'); lblMin.setAttribute('font-size', '8');
        lblMin.textContent = `${Math.round(minT)}°`;
        svg.appendChild(lblMin);

        const lblMax = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lblMax.setAttribute('x', '2'); lblMax.setAttribute('y', '10');
        lblMax.setAttribute('fill', 'var(--canvas-text)'); lblMax.setAttribute('font-size', '8');
        lblMax.textContent = `${Math.round(maxT)}°`;
        svg.appendChild(lblMax);

        return svg;
    }

    /**
     * Version gratuite : jour 1 visible, jours 2-3 grisés avec badge PRO.
     * Tap sur un jour verrouillé → showUpgradePrompt.
     */
    private buildDailyForecastPreview(wd: NonNullable<typeof state.weatherData>): HTMLElement {
        const container = document.createElement('div');
        const days = (wd.daily ?? []).slice(0, 3);
        days.forEach((d, index) => {
            const isLocked = index > 0;
            const row = document.createElement('div');
            row.classList.add('weather-daily-row');
            if (isLocked) {
                row.style.cursor = 'pointer';
                row.addEventListener('click', () => showUpgradePrompt('weather_extended'));
            }

            const icon = document.createElement('span');
            icon.classList.add('weather-daily-icon');
            icon.textContent = isLocked ? '🔒' : getWeatherIcon(d.code);

            const dateEl = document.createElement('span');
            dateEl.classList.add('weather-daily-date');
            const dt = new Date(d.date);
            dateEl.textContent = dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

            const temps = document.createElement('span');
            temps.classList.add('weather-daily-temps');
            temps.textContent = isLocked ? '— / —' : `${Math.round(d.tempMax)}°/${Math.round(d.tempMin)}°`;

            if (isLocked) {
                // a11y: opacity sur chaque élément placeholder individuellement (pas sur la row)
                // → le badge PRO ↗ reste à opacité pleine et lisible (ratio 6.2:1)
                icon.style.opacity = '0.38';
                icon.setAttribute('aria-hidden', 'true');
                dateEl.style.opacity = '0.38';
                dateEl.setAttribute('aria-hidden', 'true');
                temps.style.opacity = '0.38';
                temps.setAttribute('aria-hidden', 'true');
                const badge = document.createElement('span');
                badge.style.cssText = 'font-size:10px; color:var(--accent,#4a8ef8); font-weight:700; margin-left:auto; padding-left:8px;';
                badge.textContent = 'PRO ↗';
                row.appendChild(icon);
                row.appendChild(dateEl);
                row.appendChild(temps);
                row.appendChild(badge);
            } else {
                const sub = document.createElement('span');
                sub.classList.add('weather-daily-sub');
                sub.innerHTML = `💧${d.precipSum.toFixed(1)}mm · 💨${Math.round(d.windSpeedMax)}km/h`;
                row.appendChild(icon);
                row.appendChild(dateEl);
                row.appendChild(temps);
                row.appendChild(sub);
            }
            container.appendChild(row);
        });
        return container;
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

        // ── 0. Unavailable State ─────────────────────────────────────────────
        if (state.weatherUnavailable || (!wd && !state.weatherData)) {
            const msgContainer = document.createElement('div');
            msgContainer.className = 'weather-unavailable-message';
            msgContainer.style.cssText = 'padding: var(--space-8) var(--space-4); text-align: center; color: var(--text-3);';
            msgContainer.innerHTML = `
                <div style="font-size: 32px; margin-bottom: var(--space-3);">🌤️</div>
                <div style="font-weight: 600; color: var(--text);">${i18n.t('weather.noData')}</div>
                <div style="font-size: var(--text-sm); margin-top: var(--space-2); opacity: 0.7;">
                    ${state.weatherUnavailable ? 'Service météo temporairement indisponible.' : 'Localisation en cours...'}
                </div>
            `;
            this.contentEl.appendChild(msgContainer);
            return;
        }

        if (!wd) return;

        // Header (v5.30.16 : Affichage du lieu)
        const locName = wd.locationName || i18n.t('weather.mountain.title');
        const locHeader = document.getElementById('weather-location-name');
        if (locHeader) {
            locHeader.textContent = locName;
        } else {
            const newHeader = document.createElement('div');
            newHeader.id = 'weather-location-name';
            newHeader.style.marginBottom = 'var(--space-4)';
            newHeader.style.fontSize = 'var(--text-lg)';
            newHeader.style.fontWeight = '700';
            newHeader.style.textAlign = 'center';
            newHeader.textContent = locName;
            this.contentEl.appendChild(newHeader);
        }

        const isPro = isProActive() && state.SHOW_WEATHER_PRO;

        if (!isPro) {
            // ── FREE version ──────────────────────────────────────────────────
            const basicGrid = document.createElement('div');
            basicGrid.classList.add('exp-stat-grid', 'exp-stat-grid-mb');
            this.makeStat(basicGrid, i18n.t('weather.temp'), `${Math.round(wd.temp)}°C`);
            this.makeStat(basicGrid, i18n.t('weather.feelsLike'), `${Math.round(wd.apparentTemp)}°C`);
            this.makeStat(basicGrid, i18n.t('weather.wind'), `${Math.round(wd.windSpeed)} km/h`);
            this.makeStat(basicGrid, i18n.t('weather.humidity'), `${wd.humidity}%`);
            this.contentEl.appendChild(basicGrid);

            this.contentEl.appendChild(this.buildHourlyScroll(wd, 12));

            if (!isProActive() && wd.daily && wd.daily.length > 0) {
                const forecastTitle = document.createElement('div');
                forecastTitle.classList.add('exp-probe-section-title');
                forecastTitle.textContent = i18n.t('weather.section.forecast3d');
                this.contentEl.appendChild(forecastTitle);
                this.contentEl.appendChild(this.buildDailyForecastPreview(wd));

                const upsell = document.createElement('div');
                upsell.classList.add('weather-upsell-banner');
                upsell.innerHTML = `<span>${i18n.t('weather.upsell.pro')}</span>`;
                const upsellBtn = document.createElement('button');
                upsellBtn.className = 'btn-go weather-upsell-btn';
                upsellBtn.textContent = 'Pro ↗';
                upsellBtn.onclick = () => showUpgradePrompt('weather_extended');
                upsell.appendChild(upsellBtn);
                this.contentEl.appendChild(upsell);
            }

        } else {
            // ── PRO version ───────────────────────────────────────────────────

            // 1. Current Conditions Instrument
            const rtContainer = document.createElement('div');
            rtContainer.classList.add('weather-instrument-panel');
            
            // Left: Thermometer/Icon
            const leftBox = document.createElement('div');
            leftBox.classList.add('weather-instrument-main');
            const mainIcon = document.createElement('div');
            mainIcon.style.fontSize = '40px';
            const currentCode = wd.hourly?.[0]?.code ?? 0;
            mainIcon.textContent = getWeatherIcon(currentCode);
            const mainTemp = document.createElement('div');
            mainTemp.style.fontSize = '32px';
            mainTemp.style.fontWeight = '800';
            mainTemp.textContent = `${Math.round(wd.temp)}°`;
            leftBox.appendChild(mainIcon);
            leftBox.appendChild(mainTemp);
            
            // Middle: Wind Dial
            const windBox = document.createElement('div');
            windBox.classList.add('weather-instrument-wind');
            const windSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            windSvg.setAttribute('viewBox', '0 0 100 100');
            windSvg.style.width = '70px'; windSvg.style.height = '70px';
            const dial = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dial.setAttribute('cx', '50'); dial.setAttribute('cy', '50'); dial.setAttribute('r', '45');
            dial.setAttribute('stroke', 'var(--border)'); dial.setAttribute('fill', 'rgba(0,0,0,0.1)');
            windSvg.appendChild(dial);
            const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            arrow.setAttribute('d', 'M50 15 L60 85 L50 75 L40 85 Z');
            arrow.setAttribute('fill', '#60a5fa');
            arrow.setAttribute('transform', `rotate(${wd.windDirDeg ?? wd.windDir}, 50, 50)`);
            windSvg.appendChild(arrow);
            windBox.appendChild(windSvg);
            const windSpd = document.createElement('div');
            windSpd.style.fontSize = '12px'; windSpd.style.fontWeight = '700';
            windSpd.textContent = `${Math.round(wd.windSpeed)} km/h`;
            windBox.appendChild(windSpd);

            // Right: Secondary RT stats
            const rightStats = document.createElement('div');
            rightStats.classList.add('weather-instrument-stats');
            const addRt = (label: string, val: string) => {
                const d = document.createElement('div');
                d.className = 'weather-rt-row';
                d.innerHTML = `<span class="exp-stat-label">${label}</span><span class="exp-stat-value">${val}</span>`;
                rightStats.appendChild(d);
            };
            addRt(i18n.t('weather.feelsLike'), `${Math.round(wd.apparentTemp)}°C`);
            addRt(i18n.t('weather.humidity'), `${wd.humidity}%`);
            addRt(i18n.t('weather.stat.uvIndex'), `${Math.round(wd.uvIndex ?? 0)}`);

            rtContainer.appendChild(leftBox);
            rtContainer.appendChild(windBox);
            rtContainer.appendChild(rightStats);
            this.contentEl.appendChild(rtContainer);

            // 2. Secondary Stats Grid
            const grid2 = document.createElement('div');
            grid2.classList.add('exp-stat-grid', 'exp-stat-grid-mb');
            this.makeStat(grid2, i18n.t('weather.dewPoint'), `${Math.round(wd.dewPoint ?? 0)}°C`);
            this.makeStat(grid2, i18n.t('weather.gusts'), `${Math.round(wd.windGusts ?? 0)} km/h`);
            this.makeStat(grid2, i18n.t('weather.visibility'), `${Math.round(wd.visibility ?? 0)} km`);
            this.makeStat(grid2, i18n.t('weather.stat.precipProb'), `${Math.round(wd.precProb ?? 0)}%`);
            this.contentEl.appendChild(grid2);

            // 3. Forecast 24h & Chart
            const sec2 = document.createElement('div');
            sec2.classList.add('exp-probe-section-title');
            sec2.textContent = i18n.t('weather.section.forecast24h');
            this.contentEl.appendChild(sec2);
            this.contentEl.appendChild(this.buildHourlyScroll(wd, 24));
            this.contentEl.appendChild(this.buildTempChart(wd));

            // 4. Daily Forecast & Mountain Alert
            if (wd.daily && wd.daily.length > 0) {
                const sec4 = document.createElement('div');
                sec4.classList.add('exp-probe-section-title');
                sec4.textContent = i18n.t('weather.section.forecast3d');
                this.contentEl.appendChild(sec4);
                this.contentEl.appendChild(this.buildDailyForecast(wd));
            }

            const mountainBox = document.createElement('div');
            mountainBox.style.marginTop = 'var(--space-4)';
            mountainBox.appendChild(this.buildMountainAlert(wd));
            this.contentEl.appendChild(mountainBox);

            // 5. Copy Report
            const copyBtn = document.createElement('button');
            copyBtn.className = 'btn-go';
            copyBtn.textContent = i18n.t('solar.btn.copy');
            copyBtn.style.marginTop = 'var(--space-4)';
            copyBtn.onclick = () => this.copyWeatherReport(wd);
            this.contentEl.appendChild(copyBtn);
        }

        requestAnimationFrame(() => { if (this.element) this.element.scrollTop = 0; });
    }

    private copyWeatherReport(wd: NonNullable<typeof state.weatherData>): void {
        const report = expertService.generateWeatherReport(wd);
        navigator.clipboard.writeText(report);
        showToast(i18n.t('solar.toast.copied'));
    }
}
