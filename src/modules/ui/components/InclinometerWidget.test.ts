import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InclinometerWidget } from './InclinometerWidget';
import { state } from '../../state';
import { getAltitudeAt } from '../../analysis';

vi.mock('../../analysis', () => ({
    getAltitudeAt: vi.fn(() => 1000),
    findTerrainIntersection: vi.fn(() => ({ x: 0, y: 1000, z: 0 })),
}));

vi.mock('../../iap', () => ({
    showUpgradePrompt: vi.fn(),
}));

vi.mock('../../geo', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../geo')>();
    return {
        ...actual,
        lngLatToWorld: vi.fn(() => ({ x: 0, z: 0 })),
    };
});

describe('InclinometerWidget', () => {
    let widget: InclinometerWidget;

    beforeEach(() => {
        vi.useFakeTimers();
        state.isPro = true;
        state.ZOOM = 14;
        state.SHOW_INCLINOMETER = true;
        state.isFollowingUser = false;
        state.IS_2D_MODE = false;
        state.camera = { position: { x: 0, y: 100, z: 0 } } as any;
        state.controls = { target: { x: 0, y: 0, z: 0 } } as any;
        state.originTile = {
            x: 0,
            y: 0,
            worldX: 0,
            worldZ: 0,
            tileSizeMeters: 1000,
        } as any;
        state.userLocation = { lat: 45, lon: 6, alt: 1000 };
        state.userHeading = 0;
        state.RELIEF_EXAGGERATION = 1.0;

        widget = new InclinometerWidget();
        widget.init();
    });

    afterEach(() => {
        widget.dispose();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('should create DOM elements on init', () => {
        const el = document.getElementById('inclinometer-widget');
        const reticle = document.getElementById('inclinometer-reticle');
        expect(el).not.toBeNull();
        expect(reticle).not.toBeNull();
        expect(el?.tagName).toBe('BUTTON');
        expect(reticle?.tagName).toBe('BUTTON');
        expect(el?.getAttribute('aria-expanded')).toBe('false');
        expect(reticle?.getAttribute('aria-label')).toBeTruthy();
    });

    it('should display correct format in Free Look mode', () => {
        (getAltitudeAt as any).mockImplementation((x: number, _z: number) => {
            if (x > 0.1) return 1002;
            if (x < -0.1) return 998;
            return 1000;
        });

        vi.advanceTimersByTime(200);

        const el = document.getElementById('inclinometer-widget')!;
        expect(el.textContent).toContain('45° (100%)');
        expect(el.textContent).not.toContain('⛰');
    });

    it('should display correct format in Follow Mode with path slope', () => {
        state.isFollowingUser = true;
        state.userHeading = 90;

        (getAltitudeAt as any).mockImplementation((_x: number, z: number) => {
            if (z > 0.1) return 1002;
            if (z < -0.1) return 998;
            return 1000;
        });

        vi.advanceTimersByTime(200);

        const el = document.getElementById('inclinometer-widget')!;
        expect(el.textContent).toContain('0% · max. 100%');
        expect(el.textContent).not.toContain('📈');
    });

    it('keeps the summary anchored instead of exposing a hidden drag gesture', () => {
        const el = document.getElementById('inclinometer-widget')!;
        el.dispatchEvent(
            new PointerEvent('pointerdown', { clientX: 100, clientY: 100 })
        );
        vi.advanceTimersByTime(300);
        window.dispatchEvent(
            new PointerEvent('pointermove', { clientX: 180, clientY: 180 })
        );
        window.dispatchEvent(new PointerEvent('pointerup'));

        expect(el.style.left).toBe('');
        expect(el.style.top).toBe('');
    });

    it('places the same slope control inside Guidance and restores it afterwards', () => {
        document.body.insertAdjacentHTML(
            'beforeend',
            '<div id="guidance-inclinometer-slot"></div>'
        );
        const internals = widget as unknown as {
            syncGuidanceHost(): void;
        };
        document.body.classList.add('guidance-active');
        internals.syncGuidanceHost();

        expect(
            document.getElementById('inclinometer-widget')?.parentElement
        ).toBe(document.getElementById('guidance-inclinometer-slot'));

        document.body.classList.remove('guidance-active');
        internals.syncGuidanceHost();
        expect(
            document.getElementById('inclinometer-widget')?.parentElement
        ).toBe(document.body);
    });

    it('should stay open when clicked (persistent detail)', () => {
        const el = document.getElementById('inclinometer-widget')!;

        el.click();

        let detail = document.getElementById('inclinometer-detail');
        expect(detail).not.toBeNull();
        expect(el.getAttribute('aria-expanded')).toBe('true');

        vi.advanceTimersByTime(10000);
        detail = document.getElementById('inclinometer-detail');
        expect(detail).not.toBeNull();
    });

    it('moves the reticle with arrow keys and resets it with Home', () => {
        const reticle = document.getElementById('inclinometer-reticle')!;
        reticle.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
        );
        expect(reticle.style.left).toBe(`${window.innerWidth / 2 + 8}px`);

        reticle.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Home', bubbles: true })
        );
        expect(reticle.style.left).toBe('50%');
        expect(reticle.style.top).toBe('50%');
    });

    it('masque l’inclinomètre en 2D et l’affiche en 3D', () => {
        const el = document.getElementById('inclinometer-widget')!;
        const reticle = document.getElementById('inclinometer-reticle')!;

        state.IS_2D_MODE = true;
        (widget as any).syncVisibility();
        expect(el.hidden).toBe(true);
        expect(reticle.hidden).toBe(true);

        state.IS_2D_MODE = false;
        (widget as any).syncVisibility();
        expect(el.hidden).toBe(false);
    });

    it('should display --° when no elevation data is available', () => {
        (getAltitudeAt as any).mockReturnValue(0);

        vi.advanceTimersByTime(200);

        const el = document.getElementById('inclinometer-widget')!;
        expect(el.textContent).toContain('—°');
    });
});
