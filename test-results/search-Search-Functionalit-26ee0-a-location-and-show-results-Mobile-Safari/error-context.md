# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: search.test.ts >> Search Functionality >> should search for a location and show results
- Location: e2e\search.test.ts:4:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForFunction: Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Aller au contenu" [ref=e2]:
    - /url: "#canvas-container"
  - heading "SunTrail - Carte 3D" [level=1] [ref=e3]
  - main
  - banner
  - generic:
    - generic: —
    - generic: —
    - generic:
      - button "☀ Solaire"
  - navigation [ref=e5]
  - generic [ref=e6]:
    - button "Réinitialiser le Nord" [ref=e7] [cursor=pointer]:
      - img [ref=e8]
    - button "Changer le type de carte" [ref=e12] [cursor=pointer]:
      - img [ref=e13]
    - button "Localiser ma position" [ref=e17] [cursor=pointer]:
      - img [ref=e18]
    - button "Basculer 2D/3D" [ref=e22] [cursor=pointer]:
      - img [ref=e23]
      - generic [ref=e25]: 3D
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Search Functionality', () => {
  4  |   test('should search for a location and show results', async ({ page }) => {
  5  |     // Intercept MapTiler / Nominatim Geocoding API & Overpass, excluding local TS/JS modules
  6  |     await page.route(url => {
  7  |       const href = url.href.toLowerCase();
  8  |       if (href.endsWith('.ts') || href.endsWith('.js')) return false;
  9  |       return href.includes('geocoding') || href.includes('photon') || href.includes('nominatim') || href.includes('overpass');
  10 |     }, async route => {
  11 |       // Pour Overpass, retourner un mock XML ou JSON vide selon le besoin
  12 |       if (route.request().url().includes('overpass')) {
  13 |         await route.fulfill({
  14 |             status: 200,
  15 |             contentType: 'application/json',
  16 |             body: JSON.stringify({ elements: [] })
  17 |         });
  18 |         return;
  19 |       }
  20 |       // Pour le géocodage standard
  21 |       await route.fulfill({
  22 |         status: 200,
  23 |         contentType: 'application/json',
  24 |         body: JSON.stringify({
  25 |           features: [
  26 |             {
  27 |               id: 'loc.1',
  28 |               place_name: 'Zermatt, Valais, Switzerland',
  29 |               geometry: {
  30 |                   type: 'Point',
  31 |                   coordinates: [7.7491, 46.0207]
  32 |               },
  33 |               place_type: ['place']
  34 |             }
  35 |           ]
  36 |         })
  37 |       });
  38 |     });
  39 | 
  40 |     await page.goto('/?mode=test', { waitUntil: 'domcontentloaded' });
  41 |     await page.evaluate(() => localStorage.clear());
> 42 |     await page.waitForFunction(() => (window as any).suntrailReady === true);
     |                ^ Error: page.waitForFunction: Test timeout of 30000ms exceeded.
  43 |     await page.click('#aw-accept-btn');
  44 |     await page.click('#ob-skip');
  45 | 
  46 |     // Open search tab (it's the first one by default, but let's click to be sure)
  47 |     await page.click('.nav-tab[data-tab="search"]');
  48 |     await expect(page.locator('#search')).toHaveClass(/is-open/);
  49 | 
  50 |     // Type query
  51 |     const input = page.locator('#geo-input');
  52 |     await input.fill('Zermatt');
  53 |     
  54 |     // Wait for debounce and results
  55 |     await page.waitForTimeout(1500);
  56 | 
  57 |     // Wait for result item (it uses class .geo-item)
  58 |     const resultItem = page.locator('.geo-item').first();
  59 |     await expect(resultItem).toBeVisible({ timeout: 15000 });
  60 |     await expect(resultItem).toContainText('Zermatt');
  61 | 
  62 |     // Click result
  63 |     await resultItem.click();
  64 | 
  65 |     // Search sheet should close and we should fly there
  66 |     await expect(page.locator('#search')).not.toHaveClass(/is-open/);
  67 |     
  68 |     // Check if the main canvas is still there (rendering still works)
  69 |     await expect(page.locator('#canvas-container canvas').first()).toBeVisible();
  70 |   });
  71 | });
  72 | 
```