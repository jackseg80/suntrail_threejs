import type { Page } from '@playwright/test';

/** URL de l'application 3D, distincte de la landing page index.html. */
export const APP_TEST_URL = '/app.html?mode=test';

type InitialStorage = Record<string, string>;

/**
 * Opens the app with a deterministic client-side state.
 *
 * The storage must be reset before application modules run. Clearing it after
 * navigation races with the acceptance-wall initialisation, especially in
 * Firefox, and makes the E2E suite depend on timing instead of behaviour.
 */
export async function openFreshApp(
    page: Page,
    initialStorage: InitialStorage = {}
): Promise<void> {
    await page.addInitScript((storage: InitialStorage) => {
        localStorage.clear();
        sessionStorage.clear();
        for (const [key, value] of Object.entries(storage)) {
            localStorage.setItem(key, value);
        }
    }, initialStorage);

    await page.goto(APP_TEST_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as { suntrailReady?: boolean }).suntrailReady === true);
}

/** Completes the mandatory first-launch UI in tests that need the app shell. */
export async function dismissFirstLaunch(page: Page): Promise<void> {
    await page.locator('#aw-accept-btn').click();
    await page.locator('#acceptance-wall-overlay').waitFor({ state: 'hidden' });
    await page.locator('#ob-skip').click();
    await page.locator('#onboarding-overlay').waitFor({ state: 'hidden' });
}

export async function waitForSheet(
    page: Page,
    selector: string
): Promise<void> {
    await page.locator(selector).waitFor({ state: 'attached', timeout: 15_000 });
}
