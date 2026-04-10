import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InclinometerWidget } from './InclinometerWidget';
import { state } from '../../state';

vi.mock('../../analysis', () => ({
    getAltitudeAt: vi.fn(() => 1000),
    findTerrainIntersection: vi.fn(() => ({ x: 0, y: 1000, z: 0 }))
}));

vi.mock('../../iap', () => ({
    showUpgradePrompt: vi.fn()
}));

vi.mock('../../geo', () => ({
    lngLatToWorld: vi.fn(() => ({ x: 0, z: 0 }))
}));

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

    it('should hide reticle when following user', async () => {
        state.isFollowingUser = true;
        await Promise.resolve(); // Attendre microtask notification
        const reticle = document.getElementById('inclinometer-reticle');
        expect(reticle?.style.display).toBe('none');
    });

    it('should show reticle when not following user', async () => {
        state.isFollowingUser = false;
        await Promise.resolve();
        const reticle = document.getElementById('inclinometer-reticle');
        expect(reticle?.style.display).toBe('block');
    });

    it('should reset reticle when following user becomes true', async () => {
        const reticle = document.getElementById('inclinometer-reticle')!;
        reticle.style.left = '100px';
        state.isFollowingUser = true;
        await Promise.resolve();
        expect(reticle.style.left).toBe('50%');
    });
});
