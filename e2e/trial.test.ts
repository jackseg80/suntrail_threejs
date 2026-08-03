import { test, expect } from '@playwright/test';
import { dismissFirstLaunch, openFreshApp, waitForSheet } from './app';

test.describe('Discovery Trial E2E', () => {
  test('Easter egg should activate 14-day tester trial', async ({ page }) => {
    await openFreshApp(page);
    await dismissFirstLaunch(page);
    await waitForSheet(page, '#settings');

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
