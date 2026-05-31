import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { state } from '../../state';

const mockUpdateSunPosition = vi.fn();

vi.mock('../../sun', () => ({ updateSunPosition: mockUpdateSunPosition }));
vi.mock('../../iap', () => ({
    showUpgradePrompt: vi.fn(),
    isProActive: vi.fn().mockReturnValue(false),
}));
vi.mock('../../haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../toast', () => ({ showToast: vi.fn() }));
vi.mock('../../geo', () => ({
    worldToLngLat: vi.fn().mockReturnValue({ lat: 46.8, lon: 8.2 }),
}));
vi.mock('../../state', async () => {
    const { createReactiveState } = await import('../../ui/core/ReactiveState');
    const initial = {
        simDate: new Date(2024, 5, 21, 12, 0, 0),
        isSunAnimating: false,
        animationSpeed: 1.0,
        isPro: false,
        trialEnd: null,
        IS_2D_MODE: false,
        isInteractingWithUI: false,
        controls: null,
        hasLastClicked: false,
        lastClickedCoords: { x: 0, z: 0 },
        originTile: { x: 0, y: 0 },
        SHOW_WEATHER: false,
        ZOOM: 14,
    };
    const reactiveState = createReactiveState(initial as any);
    return {
        state: reactiveState,
        isProActive: vi.fn().mockReturnValue(false),
        saveLastView: vi.fn(),
    };
});
vi.mock('../draggablePanel', () => ({
    attachDraggablePanel: vi.fn().mockReturnValue(() => {}),
}));
vi.mock('../../../i18n/I18nService', () => ({
    i18n: { t: (k: string) => k },
}));
vi.mock('suncalc', () => ({
    default: {
        getPosition: vi.fn().mockReturnValue({ altitude: 0.5, azimuth: 1.2 }),
    },
}));

function buildDOM() {
    document.body.innerHTML = `
        <input id="time-slider" type="range" min="0" max="1439" value="720" />
        <input id="date-input" type="date" value="2024-06-21" />
        <button id="play-btn">▶</button>
        <select id="speed-select"><option value="1">1x</option><option value="2">2x</option></select>
        <button id="timeline-toggle-btn"></button>
        <div id="bottom-bar"></div>
    `;
}

describe('TimelineComponent', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        buildDOM();
        mockUpdateSunPosition.mockClear();
        state.simDate = new Date(2024, 5, 21, 12, 0, 0);
        state.isSunAnimating = false;
        state.animationSpeed = 1.0;
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    describe('syncUI — slider', () => {
        it('met à jour le slider même quand isSunAnimating est true', async () => {
            const { TimelineComponent } = await import('./TimelineComponent');
            const comp = new TimelineComponent();
            const slider = document.getElementById(
                'time-slider'
            ) as HTMLInputElement;

            state.isSunAnimating = true;
            state.simDate = new Date(2024, 5, 21, 14, 30, 0);

            await Promise.resolve();
            await Promise.resolve();

            expect(slider.value).toBe((14 * 60 + 30).toString());
            comp.dispose();
        });

        it('met à jour le slider quand isSunAnimating est false', async () => {
            const { TimelineComponent } = await import('./TimelineComponent');
            const comp = new TimelineComponent();
            const slider = document.getElementById(
                'time-slider'
            ) as HTMLInputElement;

            state.isSunAnimating = false;
            state.simDate = new Date(2024, 5, 21, 8, 15, 0);

            await Promise.resolve();
            await Promise.resolve();

            expect(slider.value).toBe((8 * 60 + 15).toString());
            comp.dispose();
        });
    });

    describe('subscriber simDate — appel updateSunPosition', () => {
        it('appelle updateSunPosition quand isSunAnimating est false (slider manuel)', async () => {
            const { TimelineComponent } = await import('./TimelineComponent');
            const comp = new TimelineComponent();

            state.isSunAnimating = false;
            state.simDate = new Date(2024, 5, 21, 15, 0, 0);

            await Promise.resolve();
            await Promise.resolve();

            expect(mockUpdateSunPosition).toHaveBeenCalledWith(15 * 60);
            comp.dispose();
        });

        it("n'appelle pas updateSunPosition depuis le subscriber quand isSunAnimating est true (la boucle de rendu s'en charge)", async () => {
            const { TimelineComponent } = await import('./TimelineComponent');
            const comp = new TimelineComponent();

            state.isSunAnimating = true;
            mockUpdateSunPosition.mockClear();

            state.simDate = new Date(2024, 5, 21, 16, 0, 0);

            await Promise.resolve();
            await Promise.resolve();

            expect(mockUpdateSunPosition).not.toHaveBeenCalled();
            comp.dispose();
        });
    });

    describe('bouton play/pause', () => {
        it('affiche ⏸ quand isSunAnimating passe à true', async () => {
            const { TimelineComponent } = await import('./TimelineComponent');
            const comp = new TimelineComponent();
            const btn = document.getElementById('play-btn')!;

            state.isSunAnimating = true;
            await Promise.resolve();

            expect(btn.textContent).toBe('⏸');
            comp.dispose();
        });

        it('affiche ▶ quand isSunAnimating passe à false', async () => {
            const { TimelineComponent } = await import('./TimelineComponent');
            const comp = new TimelineComponent();
            const btn = document.getElementById('play-btn')!;

            state.isSunAnimating = true;
            await Promise.resolve();
            state.isSunAnimating = false;
            await Promise.resolve();

            expect(btn.textContent).toBe('▶');
            comp.dispose();
        });
    });

    describe('dispose', () => {
        it('désabonne tous les subscribers sans erreur', async () => {
            const { TimelineComponent } = await import('./TimelineComponent');
            const comp = new TimelineComponent();
            expect(() => comp.dispose()).not.toThrow();
        });
    });
});
