import { test, expect } from '@playwright/test';
import path from 'path';
import { dismissFirstLaunch, openFreshApp, waitForSheet } from './app';

test.describe('TrackSheet Functionality', () => {
    test('should import a GPX file and display stats @smoke', async ({
        page,
    }) => {
        await openFreshApp(page);
        await dismissFirstLaunch(page);
        await waitForSheet(page, '#track');

        // 2. Import from Library, the sole catalogue/import destination.
        await page.locator('.nav-tab[data-tab="library"]').click();
        await expect(page.locator('#track')).toHaveClass(/is-open/);

        // 3. Import GPX
        // Note: We use the hidden input directly for file upload
        const filePath = path.join(
            __dirname,
            'test-data',
            'E2E-Test-Track.gpx'
        );
        await page.setInputFiles('#gpx-upload', filePath);

        // 4. Verify Import Success
        // The layer list should appear
        const layerItem = page.locator('.gpx-layer-item');
        await expect(layerItem).toBeVisible();
        await expect(layerItem.locator('.gpx-layer-name')).toHaveText(
            'E2E-Test-Track'
        );

        // 5. Sortie only exposes the currently viewed route and its compact stats.
        await page.locator('.nav-tab[data-tab="track"]').click();
        await expect(page.locator('#outing-route-card')).toBeVisible();
        await expect(page.locator('#outing-route-name')).toHaveText(
            'E2E-Test-Track'
        );
        await expect(page.locator('#outing-route-stats')).toContainText('km');
        await expect(page.locator('#track-dist')).toBeHidden();
        await expect(page.locator('#track-dplus')).toBeHidden();
    });

    test('should toggle GPX layer visibility', async ({ page }) => {
        await openFreshApp(page);
        await dismissFirstLaunch(page);
        await waitForSheet(page, '#track');
        await page.click('.nav-tab[data-tab="library"]');

        const filePath = path.join(
            __dirname,
            'test-data',
            'E2E-Test-Track.gpx'
        );
        await page.setInputFiles('#gpx-upload', filePath);

        // The repository catalogue is secondary: load the archived track
        // explicitly before exercising its map visibility control.
        await page.locator('[data-action="profile"]').first().click();
        const toggleBtn = page.locator('.gpx-layer-toggle').first();
        await expect(toggleBtn).toBeVisible();
        await expect(toggleBtn).toHaveAttribute('data-visible', 'true');

        await toggleBtn.click();
        await expect(toggleBtn).toHaveAttribute('data-visible', 'false');

        // Final check: app should be loaded (check for the main 3D canvas)
        await expect(
            page.locator('#canvas-container canvas').first()
        ).toBeVisible();
    });

    test('keeps a full import after reload and opens it while offline', async ({
        page,
        context,
    }) => {
        await openFreshApp(page);
        await dismissFirstLaunch(page);
        await waitForSheet(page, '#track');
        await page.click('.nav-tab[data-tab="library"]');

        const filePath = path.join(
            __dirname,
            'test-data',
            'E2E-Test-Track.gpx'
        );
        await page.setInputFiles('#gpx-upload', filePath);
        await expect(page.locator('.gpx-layer-item')).toBeVisible();

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(
            () => (window as { suntrailReady?: boolean }).suntrailReady === true
        );
        await dismissFirstLaunch(page);
        await context.setOffline(true);
        await page.click('.nav-tab[data-tab="library"]');

        const stored = page.locator('.gpx-layer-item', {
            hasText: 'E2E-Test-Track',
        });
        await expect(stored).toBeVisible();
        await expect(stored).toContainText(/Full geometry|Géométrie complète/);
        await stored.locator('[data-action="profile"]').click();
        await expect(page.locator('#elevation-profile')).toHaveClass(/is-open/);
        await context.setOffline(false);
    });
});
