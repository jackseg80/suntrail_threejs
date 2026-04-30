import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockT, mockHaptic } = vi.hoisted(() => {
    const mockT = vi.fn((key: string) => {
        const defaults: Record<string, string> = {
            'onboarding.slide1.title': 'Bienvenue',
            'onboarding.slide1.desc': 'SunTrail est votre compagnon.',
            'onboarding.slideGestures.title': 'Gestes',
            'onboarding.slideGestures.desc': 'Naviguez avec les gestes.',
            'onboarding.slideGestures.pan': 'Glisser',
            'onboarding.slideGestures.panDesc': 'Deplacez la carte',
            'onboarding.slideGestures.pinch': 'Pincer',
            'onboarding.slideGestures.pinchDesc': 'Zoom avant/arriere',
            'onboarding.slideGestures.rotate': 'Tourner',
            'onboarding.slideGestures.rotateDesc': 'Orientez la carte',
            'onboarding.slideGestures.tilt': 'Incliner',
            'onboarding.slideGestures.tiltDesc': 'Vue 3D',
            'onboarding.slide2.title': 'Recherche',
            'onboarding.slide2.desc': 'Trouvez des lieux.',
            'onboarding.slide3.title': 'Outils',
            'onboarding.slide3.desc': 'Les outils FAB.',
            'onboarding.slide3.compass': 'Boussole',
            'onboarding.slide3.compassDesc': 'Orientation',
            'onboarding.slide3.layers': 'Calques',
            'onboarding.slide3.layersDesc': 'Gerer les couches',
            'onboarding.slide3.mode': 'Mode',
            'onboarding.slide3.modeDesc': 'Changer le mode',
            'onboarding.slide3.gps': 'GPS',
            'onboarding.slide3.gpsDesc': 'Centrer',
            'onboarding.slide4.title': 'Tracks',
            'onboarding.slide4.desc': 'Importez vos traces.',
            'onboarding.slide4.import': 'Importer',
            'onboarding.slide4.importDesc': 'GPX',
            'onboarding.slide4.rec': 'Enregistrer',
            'onboarding.slide4.recDesc': 'GPS',
            'onboarding.slide5.title': 'Soleil',
            'onboarding.slide5.desc': 'Simulation solaire.',
            'onboarding.slide6.title': 'Meteo',
            'onboarding.slide6.desc': 'Previsions meteo.',
            'onboarding.slide7.title': 'Analyse',
            'onboarding.slide7.desc': 'Profil et inclino.',
            'onboarding.slide7.profile': 'Profil',
            'onboarding.slide7.profileDesc': 'Altitude',
            'onboarding.slide7.inclino': 'Inclinometre',
            'onboarding.slide7.inclinoDesc': 'Pente',
            'onboarding.slide7.drag': 'Glisser',
            'onboarding.slide7.dragDesc': 'Interactif',
            'onboarding.slide8.title': 'Pro',
            'onboarding.slide8.desc': 'Fonctionnalites PRO.',
            'onboarding.skip': 'Passer',
            'onboarding.next': 'Suivant',
            'onboarding.start': 'Commencer'
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

            vi.advanceTimersByTime(350);

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
            // Click through 9 slides (8 "Next" clicks)
            for (let i = 0; i < 8; i++) {
                nextBtn.click();
                vi.advanceTimersByTime(300);
            }

            // Last click should close (button should say "Commencer")
            nextBtn.click();
            vi.advanceTimersByTime(350);

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

        it('should render 9 dot indicators', async () => {
            void showOnboarding();
            await vi.waitFor(() => {
                expect(document.getElementById('ob-dots')).not.toBeNull();
            });

            const dots = document.querySelectorAll('.ob-dot');
            expect(dots.length).toBe(9);
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
            // Navigate to slide 8 (0-indexed, last)
            for (let i = 0; i < 8; i++) {
                nextBtn.click();
                await vi.waitFor(() => document.querySelectorAll('.ob-dot--active'));
            }

            expect(nextBtn.textContent).toContain('Commencer');
        });

        it('should close on keyboard Escape', async () => {
            vi.useFakeTimers();
            const promise = showOnboarding();
            await vi.waitFor(() => {
                expect(document.getElementById('onboarding-overlay')).not.toBeNull();
            });

            const overlay = document.getElementById('onboarding-overlay')!;
            const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
            overlay.dispatchEvent(event);

            vi.advanceTimersByTime(300);
            expect(document.getElementById('onboarding-overlay')).toBeNull();

            vi.useRealTimers();
            await promise;
        });

        it('should navigate with ArrowRight and ArrowLeft keys', async () => {
            const promise = showOnboarding();
            await vi.waitFor(() => {
                expect(document.getElementById('onboarding-overlay')).not.toBeNull();
            });

            const overlay = document.getElementById('onboarding-overlay')!;

            // ArrowRight → next slide
            overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
            await vi.waitFor(() => {
                const dots = document.querySelectorAll('.ob-dot');
                expect(dots[1].classList.contains('ob-dot--active')).toBe(true);
            });

            // ArrowLeft → previous slide
            overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
            await vi.waitFor(() => {
                const dots = document.querySelectorAll('.ob-dot');
                expect(dots[0].classList.contains('ob-dot--active')).toBe(true);
            });

            // ArrowLeft at first slide should stay put
            overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
            await vi.waitFor(() => {
                const dots = document.querySelectorAll('.ob-dot');
                expect(dots[0].classList.contains('ob-dot--active')).toBe(true);
            });

            // Cleanup
            const skipBtn = document.getElementById('ob-skip')!;
            skipBtn.click();
            await promise;
        });

        it('should trap Tab key', async () => {
            const promise = showOnboarding();
            await vi.waitFor(() => {
                expect(document.getElementById('onboarding-overlay')).not.toBeNull();
            });

            const overlay = document.getElementById('onboarding-overlay')!;
            const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
            overlay.dispatchEvent(tabEvent);

            expect(tabEvent.defaultPrevented).toBe(true);

            document.getElementById('ob-skip')!.click();
            await promise;
        });
    });
});
