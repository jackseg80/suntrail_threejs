import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InclinometerWidget } from './InclinometerWidget';
import { state } from '../../state';
import { getAltitudeAt } from '../../analysis';

vi.mock('../../analysis', () => ({
    getAltitudeAt: vi.fn(() => 1000),
    findTerrainIntersection: vi.fn(() => ({ x: 0, y: 1000, z: 0 }))
}));

vi.mock('../../iap', () => ({
    showUpgradePrompt: vi.fn()
}));

vi.mock('../../geo', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../geo')>();
    return {
        ...actual,
        lngLatToWorld: vi.fn(() => ({ x: 0, z: 0 }))
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
        state.camera = { position: { x: 0, y: 100, z: 0 } } as any;
        state.controls = { target: { x: 0, y: 0, z: 0 } } as any;
        state.originTile = { x: 0, y: 0, worldX: 0, worldZ: 0, tileSizeMeters: 1000 } as any;
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
    });

    it('should display correct format in Free Look mode', () => {
        (getAltitudeAt as any).mockImplementation((x: number, z: number) => {
            if (x > 0.1) return 1002; 
            if (x < -0.1) return 998;  
            return 1000;
        });

        vi.advanceTimersByTime(200);
        
        const el = document.getElementById('inclinometer-widget')!;
        expect(el.textContent).toContain('⛰ 45° (100%)');
    });

    it('should display correct format in Follow Mode with path slope', () => {
        state.isFollowingUser = true;
        state.userHeading = 90; 
        
        (getAltitudeAt as any).mockImplementation((x: number, z: number) => {
            if (z > 0.1) return 1002; 
            if (z < -0.1) return 998;  
            return 1000;
        });

        vi.advanceTimersByTime(200);
        
        const el = document.getElementById('inclinometer-widget')!;
        expect(el.textContent).toContain('📈 0% (max. 100%)');
    });

    it('should update positioning when timeline is open', async () => {
        const el = document.getElementById('inclinometer-widget')!;
        
        // Mock style.bottom setter because JSDOM doesn't store complex values like calc() well
        const spy = vi.spyOn(el.style, 'bottom', 'set');

        document.body.classList.remove('timeline-open');
        (widget as any).syncPosition(); 
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('16px'));

        document.body.classList.add('timeline-open');
        (widget as any).syncPosition();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('120px'));
    });

    it('should stay open when clicked (persistent detail)', () => {
        const el = document.getElementById('inclinometer-widget')!;
        
        el.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0 }));
        vi.advanceTimersByTime(250);
        window.dispatchEvent(new PointerEvent('pointerup'));

        let detail = document.getElementById('inclinometer-detail');
        expect(detail).not.toBeNull();

        vi.advanceTimersByTime(10000);
        detail = document.getElementById('inclinometer-detail');
        expect(detail).not.toBeNull();
    });
});
