import type { Page } from '@playwright/test';

/** URL de l'application 3D, distincte de la landing page index.html. */
export const APP_TEST_URL = '/app.html?mode=test';

export async function waitForSheet(
    page: Page,
    selector: string
): Promise<void> {
    await page.locator(selector).waitFor({ state: 'attached', timeout: 15_000 });
}
