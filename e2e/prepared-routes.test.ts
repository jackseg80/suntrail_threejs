import { expect, test, type Page } from '@playwright/test';
import path from 'path';
import packageJSON from '../package.json';
import { APP_TEST_URL } from './app';

const DATABASE_NAME = 'suntrail-prepared-routes';
const STORE_NAME = 'routes';

async function openPreparedRoutesApp(
    page: Page,
    extraStorage: Record<string, string> = {}
): Promise<void> {
    await page.addInitScript(
        ({
            storage,
            appVersion,
        }: {
            storage: Record<string, string>;
            appVersion: string;
        }) => {
            const marker = 'suntrail_prepared_routes_e2e_boot';
            if (sessionStorage.getItem(marker) === '1') return;
            localStorage.clear();
            sessionStorage.setItem(marker, '1');
            localStorage.setItem('suntrail_acceptance_v1', '1');
            localStorage.setItem('suntrail_onboarding_v2', '1');
            localStorage.setItem('suntrail_app_version', appVersion);
            for (const [key, value] of Object.entries(storage)) {
                localStorage.setItem(key, value);
            }
        },
        { storage: extraStorage, appVersion: packageJSON.version }
    );
    await page.goto(APP_TEST_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
        () => (window as { suntrailReady?: boolean }).suntrailReady === true
    );
    await page.waitForFunction(
        () => document.body.dataset.preparedRoutes === 'enabled'
    );
}

async function mockOSRM(page: Page): Promise<void> {
    await page.route('**/router.project-osrm.org/**', async (route) => {
        const url = new URL(route.request().url());
        const coordinates = decodeURIComponent(
            url.pathname.split('/').pop() ?? ''
        )
            .split(';')
            .map((pair) => pair.split(',').map(Number));
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                code: 'Ok',
                routes: [
                    {
                        distance: 4200,
                        duration: 3600,
                        geometry: { coordinates },
                    },
                ],
            }),
        });
    });
}

async function mockGeocoding(page: Page): Promise<void> {
    await page.route(/api\.maptiler\.com\/geocoding\//, async (route) => {
        const pathname = decodeURIComponent(
            new URL(route.request().url()).pathname
        );
        const isEnd = pathname.includes('Arrivee E2E');
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                features: [
                    {
                        geometry: {
                            coordinates: isEnd ? [7.51, 46.51] : [7.5, 46.5],
                        },
                        place_name: isEnd
                            ? 'Arrivee E2E, Valais'
                            : 'Depart E2E, Valais',
                        place_type: ['poi'],
                    },
                ],
            }),
        });
    });
}

async function planAndSave(page: Page, name: string): Promise<void> {
    const prepare = page.locator('.nav-tab[data-tab="prepare"]');
    await prepare.click();
    await page.locator('#rb-settings-btn').click();
    await expect(page.locator('#route-settings')).not.toHaveClass(/hidden/);
    await page.locator('#rs-route-name').fill(name);
    await page.locator('label[for="rs-loop"]').click();
    await page.locator('#rs-planned-start').fill('2026-08-10T08:00');
    await page.locator('#rs-pace').fill('4.5');
    await page.locator('#rs-pace').dispatchEvent('change');
    await page.locator('#rs-start-search').fill('Depart E2E');
    await page.locator('#rs-start-results [data-result-index="0"]').click();
    await expect(page.locator('#route-settings')).toBeVisible();
    await page.locator('#rs-end-search').fill('Arrivee E2E');
    await page.locator('#rs-end-results [data-result-index="0"]').click();
    await expect(page.locator('#route-settings')).toBeVisible();
    await expect(page.locator('#rb-dots .rb-dot')).toHaveCount(2);
    await expect(page.locator('#rb-save-btn')).toBeEnabled({
        timeout: 15_000,
    });

    await page.locator('#rb-save-btn').click();
    await expect
        .poll(() => countPreparedRoutes(page), { timeout: 10_000 })
        .toBe(1);
}

async function countPreparedRoutes(page: Page): Promise<number> {
    return page.evaluate(
        ({ databaseName, storeName }) =>
            new Promise<number>((resolve, reject) => {
                const request = indexedDB.open(databaseName);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const database = request.result;
                    const transaction = database.transaction(
                        storeName,
                        'readonly'
                    );
                    const count = transaction.objectStore(storeName).count();
                    count.onsuccess = () => resolve(count.result);
                    count.onerror = () => reject(count.error);
                    transaction.oncomplete = () => database.close();
                };
            }),
        { databaseName: DATABASE_NAME, storeName: STORE_NAME }
    );
}

test.describe('Prepared Routes with real Chromium IndexedDB', () => {
    test.use({ serviceWorkers: 'block' });
    test.skip(
        ({ browserName }) => browserName !== 'chromium',
        'The real IndexedDB acceptance gate is Chromium-only.'
    );

    test('saves, reloads offline, reopens, and deletes a complete route in under two minutes', async ({
        page,
        context,
    }) => {
        test.setTimeout(120_000);
        const startedAt = Date.now();
        await mockOSRM(page);
        await mockGeocoding(page);
        await openPreparedRoutesApp(page);
        await planAndSave(page, 'Boucle E2E locale');

        const saved = await page.evaluate(
            ({ databaseName, storeName }) =>
                new Promise<Record<string, unknown>>((resolve, reject) => {
                    const request = indexedDB.open(databaseName);
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => {
                        const database = request.result;
                        const transaction = database.transaction(
                            storeName,
                            'readonly'
                        );
                        const all = transaction.objectStore(storeName).getAll();
                        all.onsuccess = () => resolve(all.result[0]);
                        all.onerror = () => reject(all.error);
                        transaction.oncomplete = () => database.close();
                    };
                }),
            { databaseName: DATABASE_NAME, storeName: STORE_NAME }
        );
        expect(saved).toMatchObject({
            schemaVersion: 1,
            name: 'Boucle E2E locale',
            source: 'manual',
            guidanceQuality: 'full',
            plannedPaceKmh: 4.5,
            loopEnabled: true,
        });
        expect((saved.geometry as unknown[]).length).toBeGreaterThanOrEqual(2);

        // Consulter un GPX ne remplace pas la route préparée. Le passage du GPX
        // dans l'atelier demande une action explicite, puis sa suppression ne
        // doit pas empêcher de rouvrir la route locale.
        await page.locator('.nav-tab[data-tab="prepare"]').click();
        await page.locator('.nav-tab[data-tab="track"]').click();
        await page.setInputFiles(
            '#gpx-upload',
            path.join(__dirname, 'test-data', 'E2E-Test-Track.gpx')
        );
        await expect(
            page.locator('.gpx-layer-item', { hasText: 'E2E-Test-Track' })
        ).toBeVisible();
        await page.locator('.nav-tab[data-tab="prepare"]').click();
        await page.locator('#rb-settings-btn').click();
        await expect(page.locator('#rs-route-name')).toHaveValue(
            'Boucle E2E locale'
        );

        await page.locator('.nav-tab[data-tab="prepare"]').click();
        await page.locator('.nav-tab[data-tab="track"]').click();
        const importedToPrepare = page.locator('.gpx-layer-item', {
            hasText: 'E2E-Test-Track',
        });
        await expect(page.locator('.track-layers-overview')).toContainText(
            'Traces affichées'
        );
        await page.locator('[data-layer-overview-action="hide-all"]').click();
        await expect(page.locator('.track-layers-overview')).toContainText(
            'Traces affichées : 0'
        );
        await importedToPrepare.locator('.gpx-layer-info').click();
        await expect(page.locator('.track-layers-overview')).toContainText(
            'Traces affichées : 1'
        );
        await importedToPrepare
            .locator('[data-action="prepare-draft"]')
            .click();
        await page.locator('#rb-settings-btn').click();
        await expect(page.locator('#rs-route-name')).toHaveValue(
            'E2E-Test-Track'
        );
        await expect(page.locator('#rs-start-search')).not.toHaveValue('');
        await expect(page.locator('#rs-end-search')).not.toHaveValue('');

        await page.locator('.nav-tab[data-tab="prepare"]').click();
        await page.locator('.nav-tab[data-tab="track"]').click();
        const importedRow = page.locator('.gpx-layer-item', {
            hasText: 'E2E-Test-Track',
        });
        await importedRow.locator('[data-action="remove"]').click();
        await expect(importedRow).toHaveCount(0);
        await page.locator('.nav-tab[data-tab="library"]').click();
        const beforeReloadCard = page.locator('.prepared-route-card', {
            hasText: 'Boucle E2E locale',
        });
        await beforeReloadCard.locator('[data-route-action="open"]').click();
        await expect(page.locator('#prepared-draft-replace')).toBeVisible();
        await page.locator('#prepared-draft-replace').click();
        await page.locator('#rb-settings-btn').click();
        await expect(page.locator('#rs-route-name')).toHaveValue(
            'Boucle E2E locale'
        );
        await expect(page.locator('#rs-loop')).toBeChecked();

        await context.route(/^(?!http:\/\/127\.0\.0\.1:5173)/, async (route) =>
            route.abort('internetdisconnected')
        );
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(
            () => (window as { suntrailReady?: boolean }).suntrailReady === true
        );
        await page.waitForFunction(
            () => document.body.dataset.preparedRoutes === 'enabled'
        );

        await page.locator('.nav-tab[data-tab="library"]').click();
        await page.setViewportSize({ width: 360, height: 800 });
        await expect(page.locator('#track')).toHaveClass(/is-open/);
        const card = page.locator('.prepared-route-card', {
            hasText: 'Boucle E2E locale',
        });
        await expect(card).toBeVisible();
        expect(
            await page.locator('#track').evaluate((panel) => {
                const panelRect = panel.getBoundingClientRect();
                return Array.from(
                    panel.querySelectorAll<HTMLElement>(
                        '.prepared-route-card, .prepared-route-card *, .gpx-layer-item, .gpx-layer-item *'
                    )
                ).every((element) => {
                    const rect = element.getBoundingClientRect();
                    return (
                        rect.left >= panelRect.left - 1 &&
                        rect.right <= panelRect.right + 1
                    );
                });
            })
        ).toBe(true);
        await card.locator('[data-route-action="open"]').click();
        await expect(page.locator('#rb-dots .rb-dot')).toHaveCount(2);
        await expect(page.locator('#rb-info')).toContainText('km');
        await page.locator('#rb-settings-btn').click();
        await expect(page.locator('#rs-loop')).toBeChecked();
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth
            )
        ).toBe(true);

        await page.locator('.nav-tab[data-tab="library"]').click();
        page.once('dialog', (dialog) => dialog.accept());
        await card.locator('[data-route-action="delete"]').click();
        await expect
            .poll(() => countPreparedRoutes(page), { timeout: 10_000 })
            .toBe(0);
        expect(Date.now() - startedAt).toBeLessThan(120_000);
    });

    test('upgrades a real version 1 database additively', async ({ page }) => {
        await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
        await page.evaluate(
            ({ databaseName, storeName }) =>
                new Promise<void>((resolve, reject) => {
                    const deletion = indexedDB.deleteDatabase(databaseName);
                    deletion.onerror = () => reject(deletion.error);
                    deletion.onsuccess = () => {
                        const request = indexedDB.open(databaseName, 1);
                        request.onupgradeneeded = () => {
                            request.result.createObjectStore(storeName, {
                                keyPath: 'id',
                            });
                        };
                        request.onerror = () => reject(request.error);
                        request.onsuccess = () => {
                            request.result.close();
                            resolve();
                        };
                    };
                }),
            { databaseName: DATABASE_NAME, storeName: STORE_NAME }
        );

        await openPreparedRoutesApp(page);
        const databaseInfo = await page.evaluate(
            ({ databaseName, storeName }) =>
                new Promise<{ version: number; indexes: string[] }>(
                    (resolve, reject) => {
                        const request = indexedDB.open(databaseName);
                        request.onerror = () => reject(request.error);
                        request.onsuccess = () => {
                            const database = request.result;
                            const store = database
                                .transaction(storeName, 'readonly')
                                .objectStore(storeName);
                            resolve({
                                version: database.version,
                                indexes: Array.from(store.indexNames),
                            });
                            database.close();
                        };
                    }
                ),
            { databaseName: DATABASE_NAME, storeName: STORE_NAME }
        );
        expect(databaseInfo.version).toBe(2);
        expect(databaseInfo.indexes).toEqual(
            expect.arrayContaining(['updatedAt', 'favorite', 'name'])
        );
    });

    test('reopens a prepared GPX loop with full geometry, anchors, and profile', async ({
        page,
    }) => {
        await openPreparedRoutesApp(page);
        await page.locator('.nav-tab[data-tab="track"]').click();
        await page.setInputFiles('#gpx-upload', {
            name: 'Boucle-GPX-E2E.gpx',
            mimeType: 'application/gpx+xml',
            buffer: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SunTrail E2E" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Boucle GPX E2E</name><trkseg>
    <trkpt lat="46.5000" lon="7.5000"><ele>1000</ele></trkpt>
    <trkpt lat="46.5100" lon="7.5200"><ele>1120</ele></trkpt>
    <trkpt lat="46.4900" lon="7.5300"><ele>1240</ele></trkpt>
    <trkpt lat="46.4800" lon="7.5100"><ele>1080</ele></trkpt>
    <trkpt lat="46.5000" lon="7.5000"><ele>1000</ele></trkpt>
  </trkseg></trk>
</gpx>`),
        });

        const imported = page.locator('.gpx-layer-item', {
            hasText: 'Boucle-GPX-E2E',
        });
        await imported.locator('[data-action="prepare-draft"]').click();
        await expect(page.locator('#rb-dots .rb-dot')).toHaveCount(4);
        await page.locator('#rb-settings-btn').click();
        await expect(page.locator('#rs-loop')).toBeChecked();
        await expect(
            page.locator('#rs-waypoints-list .rs-wp-item')
        ).toHaveCount(4);
        await page.locator('#rb-save-btn').click();
        await expect
            .poll(() => countPreparedRoutes(page), { timeout: 10_000 })
            .toBe(1);

        const stored = await page.evaluate(
            ({ databaseName, storeName }) =>
                new Promise<{
                    pointCount: number;
                    waypointCount: number;
                    difficultySource: string;
                }>((resolve, reject) => {
                    const request = indexedDB.open(databaseName);
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => {
                        const database = request.result;
                        const transaction = database.transaction(
                            storeName,
                            'readonly'
                        );
                        const all = transaction.objectStore(storeName).getAll();
                        all.onerror = () => reject(all.error);
                        all.onsuccess = () => {
                            const route = all.result[0];
                            resolve({
                                pointCount: route.geometry.length,
                                waypointCount: route.waypoints.length,
                                difficultySource:
                                    route.stats.technicalDifficulty.source,
                            });
                        };
                        transaction.oncomplete = () => database.close();
                    };
                }),
            { databaseName: DATABASE_NAME, storeName: STORE_NAME }
        );
        expect(stored).toEqual({
            pointCount: 5,
            waypointCount: 4,
            difficultySource: 'gpx',
        });

        await page.locator('#close-profile').click();
        await expect(page.locator('#elevation-profile')).not.toHaveClass(
            /is-open/
        );
        await page.locator('.nav-tab[data-tab="library"]').click();
        await page
            .locator('.prepared-route-card', { hasText: 'Boucle-GPX-E2E' })
            .locator('[data-route-action="open"]')
            .click();
        await expect(page.locator('#elevation-profile')).toHaveClass(/is-open/);
        await expect(page.locator('#rb-dots .rb-dot')).toHaveCount(4);
        await expect(page.locator('#profile-info')).toContainText('km');
    });

    test('keeps legacy history and marks explicit conversion approximate', async ({
        page,
    }) => {
        const legacyHistory = [
            {
                id: 'legacy-route-1',
                name: 'Ancienne trace E2E',
                color: '#ff8800',
                source: 'rec',
                timestamp: Date.parse('2026-08-08T08:00:00.000Z'),
                stats: {
                    distance: 6.2,
                    dPlus: 410,
                    dMinus: 405,
                    pointCount: 850,
                    estimatedTime: 125,
                },
                simplifiedPoints: [
                    { lat: 46.5, lon: 7.5, ele: 1000 },
                    { lat: 46.55, lon: 7.55, ele: 1350 },
                    { lat: 46.6, lon: 7.6, ele: 1010 },
                ],
                centerLat: 46.55,
                centerLon: 7.55,
                bounds: {
                    minLat: 46.5,
                    maxLat: 46.6,
                    minLon: 7.5,
                    maxLon: 7.6,
                },
            },
        ];
        const serializedHistory = JSON.stringify(legacyHistory);
        await openPreparedRoutesApp(page, {
            suntrail_gpx_history_v1: serializedHistory,
        });
        await page.locator('.nav-tab[data-tab="library"]').click();
        const legacyRow = page.locator(
            '.gpx-layer-item[data-layer-id="legacy-route-1"]'
        );
        await expect(legacyRow).toBeVisible();

        page.once('dialog', (dialog) => dialog.accept());
        await legacyRow.locator('[data-action="legacy-convert"]').click();
        await expect
            .poll(() => countPreparedRoutes(page), { timeout: 10_000 })
            .toBe(1);
        await expect(legacyRow).toBeVisible();
        await expect(page.locator('.prepared-route-warning')).toBeVisible();
        const preservedHistory = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('suntrail_gpx_history_v1') ?? '[]')
        );
        expect(preservedHistory).toHaveLength(1);
        expect(preservedHistory[0]).toMatchObject({
            id: 'legacy-route-1',
            simplifiedPoints: legacyHistory[0].simplifiedPoints,
        });

        const quality = await page.evaluate(
            ({ databaseName, storeName }) =>
                new Promise<{
                    guidanceQuality: string;
                    source: string;
                    difficultySource: string;
                }>((resolve, reject) => {
                    const request = indexedDB.open(databaseName);
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => {
                        const database = request.result;
                        const transaction = database.transaction(
                            storeName,
                            'readonly'
                        );
                        const all = transaction.objectStore(storeName).getAll();
                        all.onerror = () => reject(all.error);
                        all.onsuccess = () => {
                            const route = all.result[0];
                            resolve({
                                guidanceQuality: route.guidanceQuality,
                                source: route.source,
                                difficultySource:
                                    route.stats.technicalDifficulty.source,
                            });
                        };
                        transaction.oncomplete = () => database.close();
                    };
                }),
            { databaseName: DATABASE_NAME, storeName: STORE_NAME }
        );
        expect(quality).toEqual({
            guidanceQuality: 'approximate',
            source: 'legacy-conversion',
            difficultySource: 'legacy',
        });
    });
});
