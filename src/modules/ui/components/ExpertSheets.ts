import { BaseComponent } from '../core/BaseComponent';
import { state, isProActive } from '../../state';
import { runSolarProbe, getAltitudeAt, type SolarAnalysisResult } from '../../analysis';
import { worldToLngLat } from '../../geo';
import { showToast } from '../../toast';
import { getWeatherIcon } from '../../weather';
import { getUVCategory, getComfortIndex, getFreezingAlert, fmtWindDir } from '../../weatherUtils';
import { sheetManager } from '../core/SheetManager';
import { i18n } from '../../../i18n/I18nService';
import { eventBus } from '../../eventBus';
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

        // ✅ Afficher message si la météo est indisponible (API en panne)
        if (state.weatherUnavailable) {
            const msgContainer = document.createElement('div');
            msgContainer.className = 'weather-unavailable-message';
            msgContainer.style.cssText = 'padding: 20px; text-align: center; color: #666; font-style: italic;';
            msgContainer.innerHTML = `
                <div style="font-size: 2em; margin-bottom: 10px;">🌤️</div>
                <div>Service météo temporairement indisponible</div>
                <div style="font-size: 0.9em; margin-top: 8px; color: #999;">Les prévisions réapparaîtront automatiquement</div>
            `;
            this.contentEl.appendChild(msgContainer);
            return;
        }

        if (!wd) return;

        // Nom de lieu en en-tête (issu du reverse geocoding dans weather.ts)
        if (wd.locationName) {
            const locHeader = document.createElement('div');
            locHeader.className = 'weather-location-name';
            locHeader.textContent = wd.locationName;
            this.contentEl.appendChild(locHeader);
        }

        // Météo avancée uniquement si Pro ET toggle activé
        const showAdvancedWeather = isProActive() && (state as any).SHOW_WEATHER_PRO;

        if (!showAdvancedWeather) {
            // ── FREE version ou PRO simple ────────────────────────────────────
            const basicGrid = document.createElement('div');
            basicGrid.classList.add('exp-stat-grid', 'exp-stat-grid-mb');
            this.makeStat(basicGrid, i18n.t('weather.temp'), `${Math.round(wd.temp)}°C`);
            this.makeStat(basicGrid, i18n.t('weather.feelsLike'), `${Math.round(wd.apparentTemp)}°C`);
            this.makeStat(basicGrid, i18n.t('weather.wind'), `${Math.round(wd.windSpeed)} km/h`);
            this.makeStat(basicGrid, i18n.t('weather.humidity'), `${wd.humidity}%`);
            this.contentEl.appendChild(basicGrid);

            // Scroll 12h seulement
            this.contentEl.appendChild(this.buildHourlyScroll(wd, 12));

            // Prévisions 3 jours UNIQUEMENT pour les utilisateurs gratuits (teaser)
            // Les utilisateurs Pro en mode simple ne voient PAS les prévisions 3 jours
            if (!isProActive() && wd.daily && wd.daily.length > 0) {
                const forecastTitle = document.createElement('div');
                forecastTitle.classList.add('exp-probe-section-title');
                forecastTitle.textContent = i18n.t('weather.section.forecast3d');
                this.contentEl.appendChild(forecastTitle);
                this.contentEl.appendChild(this.buildDailyForecastPreview(wd));

                // Upsell banner (uniquement pour les gratuits)
                const upsell = document.createElement('div');
                upsell.classList.add('weather-upsell-banner');
                const upsellSpan = document.createElement('span');
                upsellSpan.textContent = i18n.t('weather.upsell.pro');
                const upsellBtn = document.createElement('button');
                upsellBtn.className = 'btn-go weather-upsell-btn';
                upsellBtn.textContent = 'Pro ↗';
                upsellBtn.onclick = () => showUpgradePrompt('weather_extended');
                upsell.appendChild(upsellSpan);
                upsell.appendChild(upsellBtn);
                this.contentEl.appendChild(upsell);
            }

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

        // Toujours afficher depuis le haut après reconstruction du contenu
        requestAnimationFrame(() => { if (this.element) this.element.scrollTop = 0; });
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
        return `${h}h ${m.toString().padStart(2, '0')}`;
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
        this.svgCurrentLineEl = null;

        const addStat = (parent: HTMLElement, label: string, value: string, icon?: string) => {
            const div = document.createElement('div');
            div.classList.add('exp-probe-card');
            if (icon) {
                const iconEl = document.createElement('span');
                iconEl.style.fontSize = '14px';
                iconEl.style.marginRight = '4px';
                iconEl.textContent = icon;
                div.appendChild(iconEl);
            }
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

        if (!isProActive()) {
            // ── FREE version ──────────────────────────────────────────────────
            const grid = document.createElement('div');
            grid.classList.add('exp-stat-grid', 'exp-probe-grid-mb');
            addStat(grid, i18n.t('solar.stat.sunlight'), this.fmtDuration(result.totalSunlightMinutes), '☀️');
            addStat(grid, i18n.t('solar.stat.firstRay'), this.fmtTime(result.firstSunTime), '🌅');
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

            // 1. Graphique d'élévation 24h (Prominent at top)
            const chartSection = document.createElement('div');
            chartSection.style.marginBottom = 'var(--space-4)';
            chartSection.appendChild(this.buildElevationChart(result));
            this.contentEl.appendChild(chartSection);

            // 2. Temps réel & Boussole
            const rtContainer = document.createElement('div');
            rtContainer.classList.add('solar-realtime-instrument');
            
            // Left: Compass
            const compassBox = document.createElement('div');
            compassBox.classList.add('solar-instrument-compass');
            const compassSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            compassSvg.setAttribute('viewBox', '0 0 100 100');
            compassSvg.classList.add('solar-compass-large');
            // Dial
            const dial = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dial.setAttribute('cx', '50'); dial.setAttribute('cy', '50'); dial.setAttribute('r', '45');
            dial.setAttribute('stroke', 'var(--border)'); dial.setAttribute('fill', 'rgba(0,0,0,0.2)');
            compassSvg.appendChild(dial);
            // Marks N/E/S/W
            ['N','E','S','W'].forEach((label, i) => {
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                const angle = i * 90 * (Math.PI/180) - Math.PI/2;
                text.setAttribute('x', String(50 + 35 * Math.cos(angle)));
                text.setAttribute('y', String(50 + 35 * Math.sin(angle) + 4));
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('fill', 'var(--text-3)');
                text.setAttribute('font-size', '10');
                text.setAttribute('font-weight', 'bold');
                text.textContent = label;
                compassSvg.appendChild(text);
            });
            // Arrow
            const compassArrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            compassArrow.setAttribute('fill', 'var(--gold)');
            compassArrow.setAttribute('d', 'M50 20 L58 75 L50 65 L42 75 Z');
            this.realtimeCompassEl = compassArrow;
            compassSvg.appendChild(compassArrow);
            compassBox.appendChild(compassSvg);
            
            // Right: RT Stats
            const rtStats = document.createElement('div');
            rtStats.classList.add('solar-instrument-stats');
            
            const rtAz = document.createElement('div');
            rtAz.className = 'solar-rt-stat-item';
            rtAz.innerHTML = `<span class="exp-probe-label">${i18n.t('solar.stat.azimuth')}</span>`;
            const rtAzVal = document.createElement('div');
            rtAzVal.className = 'exp-probe-value';
            this.realtimeAzimuthEl = rtAzVal;
            rtAz.appendChild(rtAzVal);
            
            const rtEl = document.createElement('div');
            rtEl.className = 'solar-rt-stat-item';
            rtEl.innerHTML = `<span class="exp-probe-label">${i18n.t('solar.stat.elevation')}</span>`;
            const rtElVal = document.createElement('div');
            rtElVal.className = 'exp-probe-value';
            this.realtimeElevationEl = rtElVal;
            rtEl.appendChild(rtElVal);

            const rtMoon = document.createElement('div');
            rtMoon.className = 'solar-rt-stat-item';
            rtMoon.innerHTML = `<span class="exp-probe-label">${i18n.t('solar.stat.moonPhase')}</span>`;
            const rtMoonVal = document.createElement('div');
            rtMoonVal.className = 'exp-probe-value';
            rtMoonVal.style.fontSize = 'var(--text-md)';
            rtMoonVal.textContent = `${this.moonEmoji(result.moonPhaseName)} ${Math.round(result.moonPhase * 100)}%`;
            rtMoon.appendChild(rtMoonVal);

            const rtMaxEl = document.createElement('div');
            rtMaxEl.className = 'solar-rt-stat-item';
            rtMaxEl.innerHTML = `<span class="exp-probe-label">${i18n.t('solar.stat.maxElevation')}</span>`;
            const rtMaxElVal = document.createElement('div');
            rtMaxElVal.className = 'exp-probe-value';
            rtMaxElVal.style.fontSize = 'var(--text-md)';
            rtMaxElVal.textContent = `${Math.round(result.maxElevationDeg)}°`;
            rtMaxEl.appendChild(rtMaxElVal);

            rtStats.appendChild(rtAz);
            rtStats.appendChild(rtEl);
            rtStats.appendChild(rtMaxEl);
            rtStats.appendChild(rtMoon);
            
            rtContainer.appendChild(compassBox);
            rtContainer.appendChild(rtStats);
            this.contentEl.appendChild(rtContainer);

            // 3. Bloc Données du jour (Simplified Grid)
            const grid1 = document.createElement('div');
            grid1.classList.add('exp-stat-grid', 'exp-probe-grid-mb');
            
            addStat(grid1, i18n.t('solar.stat.dayDuration'), this.fmtDuration(result.dayDurationMinutes), '⏱️');
            addStat(grid1, i18n.t('solar.stat.sunlight'), this.fmtDuration(result.totalSunlightMinutes), '☀️');
            
            addStat(grid1, 'H. Dorée Matin',
                `${this.fmtTime(result.goldenHourMorningStart)} — ${this.fmtTime(result.goldenHourMorningEnd)}`, '🌅');
            addStat(grid1, 'H. Dorée Soir',
                `${this.fmtTime(result.goldenHourEveningStart)} — ${this.fmtTime(result.goldenHourEveningEnd)}`, '🌇');
            
            this.contentEl.appendChild(grid1);

            // 4. Timeline (Evolution détaillée)
            this.buildTimeline(this.contentEl, result);

            // 5. Rapport exportable
            const copyBtn = document.createElement('button');
            copyBtn.className = 'btn-go';
            copyBtn.style.marginTop = 'var(--space-2)';
            copyBtn.setAttribute('aria-label', i18n.t('solar.btn.copy'));
            copyBtn.textContent = i18n.t('solar.btn.copy');
            copyBtn.onclick = () => this.copyReport(result);
            this.contentEl.appendChild(copyBtn);

            // Init real-time display
            this.updateRealtimeElements();
        }

        // Toujours afficher depuis le haut après reconstruction du contenu
        requestAnimationFrame(() => { if (this.element) this.element.scrollTop = 0; });
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
                bar.style.background = 'rgba(255,80,80,0.3)'; // Reddish for shadow
            } else {
                bar.style.background = 'var(--gold)';
            }
            timelineContainer.appendChild(bar);
        });
        parent.appendChild(timelineContainer);
    }

    private buildElevationChart(result: SolarAnalysisResult): SVGSVGElement {
        const W = 320;
        const H = 120;
        const PADDING_BOTTOM = 20; 
        const CHART_H = H - PADDING_BOTTOM;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.classList.add('solar-elevation-chart-v2');
        svg.style.width = '100%';
        svg.style.height = 'auto';
        svg.style.background = 'var(--surface-subtle)';
        svg.style.borderRadius = 'var(--radius-md)';
        svg.style.border = '1px solid var(--border)';

        // 1. Defined Gradients
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const skyGrad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        skyGrad.setAttribute('id', 'skyGrad'); skyGrad.setAttribute('x1', '0'); skyGrad.setAttribute('y1', '0'); skyGrad.setAttribute('x2', '0'); skyGrad.setAttribute('y2', '1');
        skyGrad.innerHTML = `<stop offset="0%" stop-color="#4a8ef8" stop-opacity="0.4"/><stop offset="100%" stop-color="#4a8ef8" stop-opacity="0.05"/>`;
        defs.appendChild(skyGrad);
        svg.appendChild(defs);

        // 2. Background zones
        const yForElev = (elev: number) => CHART_H - ((elev + 20) / 110) * CHART_H; // Map -20..90 to CHART_H..0
        const horizonY = yForElev(0);

        // Day background
        const dayBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        dayBg.setAttribute('x', '0'); dayBg.setAttribute('y', '0');
        dayBg.setAttribute('width', String(W)); dayBg.setAttribute('height', String(horizonY));
        dayBg.setAttribute('fill', 'url(#skyGrad)');
        svg.appendChild(dayBg);

        // Shadow segments
        result.timeline.forEach((t, i) => {
            if (!t.isNight && t.inShadow) {
                const x = (i / 48) * W;
                const barW = W / 48;
                const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                r.setAttribute('x', String(x)); r.setAttribute('y', '0');
                r.setAttribute('width', String(barW)); r.setAttribute('height', String(CHART_H));
                r.setAttribute('fill', 'rgba(239,68,68,0.15)');
                svg.appendChild(r);
            }
        });

        // 3. Grid & Horizon
        const horizLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        horizLine.setAttribute('x1', '0'); horizLine.setAttribute('x2', String(W));
        horizLine.setAttribute('y1', String(horizonY)); horizLine.setAttribute('y2', String(horizonY));
        horizLine.setAttribute('stroke', 'var(--text-3)'); horizLine.setAttribute('stroke-width', '0.5');
        horizLine.setAttribute('stroke-dasharray', '2,2');
        svg.appendChild(horizLine);

        // 4. Elevation curve
        const curve = result.elevationCurve;
        let d = '';
        curve.forEach((elev, i) => {
            const x = (i / 143) * W;
            const y = yForElev(elev);
            d += i === 0 ? `M${x},${y}` : ` L${x},${y}`;
        });
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('stroke', 'var(--gold)'); path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        svg.appendChild(path);

        // 5. Markers (Sunrise, Sunset, Noon)
        const addMarker = (date: Date | null, label: string, color: string) => {
            if (!date) return;
            const mins = date.getHours() * 60 + date.getMinutes();
            const x = (mins / 1440) * W;
            
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', String(x)); line.setAttribute('x2', String(x));
            line.setAttribute('y1', '0'); line.setAttribute('y2', String(CHART_H));
            line.setAttribute('stroke', color); line.setAttribute('stroke-width', '1');
            line.setAttribute('stroke-dasharray', '3,3');
            svg.appendChild(line);

            const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            txt.setAttribute('x', String(x)); txt.setAttribute('y', '12');
            txt.setAttribute('text-anchor', 'middle');
            txt.setAttribute('fill', color); txt.setAttribute('font-size', '8');
            txt.setAttribute('font-weight', 'bold');
            txt.textContent = `${label} ${this.fmtTime(date)}`;
            svg.appendChild(txt);
        };

        addMarker(result.sunrise, '↑', 'var(--gold)');
        addMarker(result.sunset, '↓', 'var(--text-2)');
        addMarker(result.solarNoon, '☼', 'var(--accent)');

        // Max elevation marker
        const maxIdx = result.elevationCurve.indexOf(result.maxElevationDeg);
        if (maxIdx !== -1) {
            const mins = maxIdx * 10;
            const x = (mins / 1440) * W;
            const y = yForElev(result.maxElevationDeg);
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', String(x)); circle.setAttribute('cy', String(y));
            circle.setAttribute('r', '3'); circle.setAttribute('fill', 'var(--gold)');
            svg.appendChild(circle);
        }

        // 6. Current time cursor
        const currentLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        currentLine.setAttribute('y1', '0'); currentLine.setAttribute('y2', String(CHART_H));
        currentLine.setAttribute('stroke', 'var(--text)'); currentLine.setAttribute('stroke-width', '1.5');
        this.svgCurrentLineEl = currentLine as unknown as SVGLineElement;
        svg.appendChild(currentLine);

        // 7. Time labels
        [0, 6, 12, 18, 24].forEach((h) => {
            const x = (h / 24) * W;
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', String(x)); label.setAttribute('y', String(H - 4));
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('fill', 'var(--text-3)'); label.setAttribute('font-size', '9');
            label.textContent = `${h}h`;
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
            this.realtimeCompassEl.setAttribute('transform', `rotate(${azDeg}, 50, 50)`);
        }
        if (this.svgCurrentLineEl) {
            const currentMins = state.simDate.getHours() * 60 + state.simDate.getMinutes();
            const x = String((currentMins / 1440) * 320);
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
    private attachSosBtnTimer: any = null;

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

        const sosSmsBtn = document.getElementById('sos-sms-btn');
        sosSmsBtn?.setAttribute('aria-label', i18n.t('sos.sms'));

        const sosCloseBtn = document.getElementById('sos-close-btn');
        sosCloseBtn?.setAttribute('aria-label', i18n.t('sos.close'));
        sosCloseBtn?.addEventListener('click', () => { 
            sheetManager.close();
        });

        // ARIA: SOS text container is a live region
        const sosTextContainer = document.getElementById('sos-text-container');
        sosTextContainer?.setAttribute('aria-live', 'polite');

        // Résolution GPS déclenchée sur l'événement sheetOpened
        const onSheetOpened = ({ id }: { id: string }) => {
            if (id === 'sos') void this.resolveAndDisplay();
        };
        eventBus.on('sheetOpened', onSheetOpened);
        this.addSubscription(() => eventBus.off('sheetOpened', onSheetOpened));

        // Bouton pill (widget coords) — ouvre simplement le sheet
        const attachSosBtn = () => {
            const sosBtn = document.getElementById('sos-btn-pill');
            if (sosBtn) {
                sosBtn.setAttribute('aria-label', 'Appel SOS urgence');
                sosBtn.onclick = () => sheetManager.open('sos');
            } else {
                this.attachSosBtnTimer = setTimeout(attachSosBtn, 500);
            }
        };
        attachSosBtn();
    }

    public override dispose(): void {
        if (this.attachSosBtnTimer) {
            clearTimeout(this.attachSosBtnTimer);
            this.attachSosBtnTimer = null;
        }
        super.dispose();
    }

    private async resolveAndDisplay(): Promise<void> {
        const textContainer = document.getElementById('sos-text-container');
        if (!textContainer) return;

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

        const message = `🆘 SOS SUNTRAIL: ${lat.toFixed(5)},${lon.toFixed(5)} | ALT:${Math.round(alt)}m | BAT:${bat}% | ${time}`;
        textContainer.textContent = message;

        const smsBtn = document.getElementById('sos-sms-btn') as HTMLButtonElement | null;
        if (smsBtn) {
            smsBtn.disabled = false;
            smsBtn.onclick = () => {
                window.open(`sms:?body=${encodeURIComponent(message)}`);
            };
        }
    }
}
