import { expect, test, type Page } from '@playwright/test';
import packageJSON from '../package.json';
import { APP_TEST_URL } from './app';

const DATABASE_NAME = 'suntrail-prepared-routes';
const ROUTE_STORE_NAME = 'routes';

type GuidanceQuality = 'full' | 'approximate' | 'not-ready';

function createRoute(
    id: string,
    name: string,
    guidanceQuality: GuidanceQuality
) {
    return {
        schemaVersion: 1,
        id,
        name,
        source: 'gpx-import',
        activityProfile: 'foot-hiking',
        loopEnabled: false,
        waypoints: [
            { lat: 46, lon: 7, alt: 500, name: 'Départ' },
            { lat: 46, lon: 7.002, alt: 505, name: 'Arrivée' },
        ],
        geometry: [
            { lat: 46, lon: 7, ele: 500 },
            { lat: 46, lon: 7.001, ele: 502 },
            { lat: 46, lon: 7.002, ele: 505 },
        ],
        stats: {
            distance: 0.154,
            ascent: 5,
            descent: 0,
            duration: 3,
            routingDuration: 3,
            pointCount: 3,
            technicalDifficulty: {
                status: 'unknown',
                source: 'gpx',
                sacLevel: null,
                coveragePercent: 0,
                reason: 'gpx-no-difficulty',
            },
            dataCoverage: {
                trailDifficulty: 0,
                steepness: 0,
                surface: 0,
                wayType: 0,
            },
            effort: {
                level: 'easy',
                score: 1,
                method: 'distance-dplus-duration-v1',
            },
            light: {
                status: 'unknown',
                etaAt: null,
                sunsetAt: null,
                daylightMarginMinutes: null,
            },
        },
        bounds: {
            minLat: 46,
            maxLat: 46,
            minLon: 7,
            maxLon: 7.002,
        },
        plannedStartAt: null,
        plannedPaceKmh: 4,
        favorite: false,
        notes: '',
        tags: [],
        guidanceQuality,
        createdAt: '2026-08-11T08:00:00.000Z',
        updatedAt: `2026-08-11T08:00:0${id.endsWith('full') ? '3' : id.endsWith('approximate') ? '2' : '1'}.000Z`,
    };
}

async function openGuidanceApp(page: Page): Promise<void> {
    await page.addInitScript((appVersion: string) => {
        localStorage.clear();
        localStorage.setItem('suntrail_acceptance_v1', '1');
        localStorage.setItem('suntrail_onboarding_v2', '1');
        localStorage.setItem('suntrail_gps_disclosure_v1', '1');
        localStorage.setItem('suntrail_app_version', appVersion);
    }, packageJSON.version);
    await page.goto(APP_TEST_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
        () => (window as { suntrailReady?: boolean }).suntrailReady === true
    );
}

async function seedRoutes(page: Page): Promise<void> {
    const routes = [
        createRoute('guidance-not-ready', 'Route non prête', 'not-ready'),
        createRoute(
            'guidance-approximate',
            'Route approximative',
            'approximate'
        ),
        createRoute('guidance-full', 'Route terrain E2E', 'full'),
    ];
    await page.evaluate(
        ({ databaseName, storeName, records }) =>
            new Promise<void>((resolve, reject) => {
                const request = indexedDB.open(databaseName);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const database = request.result;
                    const transaction = database.transaction(
                        storeName,
                        'readwrite'
                    );
                    const store = transaction.objectStore(storeName);
                    records.forEach((record) => store.put(record));
                    transaction.oncomplete = () => {
                        database.close();
                        resolve();
                    };
                    transaction.onerror = () => reject(transaction.error);
                };
            }),
        {
            databaseName: DATABASE_NAME,
            storeName: ROUTE_STORE_NAME,
            records: routes,
        }
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
        () => (window as { suntrailReady?: boolean }).suntrailReady === true
    );
    // L'UI secondaire est hydratée après le marqueur global suntrailReady.
    // Attendre le panneau empêche un clic précoce qui active visuellement
    // l'onglet Bibliothèque sans pouvoir encore ouvrir la sheet.
    await expect(page.locator('#track')).toBeAttached();
    await page.locator('.nav-tab[data-tab="library"]').click();
    await expect(page.locator('#track')).toHaveClass(/is-open/);
    await expect(page.locator('#prepared-routes-section')).toBeVisible();
    await expect(page.locator('#prepared-storage-error')).toBeHidden();
}

test.describe('Foreground Guidance', () => {
    test.use({
        serviceWorkers: 'block',
        viewport: { width: 384, height: 800 },
        permissions: ['geolocation'],
        geolocation: { latitude: 46, longitude: 7.0001, accuracy: 5 },
    });
    test.skip(
        ({ browserName }) => browserName !== 'chromium',
        'Foreground guidance acceptance is Chromium-only.'
    );

    test('starts, pauses, resumes, arrives and stops while REC remains independent', async ({
        page,
        context,
    }) => {
        test.setTimeout(90_000);
        await openGuidanceApp(page);
        await seedRoutes(page);

        await page
            .locator(
                '[data-route-id="guidance-full"] [data-route-action="guidance"]'
            )
            .click();
        const overlay = page.locator('#guidance-foreground');
        await expect(overlay).toBeVisible();
        await expect(page.locator('#guidance-route-name')).toHaveText(
            'Route terrain E2E'
        );
        await expect(page.locator('#guidance-direction')).toBeVisible();
        await expect(page.locator('#guidance-direction')).toHaveAttribute(
            'aria-label',
            'Direction de la suite de la trace'
        );
        await expect(page.locator('#gps-main-btn')).not.toHaveClass(
            /following/
        );
        await expect(page.locator('#route-bar')).toBeHidden();
        await expect(page.locator('#route-plan-hud')).toBeHidden();
        const mapControls = page.locator('.fab-stack');
        await expect(mapControls).toBeVisible();
        for (const selector of [
            '#compass-fab',
            '#gps-main-btn',
            '#layers-fab',
            '#nav-2d-toggle',
        ]) {
            await expect(page.locator(selector)).toBeVisible();
        }
        for (const width of [360, 384, 412]) {
            await page.setViewportSize({ width, height: 800 });
            const [guidanceBox, controlsBox] = await Promise.all([
                overlay.boundingBox(),
                mapControls.boundingBox(),
            ]);
            expect(guidanceBox).not.toBeNull();
            expect(controlsBox).not.toBeNull();
            expect(guidanceBox!.x + guidanceBox!.width).toBeLessThanOrEqual(
                controlsBox!.x
            );
        }
        await page.setViewportSize({ width: 800, height: 412 });
        const [landscapeGuidanceBox, landscapeControlsBox] = await Promise.all([
            overlay.boundingBox(),
            mapControls.boundingBox(),
        ]);
        expect(landscapeGuidanceBox).not.toBeNull();
        expect(landscapeControlsBox).not.toBeNull();
        expect(
            landscapeGuidanceBox!.x + landscapeGuidanceBox!.width
        ).toBeLessThanOrEqual(landscapeControlsBox!.x);
        await page.setViewportSize({ width: 412, height: 800 });
        await page.evaluate(
            () =>
                new Promise<void>((resolve) =>
                    requestAnimationFrame(() =>
                        requestAnimationFrame(() => resolve())
                    )
                )
        );
        await expect(overlay).toHaveAttribute('data-expanded', 'false');
        await expect(page.locator('#guidance-gps')).toBeHidden();
        await page.locator('[data-guidance-action="expand"]').click();
        await expect(overlay).toHaveAttribute('data-expanded', 'true');
        await expect(page.locator('#guidance-gps')).toBeVisible();
        await expect(page.locator('#gps-main-btn')).not.toHaveClass(
            /following/
        );
        await page.locator('[data-guidance-action="expand"]').click();
        await expect(overlay).toHaveAttribute('data-expanded', 'false');
        const profileAction = page.locator('[data-guidance-action="profile"]');
        await profileAction.click();
        const profile = page.locator('#elevation-profile');
        await expect(page.locator('body')).toHaveClass(/guidance-profile-open/);
        await expect(profile).toBeVisible();
        const [safetyBox, profileBox, profileControlsBox] = await Promise.all([
            overlay.boundingBox(),
            profile.boundingBox(),
            mapControls.boundingBox(),
        ]);
        expect(safetyBox).not.toBeNull();
        expect(profileBox).not.toBeNull();
        expect(profileControlsBox).not.toBeNull();
        expect(safetyBox!.y + safetyBox!.height).toBeLessThan(profileBox!.y);
        expect(safetyBox!.x).toBeLessThanOrEqual(10);
        expect(safetyBox!.width).toBeGreaterThanOrEqual(392);
        expect(profileBox!.x + profileBox!.width).toBeLessThanOrEqual(
            profileControlsBox!.x
        );
        await page.locator('#close-profile').click();
        await expect(page.locator('body')).not.toHaveClass(
            /guidance-profile-open/
        );
        await expect(profile).not.toHaveClass(/is-open/);
        await expect(profile).toHaveCSS('pointer-events', 'none');
        await expect(
            page.locator('[data-guidance-action="recenter"]')
        ).toHaveCount(0);

        await context.setGeolocation({
            latitude: 46,
            longitude: 7.0007,
            accuracy: 5,
        });
        await expect(page.locator('#guidance-status')).toHaveText(
            'Sur la trace',
            { timeout: 10_000 }
        );

        await page.locator('[data-guidance-action="pause"]').click();
        await expect(page.locator('#guidance-status')).toHaveText('En pause');
        await page.locator('[data-guidance-action="pause"]').click();
        await expect(page.locator('#guidance-status')).toHaveText('GPS…');
        await context.setGeolocation({
            latitude: 46,
            longitude: 7.001,
            accuracy: 5,
        });

        await context.setGeolocation({
            latitude: 46,
            longitude: 7.00196,
            accuracy: 5,
        });
        await page.waitForTimeout(10_500);
        await context.setGeolocation({
            latitude: 46,
            longitude: 7.00199,
            accuracy: 5,
        });
        await expect(page.locator('#guidance-status')).toHaveText('Arrivé', {
            timeout: 10_000,
        });

        await page.locator('[data-guidance-action="record"]').click();
        await expect(
            page.locator('[data-guidance-action="record"]')
        ).toHaveAttribute('data-recording', 'true');
        await expect(page.locator('#rec-status-widget')).toBeVisible();
        await expect(overlay).toBeVisible();

        await page.locator('[data-guidance-action="record"]').click();
        await expect(page.locator('#rec-status-widget')).toBeHidden();
        await expect(overlay).toBeVisible();

        await page.locator('[data-guidance-action="record"]').click();
        await expect(page.locator('#rec-status-widget')).toBeVisible();

        await page.locator('[data-guidance-action="stop"]').click();
        await expect(overlay).toBeHidden();
        await expect(mapControls).toBeVisible();
        await expect(page.locator('#rec-status-widget')).toBeVisible();

        await page.locator('.nav-tab[data-tab="track"]').click();
        await page.locator('#rec-btn-sheet').click();
        await expect(page.locator('#rec-status-widget')).toBeHidden();
    });

    test('requires confirmation for approximate routes and clearly refuses not-ready routes', async ({
        page,
    }) => {
        await openGuidanceApp(page);
        await seedRoutes(page);

        await page
            .locator(
                '[data-route-id="guidance-not-ready"] [data-route-action="guidance"]'
            )
            .click();
        await expect(
            page.locator('#toast-container .toast').last()
        ).toContainText('pas prête pour le suivi');
        await expect(page.locator('#guidance-foreground')).toBeHidden();

        await page
            .locator(
                '[data-route-id="guidance-approximate"] [data-route-action="guidance"]'
            )
            .click();
        await expect(page.locator('#confirm-dialog-overlay')).toBeVisible();
        await expect(page.locator('.confirm-dialog-message')).toContainText(
            'géométrie approximative'
        );
        await page.locator('[data-action="cancel"]').click();
        await expect(page.locator('#guidance-foreground')).toBeHidden();

        await page
            .locator(
                '[data-route-id="guidance-approximate"] [data-route-action="guidance"]'
            )
            .click();
        await page.locator('[data-action="confirm"]').click();
        await expect(page.locator('#guidance-foreground')).toBeVisible();
        await expect(page.locator('#guidance-route-name')).toHaveText(
            'Route approximative'
        );
        await page.locator('[data-guidance-action="stop"]').click();
        await expect(page.locator('#guidance-foreground')).toBeHidden();
    });
});
