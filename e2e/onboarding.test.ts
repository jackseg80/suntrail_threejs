import { test, expect } from '@playwright/test';

test.describe('First Launch Experience', () => {
  test('should complete full onboarding and permissions flow', async ({ page }) => {
    // Start with a clean slate (no localStorage)
    await page.goto('/');

    // 1. Acceptance Wall
    await expect(page.locator('#acceptance-wall-overlay')).toBeVisible();
    await page.click('#aw-accept-btn');
    await expect(page.locator('#acceptance-wall-overlay')).not.toBeVisible();

    // 2. Onboarding Tutorial
    await expect(page.locator('#onboarding-overlay')).toBeVisible();
    // Navigate through some slides
    for (let i = 0; i < 3; i++) {
        await page.click('#ob-next');
    }
    // Skip the rest
    await page.click('#ob-skip');
    await expect(page.locator('#onboarding-overlay')).not.toBeVisible();

    // 3. GPS Disclosure
    // Triggers when clicking the GPS button
    await page.click('#gps-main-btn');
    await expect(page.locator('#gps-disclosure-overlay')).toBeVisible();
    await page.click('#gps-disc-allow-btn');
    await expect(page.locator('#gps-disclosure-overlay')).not.toBeVisible();

    // Final check: app should be loaded (check for the main 3D canvas)
    await expect(page.locator('#canvas-container canvas')).toBeVisible();
  });

  test('should allow skipping onboarding directly', async ({ page }) => {
    await page.goto('/');
    
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
    await expect(page.locator('#canvas-container canvas')).toBeVisible();
  });
});
