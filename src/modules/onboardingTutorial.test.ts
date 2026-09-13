import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockT, mockHaptic } = vi.hoisted(() => {
    const mockT = vi.fn(
        (key: string, vars?: Record<string, string>): string => {
            const defaults: Record<string, string> = {
                'onboarding.skip': 'Passer',
                'onboarding.next': 'Suivant',
                'onboarding.finish': 'Terminer',
                'onboarding.step': `Prise en main ${vars?.current}/${vars?.total}`,
                'onboarding.map.title': 'La carte est votre point de départ',
                'onboarding.map.desc': 'La carte reste active.',
                'onboarding.map.drag': 'Faites glisser',
                'onboarding.map.zoom': 'Pincez',
                'onboarding.map.tilt': 'Inclinez',
                'onboarding.relief.title': 'Comparez la carte et le relief',
                'onboarding.relief.desc': 'Touchez le bouton 2D/3D.',
            };
            return defaults[key] || key;
        }
    );
    return { mockT, mockHaptic: vi.fn() };
});

vi.mock('../i18n/I18nService', () => ({
    i18n: { t: mockT },
}));

vi.mock('./haptics', () => ({
    haptic: mockHaptic,
}));

import { requestOnboarding, showOnboarding } from './onboardingTutorial';

describe('onboardingTutorial — live map tour', () => {
    const ONBOARDING_KEY = 'suntrail_onboarding_v3';

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        document.body.innerHTML = `
            <main><div id="canvas-container"></div></main>
            <button id="top-pill-lod">Détail 6</button>
            <button id="nav-2d-toggle">2D</button>
        `;
    });

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('does not show again after the v3 tour was completed', async () => {
        localStorage.setItem(ONBOARDING_KEY, '1');
        await requestOnboarding();
        expect(document.getElementById('onboarding-overlay')).toBeNull();
    });

    it('offers the redesigned tour to users who only completed v2', () => {
        localStorage.setItem('suntrail_onboarding_v2', '1');
        void requestOnboarding();
        expect(document.getElementById('onboarding-overlay')).not.toBeNull();
    });

    it('persists v3 when the visit is skipped', async () => {
        vi.useFakeTimers();
        const promise = requestOnboarding();
        document.getElementById('ob-skip')?.click();
        vi.advanceTimersByTime(300);
        await promise;
        expect(localStorage.getItem(ONBOARDING_KEY)).toBe('1');
        expect(document.getElementById('onboarding-overlay')).toBeNull();
    });

    it('starts on the real map with its three gestures', () => {
        void showOnboarding();
        expect(document.getElementById('ob-title')?.textContent).toBe(
            'La carte est votre point de départ'
        );
        expect(document.querySelectorAll('.ob-gestures li')).toHaveLength(3);
        expect(
            document
                .getElementById('canvas-container')
                ?.classList.contains('onboarding-live-target')
        ).toBe(true);
        expect(document.querySelector('.ob-menu-item')).toBeNull();
        expect(document.querySelector('.ob-dot')).toBeNull();
    });

    it('is a non-modal dialog so the real map stays usable', () => {
        void showOnboarding();
        const overlay = document.getElementById('onboarding-overlay')!;
        expect(overlay.getAttribute('role')).toBe('dialog');
        expect(overlay.hasAttribute('aria-modal')).toBe(false);
        expect(overlay.querySelector('style')).toBeNull();
    });

    it('moves the highlight to the real 2D/3D control', () => {
        void showOnboarding();
        document.getElementById('ob-next')?.click();

        expect(document.getElementById('ob-title')?.textContent).toBe(
            'Comparez la carte et le relief'
        );
        expect(
            document
                .getElementById('nav-2d-toggle')
                ?.classList.contains('onboarding-live-target')
        ).toBe(true);
        expect(document.getElementById('ob-next')?.textContent).toBe(
            'Terminer'
        );
    });

    it('finishes when the highlighted 2D/3D control is tried', async () => {
        vi.useFakeTimers();
        const promise = showOnboarding();
        document.getElementById('ob-next')?.click();
        document.getElementById('nav-2d-toggle')?.click();
        vi.advanceTimersByTime(300);
        await promise;
        expect(document.getElementById('onboarding-overlay')).toBeNull();
    });

    it('explains zoom level instead of asking for unavailable 3D', () => {
        const modeToggle = document.getElementById(
            'nav-2d-toggle'
        ) as HTMLButtonElement;
        modeToggle.disabled = true;

        void showOnboarding();
        document.getElementById('ob-next')?.click();

        expect(mockT).toHaveBeenCalledWith('onboarding.detail.title');
        expect(
            document
                .getElementById('top-pill-lod')
                ?.classList.contains('onboarding-live-target')
        ).toBe(true);
        expect(modeToggle.classList.contains('onboarding-live-target')).toBe(
            false
        );
    });

    it('supports Escape without trapping the rest of the product', async () => {
        vi.useFakeTimers();
        const promise = showOnboarding();
        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        );
        vi.advanceTimersByTime(300);
        await promise;
        expect(document.getElementById('onboarding-overlay')).toBeNull();
    });
});
