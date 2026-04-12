import { test, expect } from '@playwright/test';

test.describe('Expert Sheets and Widgets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Bypass initial walls
    await page.click('#aw-accept-btn');
    await page.click('#ob-skip');
    
    // Wait for the app to be fully ready (widgets are shown after sceneReady)
    await page.waitForSelector('#widgets-container', { state: 'visible', timeout: 15000 });
  });

  test('should open weather sheet from top pill', async ({ page }) => {
    const mainPill = page.locator('#top-pill-main');
    await expect(mainPill).toBeVisible();
    await mainPill.click();
    
    // Check if weather sheet appears
    const weatherSheet = page.locator('#weather');
    await expect(weatherSheet).toBeVisible();
    
    // Check for some content (title or close button)
    await expect(page.locator('#close-weather')).toBeVisible();
    
    // Close it
    await page.click('#close-weather');
    await expect(weatherSheet).not.toBeVisible();
  });

  test('should open connectivity sheet from network icon', async ({ page }) => {
    const netIcon = page.locator('#net-status-icon');
    await expect(netIcon).toBeVisible();
    await netIcon.click();
    
    const connectivitySheet = page.locator('#connectivity');
    await expect(connectivitySheet).toBeVisible();
    await expect(page.locator('#close-connectivity')).toBeVisible();
    
    await page.click('#close-connectivity');
    await expect(connectivitySheet).not.toBeVisible();
  });

  test('should open SOS sheet and display coordinates', async ({ page }) => {
    const sosBtn = page.locator('#sos-main-btn');
    await expect(sosBtn).toBeVisible();
    await sosBtn.click();
    
    const sosSheet = page.locator('#sos');
    await expect(sosSheet).toBeVisible();
    
    // Should display locating or actual message
    const sosText = page.locator('#sos-text-container');
    await expect(sosText).toBeVisible();
    
    await page.click('#sos-close-btn');
    await expect(sosSheet).not.toBeVisible();
  });

  test('should toggle solar timeline', async ({ page }) => {
    const timelineBtn = page.locator('#timeline-toggle-btn');
    await expect(timelineBtn).toBeVisible();
    
    // Bottom bar is normally hidden or empty? 
    // In index.html template-widgets, it's inside #widgets-container style="display:none;"
    // Check if it becomes visible
    await timelineBtn.click();
    const bottomBar = page.locator('#bottom-bar');
    await expect(bottomBar).toBeVisible();
    
    // Toggle off
    await timelineBtn.click();
    // Note: Depends on implementation if it hides #bottom-bar or #widgets-container
  });
});
