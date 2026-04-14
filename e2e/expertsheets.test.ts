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
    await mainPill.click();
    
    // Check if weather sheet appears
    const weatherSheet = page.locator('#weather');
    await expect(weatherSheet).toHaveClass(/is-open/);
    
    // Check for some content (title or close button)
    await expect(page.locator('#close-weather')).toBeVisible();
    
    // Close it
    await page.click('#close-weather');
    await expect(weatherSheet).not.toHaveClass(/is-open/);
  });

  test('should open connectivity sheet from network icon', async ({ page }) => {
    const netIcon = page.locator('#net-status-icon');
    await expect(netIcon).toBeVisible();
    await netIcon.click();
    
    const connectivitySheet = page.locator('#connectivity');
    await expect(connectivitySheet).toHaveClass(/is-open/);
    await expect(page.locator('#close-connectivity')).toBeVisible();
    
    await page.click('#close-connectivity');
    await expect(connectivitySheet).not.toHaveClass(/is-open/);
  });

  test('should open SOS sheet and display coordinates', async ({ page }) => {
    const sosBtn = page.locator('#sos-main-btn');
    await expect(sosBtn).toBeVisible();
    await sosBtn.click();
    
    const sosSheet = page.locator('#sos');
    await expect(sosSheet).toHaveClass(/is-open/);
    
    // Should display locating or actual message
    const sosText = page.locator('#sos-text-container');
    await expect(sosText).toBeVisible();
    
    await page.click('#sos-close-btn');
    await expect(sosSheet).not.toHaveClass(/is-open/);
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
