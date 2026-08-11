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
vi.mock('../../suncalcCompat', () => ({
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
        state.IS_2D_MODE = false;
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        document.body.innerHTML = '';
        document.body.className = '';
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

    describe('ancrage sous les panneaux hauts', () => {
        const rect = (top: number, bottom: number, width = 320) =>
            ({
                top,
                bottom,
                width,
                height: bottom - top,
                left: 0,
                right: width,
                x: 0,
                y: top,
                toJSON: () => ({}),
            }) as DOMRect;

        it('place la timeline sous le résumé de Préparer visible', async () => {
            document.body.insertAdjacentHTML(
                'afterbegin',
                '<div id="top-status-bar"></div><div id="route-plan-hud" style="display:block;opacity:1"></div>'
            );
            vi.spyOn(
                document.getElementById('top-status-bar')!,
                'getBoundingClientRect'
            ).mockReturnValue(rect(0, 52));
            vi.spyOn(
                document.getElementById('route-plan-hud')!,
                'getBoundingClientRect'
            ).mockReturnValue(rect(58, 126));

            const { TimelineComponent } = await import('./TimelineComponent');
            const comp = new TimelineComponent();
            (
                document.getElementById(
                    'timeline-toggle-btn'
                ) as HTMLButtonElement
            ).click();

            expect(
                document
                    .getElementById('bottom-bar')!
                    .style.getPropertyValue('--timeline-top')
            ).toBe('134px');
            comp.dispose();
        });

        it('place la timeline sous le résumé réduit du guidage', async () => {
            document.body.insertAdjacentHTML(
                'afterbegin',
                '<div id="top-status-bar"></div><section class="guidance-foreground" style="display:block;opacity:1"></section>'
            );
            document.body.classList.add('guidance-profile-open');
            vi.spyOn(
                document.getElementById('top-status-bar')!,
                'getBoundingClientRect'
            ).mockReturnValue(rect(0, 52));
            vi.spyOn(
                document.querySelector('.guidance-foreground')!,
                'getBoundingClientRect'
            ).mockReturnValue(rect(62, 118));

            const { TimelineComponent } = await import('./TimelineComponent');
            const comp = new TimelineComponent();
            (
                document.getElementById(
                    'timeline-toggle-btn'
                ) as HTMLButtonElement
            ).click();

            expect(
                document
                    .getElementById('bottom-bar')!
                    .style.getPropertyValue('--timeline-top')
            ).toBe('126px');
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

    describe('IS_2D_MODE — mémorisation état timebar (v5.57.2)', () => {
        it('ferme la timebar en passant en 2D', async () => {
            const { TimelineComponent } = await import('./TimelineComponent');
            const comp = new TimelineComponent();
            const bottomBar = document.getElementById('bottom-bar')!;

            state.IS_2D_MODE = false;
            await Promise.resolve();
            bottomBar.classList.add('is-open');

            state.IS_2D_MODE = true;
            await Promise.resolve();

            expect(bottomBar.classList.contains('is-open')).toBe(false);
            comp.dispose();
        });

        it("garde la timebar fermée en 3D si elle l'était avant le passage en 2D", async () => {
            const { TimelineComponent } = await import('./TimelineComponent');
            const comp = new TimelineComponent();
            const bottomBar = document.getElementById('bottom-bar')!;
            const toggleBtn = document.getElementById('timeline-toggle-btn')!;

            state.IS_2D_MODE = false;
            await Promise.resolve();
            bottomBar.classList.remove('is-open');
            toggleBtn.classList.remove('active');

            state.IS_2D_MODE = true;
            await Promise.resolve();

            state.IS_2D_MODE = false;
            await Promise.resolve();

            expect(bottomBar.classList.contains('is-open')).toBe(false);
            expect(toggleBtn.classList.contains('active')).toBe(false);
            comp.dispose();
        });

        it("restaure l'état ouvert de la timebar en revenant en 3D", async () => {
            const { TimelineComponent } = await import('./TimelineComponent');
            const comp = new TimelineComponent();
            const bottomBar = document.getElementById('bottom-bar')!;
            const toggleBtn = document.getElementById('timeline-toggle-btn')!;

            state.IS_2D_MODE = false;
            await Promise.resolve();
            bottomBar.classList.add('is-open');
            toggleBtn.classList.add('active');

            state.IS_2D_MODE = true;
            await Promise.resolve();
            expect(bottomBar.classList.contains('is-open')).toBe(false);

            state.IS_2D_MODE = false;
            await Promise.resolve();

            expect(bottomBar.classList.contains('is-open')).toBe(true);
            expect(toggleBtn.classList.contains('active')).toBe(true);
            comp.dispose();
        });

        it("maintient l'état à travers plusieurs transitions 2D↔3D", async () => {
            const { TimelineComponent } = await import('./TimelineComponent');
            const comp = new TimelineComponent();
            const bottomBar = document.getElementById('bottom-bar')!;

            state.IS_2D_MODE = false;
            await Promise.resolve();
            bottomBar.classList.remove('is-open');

            state.IS_2D_MODE = true;
            await Promise.resolve();
            state.IS_2D_MODE = false;
            await Promise.resolve();
            expect(bottomBar.classList.contains('is-open')).toBe(false);

            bottomBar.classList.add('is-open');
            state.IS_2D_MODE = true;
            await Promise.resolve();
            state.IS_2D_MODE = false;
            await Promise.resolve();
            expect(bottomBar.classList.contains('is-open')).toBe(true);

            comp.dispose();
        });
    });
});
