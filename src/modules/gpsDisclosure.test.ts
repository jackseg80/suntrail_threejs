import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockT } = vi.hoisted(() => {
    const mockT = vi.fn((key: string) => {
        const defaults: Record<string, string> = {
            'gps.disclosure.title': 'Autorisation GPS',
            'gps.disclosure.body': 'SunTrail utilise votre position.\npour la navigation.',
            'gps.disclosure.allow': 'Autoriser',
            'gps.disclosure.decline': 'Refuser'
        };
        return defaults[key] || key;
    });
    return { mockT };
});

vi.mock('../i18n/I18nService', () => ({
    i18n: { t: mockT }
}));

import { hasShownGPSDisclosure, requestGPSDisclosure } from './gpsDisclosure';

describe('gpsDisclosure', () => {
    const STORAGE_KEY = 'suntrail_gps_disclosure_v1';

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('hasShownGPSDisclosure', () => {
        it('should return false when storage key is not set', () => {
            expect(hasShownGPSDisclosure()).toBe(false);
        });

        it('should return true when storage key is set to "1"', () => {
            localStorage.setItem(STORAGE_KEY, '1');
            expect(hasShownGPSDisclosure()).toBe(true);
        });

        it('should return false for any other value', () => {
            localStorage.setItem(STORAGE_KEY, '0');
            expect(hasShownGPSDisclosure()).toBe(false);
        });
    });

    describe('requestGPSDisclosure', () => {
        it('should resolve to true immediately if already shown', async () => {
            localStorage.setItem(STORAGE_KEY, '1');
            const result = await requestGPSDisclosure();
            expect(result).toBe(true);
        });

        it('should show overlay when not yet shown', async () => {
            void requestGPSDisclosure();
            await vi.waitFor(() => {
                expect(document.getElementById('gps-disclosure-overlay')).not.toBeNull();
            });
            expect(document.getElementById('gps-disclosure-overlay')).not.toBeNull();
        });

        it('should render overlay with proper ARIA attributes', async () => {
            void requestGPSDisclosure();
            await vi.waitFor(() => {
                expect(document.getElementById('gps-disclosure-overlay')).not.toBeNull();
            });

            const overlay = document.getElementById('gps-disclosure-overlay')!;
            expect(overlay.getAttribute('role')).toBe('dialog');
            expect(overlay.getAttribute('aria-modal')).toBe('true');
            expect(overlay.getAttribute('aria-labelledby')).toBe('gps-disclosure-title');
            expect(overlay.getAttribute('aria-describedby')).toBe('gps-disclosure-body');
        });

        it('should contain allow and decline buttons', async () => {
            void requestGPSDisclosure();
            await vi.waitFor(() => {
                expect(document.getElementById('gps-disclosure-overlay')).not.toBeNull();
            });

            expect(document.getElementById('gps-disc-allow-btn')).not.toBeNull();
            expect(document.getElementById('gps-disc-decline-btn')).not.toBeNull();
        });

        it('should resolve to true and persist on allow click', async () => {
            const promise = requestGPSDisclosure();
            await vi.waitFor(() => {
                expect(document.getElementById('gps-disc-allow-btn')).not.toBeNull();
            });

            const allowBtn = document.getElementById('gps-disc-allow-btn')!;
            allowBtn.click();

            const result = await promise;
            expect(result).toBe(true);
            expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
        });

        it('should resolve to false and persist on decline click', async () => {
            const promise = requestGPSDisclosure();
            await vi.waitFor(() => {
                expect(document.getElementById('gps-disc-decline-btn')).not.toBeNull();
            });

            const declineBtn = document.getElementById('gps-disc-decline-btn')!;
            declineBtn.click();

            const result = await promise;
            expect(result).toBe(false);
            expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
        });

        it('should remove overlay after button click', async () => {
            const promise = requestGPSDisclosure();
            await vi.waitFor(() => {
                expect(document.getElementById('gps-disc-allow-btn')).not.toBeNull();
            });

            const btn = document.getElementById('gps-disc-allow-btn')!;
            btn.click();

            await promise;
            expect(document.getElementById('gps-disclosure-overlay')).toBeNull();
        });

        it('should close and resolve to false on Escape key', async () => {
            const promise = requestGPSDisclosure();
            await vi.waitFor(() => {
                expect(document.getElementById('gps-disclosure-overlay')).not.toBeNull();
            });

            const overlay = document.getElementById('gps-disclosure-overlay')!;
            const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
            overlay.dispatchEvent(event);

            const result = await promise;
            expect(result).toBe(false);
            expect(document.getElementById('gps-disclosure-overlay')).toBeNull();
        });

        it('should trap Tab key within buttons', async () => {
            const promise = requestGPSDisclosure();
            await vi.waitFor(() => {
                expect(document.getElementById('gps-disclosure-overlay')).not.toBeNull();
            });

            const overlay = document.getElementById('gps-disclosure-overlay')!;
            const allowBtn = document.getElementById('gps-disc-allow-btn') as HTMLElement;
            const declineBtn = document.getElementById('gps-disc-decline-btn') as HTMLElement;

            // Simulate Tab at last button → should cycle to first
            declineBtn.focus();
            const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
            overlay.dispatchEvent(tabEvent);

            // Verify tab was prevented (trapping focus)
            expect(tabEvent.defaultPrevented).toBe(true);

            // Clean up
            allowBtn.click();
            await promise;
        });
    });
});
