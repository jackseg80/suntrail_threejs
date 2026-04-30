import { test, expect } from '@playwright/test';

test.describe('Expert Sheets and Widgets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?mode=test', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    
    // Wait for UI to be ready (listeners attached)
    await page.waitForFunction(() => (window as any).suntrailReady === true);

    // Bypass initial walls
    await page.click('#aw-accept-btn');
    await page.click('#ob-skip');
    
    // Wait for the app to be fully ready
    await page.waitForSelector('#top-pill-main', { state: 'visible', timeout: 15000 });
  });

  test('should open weather sheet from top pill', async ({ page }) => {
    const mainPill = page.locator('#top-pill-main');
    await expect(mainPill).toBeVisible();
    
    // Wait for JS event listeners to be attached after DOM hydration
    await page.waitForTimeout(300);
    await mainPill.click();
    
    // Check if weather sheet is open via its close button visibility
    const closeBtn = page.locator('#close-weather');
    await expect(closeBtn).toBeVisible({ timeout: 5000 });
    
    // Close it
    await closeBtn.click();
    await expect(closeBtn).not.toBeVisible({ timeout: 3000 });
  });

  test('should open connectivity sheet from network icon', async ({ page }) => {
    const netIcon = page.locator('#net-status-icon');
    await expect(netIcon).toBeVisible();
    
    await page.waitForTimeout(300);
    await netIcon.click();
    
    const closeBtn = page.locator('#close-connectivity');
    await expect(closeBtn).toBeVisible({ timeout: 5000 });
    
    await closeBtn.click();
    await expect(closeBtn).not.toBeVisible({ timeout: 3000 });
  });

  test('should open SOS sheet and display coordinates', async ({ page }) => {
    const sosBtn = page.locator('#sos-main-btn');
    await expect(sosBtn).toBeVisible();
    
    await page.waitForTimeout(300);
    await sosBtn.click();
    
    await expect(page.locator('#sos-close-btn')).toBeVisible({ timeout: 5000 });
    
    // Should display locating or actual message
    const sosText = page.locator('#sos-text-container');
    await expect(sosText).toBeVisible();
    
    await page.click('#sos-close-btn');
    await expect(page.locator('#sos-close-btn')).not.toBeVisible({ timeout: 3000 });
  });

  test('should toggle solar timeline', async ({ page }) => {
    const timelineBtn = page.locator('#timeline-toggle-btn');
    await expect(timelineBtn).toBeVisible();
    
    // Ensure widgets-container is at least in DOM
    await page.waitForSelector('#widgets-container', { state: 'attached' });
    
    // Toggle on
    await timelineBtn.click();
    const bottomBar = page.locator('#bottom-bar');
    await expect(bottomBar).toHaveClass(/is-open/);
    
    // Toggle off
    await timelineBtn.click();
    await expect(bottomBar).not.toHaveClass(/is-open/);
  });
});
