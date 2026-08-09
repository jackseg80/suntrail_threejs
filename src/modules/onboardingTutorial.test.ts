import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockT, mockHaptic } = vi.hoisted(() => {
    const mockT = vi.fn((key: string) => {
        const defaults: Record<string, string> = {
            'onboarding.slide1.title': 'Bienvenue',
            'onboarding.slide1.desc': 'SunTrail est votre compagnon.',
            'onboarding.slide2.title': 'Préparer',
            'onboarding.slide2.desc': 'Posez vos points.',
            'onboarding.slide3.title': 'Confiance',
            'onboarding.slide3.desc': 'Vérifiez les conditions.',
            'onboarding.skip': 'Passer',
            'onboarding.next': 'Suivant',
            'onboarding.start': 'Commencer',
            'onboarding.explore': 'Explorer',
            'onboarding.prepareRoute': 'Planifier un itinéraire',
            'onboarding.importGpx': 'Importer',
            'onboarding.searchPeak': 'Chercher',
        };
        return defaults[key] || key;
    });
    const mockHaptic = vi.fn();
    return { mockT, mockHaptic };
});

vi.mock('../i18n/I18nService', () => ({
    i18n: { t: mockT },
}));

vi.mock('./haptics', () => ({
    haptic: mockHaptic,
}));

import { requestOnboarding, showOnboarding } from './onboardingTutorial';

describe('onboardingTutorial', () => {
    const ONBOARDING_KEY = 'suntrail_onboarding_v2';

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('requestOnboarding', () => {
        it('should resolve immediately if onboarding already completed', async () => {
            localStorage.setItem(ONBOARDING_KEY, '1');
            const result = await requestOnboarding();
            expect(result).toBeUndefined();
            expect(document.getElementById('onboarding-overlay')).toBeNull();
        });

        it('should show overlay when not yet completed', async () => {
            void requestOnboarding();
            await vi.waitFor(() => {
                expect(
                    document.getElementById('onboarding-overlay')
                ).not.toBeNull();
            });
        });

        it('should persist the flag after completion via skip', async () => {
            vi.useFakeTimers();
            const promise = requestOnboarding();
            await vi.waitFor(() => {
                expect(document.getElementById('ob-skip')).not.toBeNull();
            });

            const skipBtn = document.getElementById('ob-skip')!;
            skipBtn.click();

            // v6.0 uses 400ms transition
            vi.advanceTimersByTime(500);

            await promise;
            expect(localStorage.getItem(ONBOARDING_KEY)).toBe('1');
            expect(document.getElementById('onboarding-overlay')).toBeNull();
            vi.useRealTimers();
        });

        it('should persist the flag after completion via finishing all slides', async () => {
            vi.useFakeTimers();
            const promise = requestOnboarding();
            await vi.waitFor(() => {
                expect(document.getElementById('ob-next')).not.toBeNull();
            });

            const nextBtn = document.getElementById('ob-next')!;
            // v5.82.0 has 3 slides (2 "Next" clicks)
            for (let i = 0; i < 2; i++) {
                nextBtn.click();
            }

            // Last click should close (button should say "Commencer")
            nextBtn.click();
            vi.advanceTimersByTime(500);

            await promise;
            expect(localStorage.getItem(ONBOARDING_KEY)).toBe('1');
            expect(document.getElementById('onboarding-overlay')).toBeNull();
            vi.useRealTimers();
        });
    });

    describe('showOnboarding', () => {
        it('should always show overlay regardless of localStorage flag', async () => {
            localStorage.setItem(ONBOARDING_KEY, '1');
            void showOnboarding();
            await vi.waitFor(() => {
                expect(
                    document.getElementById('onboarding-overlay')
                ).not.toBeNull();
            });
        });

        it('should render first slide content', async () => {
            void showOnboarding();
            await vi.waitFor(() => {
                expect(document.getElementById('ob-title')).not.toBeNull();
            });

            const title = document.getElementById('ob-title')!;
            expect(title.textContent).toBe('Bienvenue');
        });

        it('should render 3 dot indicators', async () => {
            void showOnboarding();
            await vi.waitFor(() => {
                expect(document.getElementById('ob-dots')).not.toBeNull();
            });

            const dots = document.querySelectorAll('.ob-dot');
            expect(dots.length).toBe(3);
        });

        it('should highlight first dot as active', async () => {
            void showOnboarding();
            await vi.waitFor(() => {
                expect(document.getElementById('ob-dots')).not.toBeNull();
            });

            const dots = document.querySelectorAll('.ob-dot');
            expect(dots[0].classList.contains('ob-dot--active')).toBe(true);
            expect(dots[1].classList.contains('ob-dot--active')).toBe(false);
        });

        it('should navigate to next slide on button click', async () => {
            void showOnboarding();
            await vi.waitFor(() => {
                expect(document.getElementById('ob-next')).not.toBeNull();
            });

            const nextBtn = document.getElementById('ob-next')!;
            nextBtn.click();

            await vi.waitFor(() => {
                const dots = document.querySelectorAll('.ob-dot');
                expect(dots[1].classList.contains('ob-dot--active')).toBe(true);
            });
        });

        it('should show "Start" button text on last slide', async () => {
            void showOnboarding();
            await vi.waitFor(() => {
                expect(document.getElementById('ob-next')).not.toBeNull();
            });

            const nextBtn = document.getElementById('ob-next')!;
            // Navigate to slide 3 (0-indexed, last is 2)
            for (let i = 0; i < 2; i++) {
                nextBtn.click();
            }

            expect(nextBtn.textContent).toContain('Commencer');
        });

        it('should render final menu on last slide', async () => {
            void showOnboarding();
            await vi.waitFor(() => {
                expect(document.getElementById('ob-next')).not.toBeNull();
            });

            const nextBtn = document.getElementById('ob-next')!;
            for (let i = 0; i < 2; i++) {
                nextBtn.click();
            }

            const menuItems = document.querySelectorAll('.ob-menu-item');
            expect(menuItems.length).toBe(3);
            expect(menuItems[0].textContent).toContain('Explorer');
            expect(menuItems[1].textContent).toContain(
                'Planifier un itinéraire'
            );
            menuItems.forEach((item) => expect(item.tagName).toBe('BUTTON'));
        });

        it('uses an accessible modal dialog and supports Escape', async () => {
            vi.useFakeTimers();
            const promise = showOnboarding();
            const overlay = document.getElementById('onboarding-overlay')!;
            expect(overlay.getAttribute('role')).toBe('dialog');
            expect(overlay.getAttribute('aria-modal')).toBe('true');
            expect(overlay.getAttribute('aria-labelledby')).toBe('ob-title');

            overlay.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
            );
            await promise;
            vi.advanceTimersByTime(500);
            expect(document.getElementById('onboarding-overlay')).toBeNull();
            vi.useRealTimers();
        });

        it('disables decorative animations when reduced motion is requested', async () => {
            void showOnboarding();
            await vi.waitFor(() => {
                expect(
                    document.getElementById('onboarding-overlay')
                ).not.toBeNull();
            });
            const style = document.querySelector('#onboarding-overlay style')!;
            expect(style.textContent).toContain(
                '@media (prefers-reduced-motion: reduce)'
            );
        });

        it('should have safe area padding in footer style', async () => {
            void showOnboarding();
            await vi.waitFor(() => {
                expect(
                    document.getElementById('onboarding-overlay')
                ).not.toBeNull();
            });

            const overlay = document.getElementById('onboarding-overlay')!;
            const style = overlay.querySelector('style')!;
            expect(style.textContent).toContain(
                'padding: 24px 24px calc(24px + env(safe-area-inset-bottom, 0px))'
            );
        });

        it('should have extra bottom padding on mobile to avoid system nav bar', async () => {
            void showOnboarding();
            await vi.waitFor(() => {
                expect(
                    document.getElementById('onboarding-overlay')
                ).not.toBeNull();
            });

            const overlay = document.getElementById('onboarding-overlay')!;
            const style = overlay.querySelector('style')!;
            expect(style.textContent).toContain('@media (max-width: 600px)');
            expect(style.textContent).toContain(
                'padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px) + 72px)'
            );
        });
    });
});
