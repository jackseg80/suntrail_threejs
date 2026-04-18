import { BaseComponent } from '../core/BaseComponent';
import { state, isProActive } from '../../state';
import { runSolarProbe, type SolarAnalysisResult } from '../../analysis';
import { showToast } from '../../toast';
import { sheetManager } from '../core/SheetManager';
import { i18n } from '../../../i18n/I18nService';
import { showUpgradePrompt } from '../../iap';
import { fmtTime, fmtDuration } from '../../utils';
import SunCalc from 'suncalc';
import { expertService } from '../../expertService';
import { getPlaceName } from '../../geocodingService';

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
                probeBtn.onclick = async () => {
                    if (state.hasLastClicked) {
                        const result = runSolarProbe(state.lastClickedCoords.x, state.lastClickedCoords.z, state.lastClickedCoords.alt);
                        if (result) {
                            this.currentResult = result;
                            this.updateUI(result);
                            sheetManager.open('solar-probe');
                            
                            // v5.30.16 : Résolution robuste avec timeout de 3s
                            const titleEl = document.getElementById('solar-location-title');
                            const timer = setTimeout(() => {
                                if (titleEl && titleEl.textContent?.includes('...')) {
                                    titleEl.textContent = `${result.gps.lat.toFixed(4)}, ${result.gps.lon.toFixed(4)}`;
                                }
                            }, 3000);

                            try {
                                const locName = await getPlaceName(result.gps.lat, result.gps.lon);
                                clearTimeout(timer);
                                if (locName && titleEl) titleEl.textContent = locName;
                                else if (titleEl) titleEl.textContent = `${result.gps.lat.toFixed(4)}, ${result.gps.lon.toFixed(4)}`;
                            } catch (e) {
                                if (titleEl) titleEl.textContent = `${result.gps.lat.toFixed(4)}, ${result.gps.lon.toFixed(4)}`;
                            }
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

        // ── Header (Location) ────────────────────────────────────────────────
        const locHeader = document.createElement('h3');
        locHeader.id = 'solar-location-title';
        locHeader.className = 'exp-location-title';
        locHeader.style.cssText = 'margin:0 0 var(--space-4); font-size:14px; color:var(--text-2); text-align:center;';
        locHeader.textContent = 'Analyse en cours...';
        this.contentEl.appendChild(locHeader);

        // ── Status ───────────────────────────────────────────────────────────
        const statusEl = document.createElement('div');
        statusEl.classList.add('exp-probe-status');
        statusEl.textContent = i18n.t('solar.status.done');
        this.contentEl.appendChild(statusEl);

        if (!isProActive()) {
            // ── FREE version ──────────────────────────────────────────────────
            const grid = document.createElement('div');
            grid.classList.add('exp-stat-grid', 'exp-probe-grid-mb');
            addStat(grid, i18n.t('solar.stat.sunlight'), fmtDuration(result.totalSunlightMinutes), '☀️');
            addStat(grid, i18n.t('solar.stat.firstRay'), fmtTime(result.firstSunTime), '🌅');
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
            rtMoonVal.textContent = `${expertService.getMoonEmoji(result.moonPhaseName)} ${Math.round(result.moonPhase * 100)}%`;
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
            
            addStat(grid1, i18n.t('solar.stat.dayDuration'), fmtDuration(result.dayDurationMinutes), '⏱️');
            addStat(grid1, i18n.t('solar.stat.sunlight'), fmtDuration(result.totalSunlightMinutes), '☀️');
            
            addStat(grid1, 'H. Dorée Matin',
                `${fmtTime(result.goldenHourMorningStart)} — ${fmtTime(result.goldenHourMorningEnd)}`, '🌅');
            addStat(grid1, 'H. Dorée Soir',
                `${fmtTime(result.goldenHourEveningStart)} — ${fmtTime(result.goldenHourEveningEnd)}`, '🌇');
            
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
            txt.textContent = `${label} ${fmtTime(date)}`;

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
        const report = expertService.generateSolarReport(result);
        navigator.clipboard.writeText(report);
        showToast(i18n.t('solar.toast.copied'));
    }
}
