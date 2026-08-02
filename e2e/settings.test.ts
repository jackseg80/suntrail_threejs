import { test, expect } from '@playwright/test';
import { APP_TEST_URL, waitForSheet } from './app';

test.describe('Settings and Performance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_TEST_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as any).suntrailReady === true);
    await page.click('#aw-accept-btn');
    await page.click('#ob-skip');
    await waitForSheet(page, '#settings');
  });

  test('should change performance presets @smoke', async ({ page }) => {
    // Open settings
    await page.click('.nav-tab[data-tab="settings"]');
    await expect(page.locator('#settings')).toHaveClass(/is-open/);

    // Select Ultra preset
    const ultraBtn = page.locator('.preset-btn[data-preset="ultra"]');
    await ultraBtn.click();
    await expect(ultraBtn).toHaveClass(/active/);

    // Select Eco preset
    const ecoBtn = page.locator('.preset-btn[data-preset="eco"]');
    await ecoBtn.click();
    await expect(ecoBtn).toHaveClass(/active/);
    
    // Check if 2D mode is forced in Eco (usually it is)
    // const body = page.locator('body');
    // await expect(body).toHaveClass(/mode-2d/);
  });

  test('should toggle rendering options', async ({ page }) => {
    await page.click('.nav-tab[data-tab="settings"]');
    
    const shadowToggle = page.locator('#shadow-toggle');

    // Toggle shadows
    await shadowToggle.check();
    await expect(shadowToggle).toBeChecked();

    await page.click('#close-panel');
    await expect(page.locator('#settings')).not.toHaveClass(/is-open/);
  });
});
