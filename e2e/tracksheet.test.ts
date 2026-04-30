import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('TrackSheet Functionality', () => {
  test('should import a GPX file and display stats', async ({ page }) => {
    await page.goto('/?mode=test', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as any).suntrailReady === true);

    // 1. Bypass Onboarding
    await page.click('#aw-accept-btn');
    await page.click('#ob-skip');

    // 2. Open Track Tab
    const trackTab = page.locator('.nav-tab[data-tab="track"]');
    await trackTab.click();
    await expect(page.locator('#track')).toHaveClass(/is-open/);

    // 3. Import GPX
    // Note: We use the hidden input directly for file upload
    const filePath = path.join(__dirname, 'test-data', 'E2E-Test-Track.gpx');
    await page.setInputFiles('#gpx-upload', filePath);

    // 4. Verify Import Success
    // The layer list should appear
    const layerItem = page.locator('.gpx-layer-item');
    await expect(layerItem).toBeVisible();
    await expect(layerItem.locator('.gpx-layer-name')).toHaveText('E2E-Test-Track');

    // 5. Verify Stats in the sheet
    // Stats should be updated (not 0 anymore)
    const dist = page.locator('#track-dist');
    const dplus = page.locator('#track-dplus');
    
    // Check that they contain numbers (not just 0.0 or +0)
    // Haversine distance for 46.5,7.5 to 46.51,7.51 is approx 1.35km
    await expect(dist).not.toHaveText('0.0 km');
    await expect(dplus).not.toHaveText('+0 m');
    
    // Detailed check
    const distText = await dist.innerText();
    expect(parseFloat(distText)).toBeGreaterThan(1.0);
  });

  test('should toggle GPX layer visibility', async ({ page }) => {
    await page.goto('/?mode=test', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as any).suntrailReady === true);
    await page.click('#aw-accept-btn');
    await page.click('#ob-skip');
    await page.click('.nav-tab[data-tab="track"]');

    const filePath = path.join(__dirname, 'test-data', 'E2E-Test-Track.gpx');
    await page.setInputFiles('#gpx-upload', filePath);

    const toggleBtn = page.locator('.gpx-layer-toggle').first();
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toHaveText('👁');
    
    await toggleBtn.scrollIntoViewIfNeeded();
    await toggleBtn.click();
    await expect(toggleBtn).toHaveText('🚫');

    // Final check: app should be loaded (check for the main 3D canvas)
    await expect(page.locator('#canvas-container canvas').first()).toBeVisible();
  });
});
