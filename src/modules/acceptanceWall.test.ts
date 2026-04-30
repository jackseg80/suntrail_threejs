import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockT } = vi.hoisted(() => {
    const mockT = vi.fn((key: string) => {
        const defaults: Record<string, string> = {
            'acceptance.title': 'Avertissement de securite',
            'acceptance.item1.title': 'Orientation',
            'acceptance.item1.desc': 'Cet outil ne remplace pas une carte.',
            'acceptance.item2.title': 'Reseau',
            'acceptance.item2.desc': 'La couverture reseau nest pas garantie.',
            'acceptance.item3.title': 'Meteo',
            'acceptance.item3.desc': 'Les conditions peuvent changer rapidement.',
            'acceptance.item4.title': 'Risques',
            'acceptance.item4.desc': 'Randonnee comporte des risques.',
            'acceptance.item5.title': 'Batterie',
            'acceptance.item5.desc': 'Le GPS consomme de la batterie.',
            'acceptance.legal': 'En acceptant, vous reconnaissez...',
            'acceptance.btn': 'J\'accepte'
        };
        return defaults[key] || key;
    });
    return { mockT };
});

vi.mock('../i18n/I18nService', () => ({
    i18n: { t: mockT }
}));

import { hasAccepted, requestAcceptance } from './acceptanceWall';

describe('acceptanceWall', () => {
    const STORAGE_KEY = 'suntrail_acceptance_v1';

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('hasAccepted', () => {
        it('should return false when storage key is not set', () => {
            expect(hasAccepted()).toBe(false);
        });

        it('should return true when storage key is set to "1"', () => {
            localStorage.setItem(STORAGE_KEY, '1');
            expect(hasAccepted()).toBe(true);
        });

        it('should return false for any other value', () => {
            localStorage.setItem(STORAGE_KEY, '0');
            expect(hasAccepted()).toBe(false);
        });
    });

    describe('requestAcceptance', () => {
        it('should resolve immediately if already accepted', async () => {
            localStorage.setItem(STORAGE_KEY, '1');
            const result = await requestAcceptance();
            expect(result).toBeUndefined();
        });

        it('should show overlay when not yet accepted', async () => {
            void requestAcceptance();
            await vi.waitFor(() => {
                expect(document.getElementById('acceptance-wall-overlay')).not.toBeNull();
            });
            expect(document.getElementById('acceptance-wall-overlay')).not.toBeNull();
        });

        it('should render overlay with proper ARIA attributes', async () => {
            void requestAcceptance();
            await vi.waitFor(() => {
                expect(document.getElementById('acceptance-wall-overlay')).not.toBeNull();
            });

            const overlay = document.getElementById('acceptance-wall-overlay')!;
            expect(overlay.getAttribute('role')).toBe('dialog');
            expect(overlay.getAttribute('aria-modal')).toBe('true');
            expect(overlay.getAttribute('aria-labelledby')).toBe('acceptance-title');
        });

        it('should contain the accept button with correct text', async () => {
            void requestAcceptance();
            await vi.waitFor(() => {
                expect(document.getElementById('aw-accept-btn')).not.toBeNull();
            });

            const btn = document.getElementById('aw-accept-btn')!;
            expect(btn.textContent).toContain("J'accepte");
        });

        it('should resolve and persist acceptance on button click', async () => {
            const promise = requestAcceptance();
            await vi.waitFor(() => {
                expect(document.getElementById('aw-accept-btn')).not.toBeNull();
            });

            const btn = document.getElementById('aw-accept-btn')!;
            btn.click();

            await expect(promise).resolves.toBeUndefined();
            expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
        });

        it('should remove overlay after click (fade out)', async () => {
            vi.useFakeTimers();
            const promise = requestAcceptance();
            await vi.waitFor(() => {
                expect(document.getElementById('aw-accept-btn')).not.toBeNull();
            });

            const btn = document.getElementById('aw-accept-btn')!;
            btn.click();

            // Fade out: opacity set to 0
            const overlay = document.getElementById('acceptance-wall-overlay')!;
            expect(overlay.style.opacity).toBe('0');

            // After 320ms, overlay is removed
            vi.advanceTimersByTime(320);
            expect(document.getElementById('acceptance-wall-overlay')).toBeNull();

            vi.useRealTimers();
            await promise;
        });

        it('should trap focus (Tab key is prevented)', async () => {
            void requestAcceptance();
            await vi.waitFor(() => {
                expect(document.getElementById('acceptance-wall-overlay')).not.toBeNull();
            });

            const overlay = document.getElementById('acceptance-wall-overlay')!;
            const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
            overlay.dispatchEvent(event);

            expect(event.defaultPrevented).toBe(true);
        });
    });
});
