import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildTimeline } from './SolarTimeline';

vi.mock('../../../../i18n/I18nService', () => ({
    i18n: { t: (k: string) => k },
}));

describe('buildTimeline()', () => {
    let parent: HTMLElement;

    beforeEach(() => {
        parent = document.createElement('div');
    });

    function makeResult(
        timeline: Array<{ isNight: boolean; inShadow: boolean }>
    ) {
        return { timeline } as any;
    }

    it('adds a title element', () => {
        buildTimeline(parent, makeResult([]));
        const title = parent.querySelector('.exp-timeline-title');
        expect(title).not.toBeNull();
        expect(title!.textContent).toBe('solar.stat.evolution');
    });

    it('adds a timeline container', () => {
        buildTimeline(parent, makeResult([]));
        const container = parent.querySelector('.exp-timeline');
        expect(container).not.toBeNull();
    });

    it('creates a bar for each timeline entry', () => {
        buildTimeline(
            parent,
            makeResult([
                { isNight: false, inShadow: false },
                { isNight: false, inShadow: true },
                { isNight: true, inShadow: false },
            ])
        );
        const bars = parent.querySelectorAll('.exp-timeline-bar');
        expect(bars).toHaveLength(3);
    });

    it('sets gold background for sunlit bars', () => {
        buildTimeline(
            parent,
            makeResult([{ isNight: false, inShadow: false }])
        );
        const bar = parent.querySelector('.exp-timeline-bar') as HTMLElement;
        expect(bar.style.background).toBe('var(--gold)');
    });

    it('sets red background for shadow bars', () => {
        buildTimeline(parent, makeResult([{ isNight: false, inShadow: true }]));
        const bar = parent.querySelector('.exp-timeline-bar') as HTMLElement;
        const bg = bar.style.background.replace(/\s+/g, '');
        expect(bg).toBe('rgba(255,80,80,0.3)');
    });

    it('sets black background for night bars', () => {
        buildTimeline(parent, makeResult([{ isNight: true, inShadow: false }]));
        const bar = parent.querySelector('.exp-timeline-bar') as HTMLElement;
        expect(bar.style.background).toBe('#000');
    });

    it('handles empty timeline array gracefully', () => {
        buildTimeline(parent, makeResult([]));
        const bars = parent.querySelectorAll('.exp-timeline-bar');
        expect(bars).toHaveLength(0);
    });
});
