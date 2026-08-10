import { test, expect } from '@playwright/test';
import { dismissFirstLaunch, openFreshApp, waitForSheet } from './app';

test.describe('Settings and Performance', () => {
  test.beforeEach(async ({ page }) => {
    await openFreshApp(page);
    await dismissFirstLaunch(page);
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
    await expect(page.locator('#settings')).toHaveClass(/is-open/);

    // Les options de rendu vivent dans la catégorie "Laboratoire développeur"
    // (un <details> replié) : l'utilisateur l'ouvre via la navigation des catégories.
    await page.click('[data-settings-category="developer"]');
    await expect(page.locator('#settings-developer-lab')).toHaveAttribute('open', '');

    const shadowToggle = page.locator('#shadow-toggle');

    // Toggle shadows
    await shadowToggle.check();
    await expect(shadowToggle).toBeChecked();

    await page.click('#close-panel');
    await expect(page.locator('#settings')).not.toHaveClass(/is-open/);
  });
});
