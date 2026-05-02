import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockT, mockHaptic } = vi.hoisted(() => {
    const mockT = vi.fn((key: string) => {
        const defaults: Record<string, string> = {
            'onboarding.slide1.title': 'Bienvenue',
            'onboarding.slide1.desc': 'SunTrail est votre compagnon.',
            'onboarding.slide2.title': 'Solaire',
            'onboarding.slide2.desc': 'Simulation solaire.',
            'onboarding.slide3.title': 'Tracks',
            'onboarding.slide3.desc': 'Importez vos traces.',
            'onboarding.slide4.title': 'Analyse',
            'onboarding.slide4.desc': 'Profil et inclino.',
            'onboarding.slide5.title': 'Meteo',
            'onboarding.slide5.desc': 'Previsions meteo.',
            'onboarding.slide6.title': 'Securite',
            'onboarding.slide6.desc': 'SOS.',
            'onboarding.skip': 'Passer',
            'onboarding.next': 'Suivant',
            'onboarding.start': 'Commencer',
            'onboarding.explore': 'Explorer',
            'onboarding.importGpx': 'Importer',
            'onboarding.searchPeak': 'Chercher'
        };
        return defaults[key] || key;
    });
    const mockHaptic = vi.fn();
    return { mockT, mockHaptic };
});

vi.mock('../i18n/I18nService', () => ({
    i18n: { t: mockT }
}));

vi.mock('./haptics', () => ({
    haptic: mockHaptic
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
                expect(document.getElementById('onboarding-overlay')).not.toBeNull();
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
            // v6.0 has 6 slides (5 "Next" clicks)
            for (let i = 0; i < 5; i++) {
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
                expect(document.getElementById('onboarding-overlay')).not.toBeNull();
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

        it('should render 6 dot indicators', async () => {
            void showOnboarding();
            await vi.waitFor(() => {
                expect(document.getElementById('ob-dots')).not.toBeNull();
            });

            const dots = document.querySelectorAll('.ob-dot');
            expect(dots.length).toBe(6);
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
            // Navigate to slide 5 (0-indexed, last is 5)
            for (let i = 0; i < 5; i++) {
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
            for (let i = 0; i < 5; i++) {
                nextBtn.click();
            }

            const menuItems = document.querySelectorAll('.ob-menu-item');
            expect(menuItems.length).toBe(3);
            expect(menuItems[0].textContent).toContain('Explorer');
        });
    });
});
