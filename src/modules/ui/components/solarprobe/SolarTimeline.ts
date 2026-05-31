import { i18n } from '../../../../i18n/I18nService';
import type { SolarAnalysisResult } from '../../../analysis';

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
    result.timeline.forEach((t) => {
        const bar = document.createElement('div');
        bar.classList.add('exp-timeline-bar');
        if (t.isNight) {
            bar.style.background = '#000';
        } else if (t.inShadow) {
            bar.style.background = 'rgba(255,80,80,0.3)';
        } else {
            bar.style.background = 'var(--gold)';
        }
        timelineContainer.appendChild(bar);
    });
    parent.appendChild(timelineContainer);
}
