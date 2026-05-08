import { test, expect } from '@playwright/test';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const SUPABASE_PROJECT_REF = SUPABASE_URL.replace('https://', '').split('.')[0];
const FAKE_SESSION_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

const FAKE_USER = {
  id: 'e2e-test-uid-12345',
  email: 'e2e-test@suntrail.app',
  role: 'authenticated',
  aud: 'authenticated',
};

const FAKE_SESSION = {
  access_token: 'fake-access-token-for-e2e',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'fake-refresh-token',
  user: FAKE_USER,
};

async function setupApp(page: import('@playwright/test').Page) {
  await page.goto('/?mode=test', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as any).suntrailReady === true);
  await page.click('#aw-accept-btn');
  await page.click('#ob-skip');
  await page.waitForSelector('#top-pill-main', { state: 'visible', timeout: 15000 });
}

test.describe('Account deletion (RGPD)', () => {

  test('delete button should NOT be visible when user is not authenticated', async ({ page }) => {
    await setupApp(page);
    await page.click('.nav-tab[data-tab="settings"]');
    await expect(page.locator('#settings')).toHaveClass(/is-open/);

    const deleteBtn = page.locator('#account-delete-btn');
    await expect(deleteBtn).toBeHidden();
  });

  test('account section should always be visible (fix compliance native)', async ({ page }) => {
    await setupApp(page);
    await page.click('.nav-tab[data-tab="settings"]');

    const accountSection = page.locator('#account-section');
    await expect(accountSection).toBeVisible();
  });

  test('delete button should be visible when user is authenticated', async ({ page }) => {
    // Inject fake Supabase session in localStorage before app init
    await page.addInitScript(({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session));
    }, { key: FAKE_SESSION_KEY, session: FAKE_SESSION });

    // Intercept Supabase auth calls to return the fake user (avoids network call on expired token)
    await page.route('**/auth/v1/**', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user: FAKE_USER }),
        });
      } else {
        await route.continue();
      }
    });

    await setupApp(page);
    await page.click('.nav-tab[data-tab="settings"]');

    const deleteBtn = page.locator('#account-delete-btn');
    await expect(deleteBtn).toBeVisible();
    await expect(deleteBtn).toContainText(/supprimer|delete|löschen|elimina/i);
  });

  test('delete flow: confirm dialog → rpc call → reload', async ({ page }) => {
    // Inject auth state
    await page.addInitScript(({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session));
    }, { key: FAKE_SESSION_KEY, session: FAKE_SESSION });

    await page.route('**/auth/v1/**', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: FAKE_USER }) });
      } else {
        await route.continue();
      }
    });

    // Intercept RPC delete_user_account
    let rpcCalled = false;
    await page.route('**/rest/v1/rpc/delete_user_account', async route => {
      rpcCalled = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });

    // Intercept Supabase signOut
    await page.route('**/auth/v1/logout', async route => {
      await route.fulfill({ status: 204 });
    });

    await setupApp(page);
    await page.click('.nav-tab[data-tab="settings"]');

    // Accept the confirm() dialog
    page.once('dialog', dialog => dialog.accept());

    await page.locator('#account-delete-btn').click();

    // After deletion, the page reloads — wait for app to be back
    await page.waitForFunction(() => (window as any).suntrailReady === true, { timeout: 15000 });

    expect(rpcCalled).toBe(true);
  });

});
