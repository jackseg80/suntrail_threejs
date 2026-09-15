import { i18n } from '../../../../i18n/I18nService';
import type { SolarAnalysisResult } from '../../../analysis';

const HOUR_TICKS = [0, 6, 12, 18, 24];

export function buildTimeline(
    parent: HTMLElement,
    result: SolarAnalysisResult
): void {
    const timelineTitle = document.createElement('div');
    timelineTitle.classList.add('exp-timeline-title');
    timelineTitle.textContent = i18n.t('solar.stat.evolution');
    parent.appendChild(timelineTitle);

    const timelineContainer = document.createElement('div');
    timelineContainer.classList.add('exp-timeline');
    let sunHalfHours = 0;
    let shadowHalfHours = 0;
    let nightHalfHours = 0;
    result.timeline.forEach((t, i) => {
        const bar = document.createElement('div');
        bar.classList.add('exp-timeline-bar');
        let labelKey: string;
        if (t.isNight) {
            bar.dataset.phase = 'night';
            nightHalfHours++;
            labelKey = 'profile.night';
        } else if (t.inShadow) {
            bar.dataset.phase = 'shadow';
            shadowHalfHours++;
            labelKey = 'profile.shade';
        } else {
            bar.dataset.phase = 'sun';
            sunHalfHours++;
            labelKey = 'profile.sun';
        }
        const mm = i * 30;
        const hh = String(Math.floor(mm / 60)).padStart(2, '0');
        const mn = String(mm % 60).padStart(2, '0');
        bar.title = `${hh}:${mn} — ${i18n.t(labelKey)}`;
        timelineContainer.appendChild(bar);
    });
    timelineContainer.setAttribute('role', 'img');
    timelineContainer.setAttribute(
        'aria-label',
        `${i18n.t('solar.stat.evolution')}: ${sunHalfHours / 2}h ${i18n.t('profile.sun')}, ${shadowHalfHours / 2}h ${i18n.t('profile.shade')}, ${nightHalfHours / 2}h ${i18n.t('profile.night')}`
    );
    parent.appendChild(timelineContainer);

    const axis = document.createElement('div');
    axis.classList.add('exp-timeline-axis');
    axis.setAttribute('aria-hidden', 'true');
    HOUR_TICKS.forEach((hour) => {
        const tick = document.createElement('span');
        tick.textContent = `${hour}h`;
        axis.appendChild(tick);
    });
    parent.appendChild(axis);

    const legend = document.createElement('div');
    legend.classList.add('exp-timeline-legend');
    const addLegendItem = (phase: string, labelKey: string) => {
        const item = document.createElement('span');
        item.classList.add('exp-timeline-legend-item');
        const swatch = document.createElement('span');
        swatch.classList.add('exp-timeline-legend-swatch');
        swatch.dataset.phase = phase;
        const label = document.createElement('span');
        label.textContent = i18n.t(labelKey);
        item.append(swatch, label);
        legend.appendChild(item);
    };
    addLegendItem('sun', 'profile.sun');
    addLegendItem('shadow', 'profile.shade');
    addLegendItem('night', 'profile.night');
    parent.appendChild(legend);
}
