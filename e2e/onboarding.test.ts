import { test, expect } from '@playwright/test';
import { openFreshApp } from './app';

test.describe('First Launch Experience', () => {
    test('should complete full onboarding and permissions flow', async ({
        page,
    }) => {
        // Start with a clean slate (no localStorage)
        await openFreshApp(page);

        // 1. Acceptance Wall
        await expect(page.locator('#acceptance-wall-overlay')).toBeVisible();
        await page.click('#aw-accept-btn');
        await expect(
            page.locator('#acceptance-wall-overlay')
        ).not.toBeVisible();

        // 2. Onboarding Tutorial
        await expect(page.locator('#onboarding-overlay')).toBeVisible();
        await expect(page.locator('.ob-gestures li')).toHaveCount(3);
        await expect(page.locator('#canvas-container')).toHaveClass(
            /onboarding-live-target/
        );
        await page.click('#ob-next');
        const modeToggle = page.locator('#nav-2d-toggle');
        if (await modeToggle.isEnabled()) {
            await expect(modeToggle).toHaveClass(/onboarding-live-target/);
        } else {
            await expect(page.locator('#top-pill-lod')).toHaveClass(
                /onboarding-live-target/
            );
        }
        await page.click('#ob-next');
        await expect(page.locator('#onboarding-overlay')).not.toBeVisible();

        // 3. GPS Disclosure
        // Triggers when clicking the GPS button
        await page.click('#gps-main-btn');
        await expect(page.locator('#gps-disclosure-overlay')).toBeVisible();
        await page.click('#gps-disc-allow-btn');
        await expect(page.locator('#gps-disclosure-overlay')).not.toBeVisible();

        // Final check: app should be loaded (check for the main 3D canvas)
        await expect(
            page.locator('#canvas-container canvas').first()
        ).toBeVisible();
    });

    test('should allow skipping onboarding directly @smoke', async ({
        page,
    }) => {
        await openFreshApp(page);

        // Accept wall
        await page.click('#aw-accept-btn');

        // Skip onboarding
        await expect(page.locator('#onboarding-overlay')).toBeVisible();
        await page.click('#ob-skip');
        await expect(page.locator('#onboarding-overlay')).not.toBeVisible();

        // GPS Disclosure (click button)
        await page.click('#gps-main-btn');
        await expect(page.locator('#gps-disclosure-overlay')).toBeVisible();
        await page.click('#gps-disc-decline-btn');
        await expect(page.locator('#gps-disclosure-overlay')).not.toBeVisible();

        // Final check: app should be loaded (check for the main 3D canvas)
        await expect(
            page.locator('#canvas-container canvas').first()
        ).toBeVisible();
    });
});
