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

    it('marks sunlit bars', () => {
        buildTimeline(
            parent,
            makeResult([{ isNight: false, inShadow: false }])
        );
        const bar = parent.querySelector('.exp-timeline-bar') as HTMLElement;
        expect(bar.dataset.phase).toBe('sun');
    });

    it('marks shadow bars', () => {
        buildTimeline(parent, makeResult([{ isNight: false, inShadow: true }]));
        const bar = parent.querySelector('.exp-timeline-bar') as HTMLElement;
        expect(bar.dataset.phase).toBe('shadow');
    });

    it('marks night bars', () => {
        buildTimeline(parent, makeResult([{ isNight: true, inShadow: false }]));
        const bar = parent.querySelector('.exp-timeline-bar') as HTMLElement;
        expect(bar.dataset.phase).toBe('night');
    });

    it('handles empty timeline array gracefully', () => {
        buildTimeline(parent, makeResult([]));
        const bars = parent.querySelectorAll('.exp-timeline-bar');
        expect(bars).toHaveLength(0);
    });

    it('labels each bar with its half-hour and phase', () => {
        buildTimeline(
            parent,
            makeResult([
                { isNight: false, inShadow: false },
                { isNight: false, inShadow: true },
                { isNight: true, inShadow: false },
            ])
        );
        const bars = Array.from(
            parent.querySelectorAll<HTMLElement>('.exp-timeline-bar')
        );
        expect(bars.map((b) => b.title)).toEqual([
            '00:00 — profile.sun',
            '00:30 — profile.shade',
            '01:00 — profile.night',
        ]);
    });

    it('exposes a summary aria-label on the frise', () => {
        buildTimeline(
            parent,
            makeResult([
                { isNight: false, inShadow: false },
                { isNight: false, inShadow: true },
                { isNight: true, inShadow: false },
            ])
        );
        const container = parent.querySelector('.exp-timeline') as HTMLElement;
        expect(container.getAttribute('role')).toBe('img');
        expect(container.getAttribute('aria-label')).toContain('0.5h');
    });

    it('adds an hour axis', () => {
        buildTimeline(parent, makeResult([]));
        const ticks = parent.querySelectorAll('.exp-timeline-axis span');
        expect(Array.from(ticks).map((t) => t.textContent)).toEqual([
            '0h',
            '6h',
            '12h',
            '18h',
            '24h',
        ]);
    });

    it('adds a legend for sun, shadow and night', () => {
        buildTimeline(parent, makeResult([]));
        const items = Array.from(
            parent.querySelectorAll<HTMLElement>('.exp-timeline-legend-item')
        );
        expect(items).toHaveLength(3);
        expect(items.map((i) => i.textContent)).toEqual([
            'profile.sun',
            'profile.shade',
            'profile.night',
        ]);
        expect(
            parent.querySelectorAll('.exp-timeline-legend-swatch')
        ).toHaveLength(3);
    });
});
