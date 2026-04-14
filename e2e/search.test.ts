import { test, expect } from '@playwright/test';

test.describe('Search Functionality', () => {
  test('should search for a location and show results', async ({ page }) => {
    // Intercept MapTiler / Nominatim Geocoding API & Overpass, excluding local TS/JS modules
    await page.route(url => {
      const href = url.href.toLowerCase();
      if (href.endsWith('.ts') || href.endsWith('.js')) return false;
      return href.includes('geocoding') || href.includes('photon') || href.includes('nominatim') || href.includes('overpass');
    }, async route => {
      // Pour Overpass, retourner un mock XML ou JSON vide selon le besoin
      if (route.request().url().includes('overpass')) {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ elements: [] })
        });
        return;
      }
      // Pour le géocodage standard
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          features: [
            {
              id: 'loc.1',
              place_name: 'Zermatt, Valais, Switzerland',
              geometry: {
                  type: 'Point',
                  coordinates: [7.7491, 46.0207]
              },
              place_type: ['place']
            }
          ]
        })
      });
    });

    await page.goto('/?mode=test', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.waitForFunction(() => (window as any).suntrailReady === true);
    await page.click('#aw-accept-btn');
    await page.click('#ob-skip');

    // Open search tab (it's the first one by default, but let's click to be sure)
    await page.click('.nav-tab[data-tab="search"]');
    await expect(page.locator('#search')).toHaveClass(/is-open/);

    // Type query
    const input = page.locator('#geo-input');
    await input.fill('Zermatt');
    
    // Wait for debounce and results
    await page.waitForTimeout(1500);

    // Wait for result item (it uses class .geo-item)
    const resultItem = page.locator('.geo-item').first();
    await expect(resultItem).toBeVisible({ timeout: 15000 });
    await expect(resultItem).toContainText('Zermatt');

    // Click result
    await resultItem.click();

    // Search sheet should close and we should fly there
    await expect(page.locator('#search')).not.toHaveClass(/is-open/);
    
    // Check if the main canvas is still there (rendering still works)
    await expect(page.locator('#canvas-container canvas').first()).toBeVisible();
  });
});
