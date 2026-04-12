import { test, expect } from '@playwright/test';

test.describe('Search Functionality', () => {
  test('should search for a location and show results', async ({ page }) => {
    // Intercept MapTiler Geocoding API
    await page.route('**/geocoding/**/*.json*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          features: [
            {
              id: 'loc.1',
              place_name: 'Zermatt, Valais, Switzerland',
              center: [7.7491, 46.0207],
              place_type: ['place']
            }
          ]
        })
      });
    });

    await page.goto('/');
    await page.click('#aw-accept-btn');
    await page.click('#ob-skip');

    // Open search tab (it's the first one by default, but let's click to be sure)
    await page.click('.nav-tab[data-tab="search"]');
    await expect(page.locator('#search')).toBeVisible();

    // Type query
    const input = page.locator('#geo-input');
    await input.fill('Zermatt');

    // Wait for result item
    const resultItem = page.locator('.geo-result').first();
    await expect(resultItem).toBeVisible();
    await expect(resultItem).toContainText('Zermatt');

    // Click result
    await resultItem.click();

    // Search sheet should close and we should fly there
    await expect(page.locator('#search')).not.toBeVisible();
    
    // Check if the main canvas is still there (rendering still works)
    await expect(page.locator('#canvas-container canvas').first()).toBeVisible();
  });
});
