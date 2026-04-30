import { test, expect } from '@playwright/test';

test.describe('Discovery Trial E2E', () => {
  test('should activate 3-day trial and unlock pro features', async ({ page }) => {
    // 1. Start App and bypass GPS disclosure
    await page.goto('/?mode=test', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('suntrail_gps_disclosure_v1', '1'));
    await page.waitForFunction(() => (window as any).suntrailReady === true);
    await page.click('#aw-accept-btn');
    await page.click('#ob-skip');

    // 2. Open Upgrade Sheet
    // We can open it via Settings or by waiting for the UpsellModal (which opens 'upgrade')
    // Let's open it manually to be fast
    await page.click('.nav-tab[data-tab="settings"]');
    await page.click('#btn-upgrade-pro'); // Button to upgrade in settings
    
    const upgradeSheet = page.locator('#upgrade-sheet');
    await expect(upgradeSheet).toHaveClass(/is-open/);

    // 3. Click Discovery Trial Button
    const trialBtn = page.locator('#btn-discovery-trial');
    await expect(trialBtn).toBeVisible();
    await trialBtn.click();

    // 4. Verify Trial is active
    // The sheet should close (class is-open removed)
    await expect(upgradeSheet).not.toHaveClass(/is-open/);
    
    // Check if Pro-only elements are now accessible/visible
    // e.g., Open Track sheet and check that the permanent upsell is GONE
    await page.click('.nav-tab[data-tab="track"]');
    await page.click('#rec-btn-sheet'); // Start recording
    
    const recordingUpsell = page.locator('#rec-recording-upsell');
    await expect(recordingUpsell).not.toBeVisible();
    
    // Stop recording
    await page.click('#rec-btn-sheet');
    // If a save prompt appears, just cancel it (with explicit timeout)
    const cancelBtn = page.locator('#rec-save-cancel');
    try {
        await cancelBtn.waitFor({ state: 'visible', timeout: 3000 });
        await cancelBtn.click();
    } catch {
        // No save prompt — recording may have been too short
    }
  });

  test('Easter egg should activate 14-day tester trial', async ({ page }) => {
    await page.goto('/?mode=test', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as any).suntrailReady === true);
    await page.click('#aw-accept-btn');
    await page.click('#ob-skip');

    await page.click('.nav-tab[data-tab="settings"]');
    
    // Find version number and click 7 times
    const versionEl = page.locator('#settings-version');
    for (let i = 0; i < 7; i++) {
        await versionEl.dispatchEvent('click');
    }

    // Verify toast or Pro status (the version color changes to accent)
    // Matches #2563eb (light) or #4a8ef8 (dark)
    await expect(versionEl).toHaveCSS('color', /rgb\((37, 99, 235|74, 142, 248)\)/);
  });
});
