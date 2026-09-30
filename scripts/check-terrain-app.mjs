/** Local full-app smoke. Own browser contexts; no phone or user cache changes. */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseURL = process.env.TERRAIN_TEST_URL ?? 'http://127.0.0.1:4187';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(baseURL))
    throw new Error('Local test server required');
const cache = process.argv[2];
if (!cache)
    throw new Error('Usage: node scripts/check-terrain-app.mjs <source-cache>');
const output = 'output/terrain-moire';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const reports = [];
try {
    for (const [name, lat, lon, packExpected] of [
        ['native-delemont', 47.35099, 7.37812, false],
        ['pack-yverdon', 46.745, 6.68, true],
        ['pack-davos', 46.795, 9.82, true],
    ]) {
        const context = await browser.newContext({
            baseURL,
            viewport: { width: 1100, height: 900 },
            serviceWorkers: 'block',
        });
        const sourceReads = [];
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
            if (
                message.type() === 'error' &&
                /WebGLProgram|Shader Error|VALIDATE_STATUS|GL_INVALID/.test(
                    message.text()
                )
            )
                errors.push(message.text());
        });
        await context.route('**/*', async (route) => {
            const url = new URL(route.request().url());
            if (url.origin === baseURL) return route.continue();
            if (
                route.request().method() === 'HEAD' &&
                url.hostname === 'tile.openstreetmap.org'
            ) {
                return route.fulfill({ status: 204 }); // deterministic connectivity probe
            }
            let match = url.pathname.match(
                /terrain-rgb-v2\/(\d+)\/(\d+)\/(\d+)\.png$/
            );
            let type = 'elevation';
            if (!match && url.hostname === 'wmts.geo.admin.ch') {
                match = url.pathname.match(
                    /3857\/(\d+)\/(\d+)\/(\d+)\.[a-z]+$/
                );
                type = url.pathname.includes('wanderwege')
                    ? 'overlay'
                    : 'color';
            }
            if (match) {
                const filename = path.join(
                    cache,
                    `${type}_${match[1]}_${match[2]}_${match[3]}.raw`
                );
                if (fs.existsSync(filename)) {
                    const bytes = fs.readFileSync(filename);
                    sourceReads.push({
                        type,
                        z: +match[1],
                        x: +match[2],
                        y: +match[3],
                        size: bytes.length,
                    });
                    return route.fulfill({
                        status: 200,
                        contentType:
                            type === 'color' ? 'image/jpeg' : 'image/png',
                        body: bytes,
                        headers: { 'Access-Control-Allow-Origin': '*' },
                    });
                }
                return route.fulfill({ status: 404 }); // absent data is not a simulated transport failure
            }
            return route.abort(); // never use live DEM/CDN data or account services
        });
        await page.addInitScript(
            ({ lat, lon }) => {
                localStorage.setItem('suntrail_acceptance_v1', '1');
                localStorage.setItem('suntrail_onboarding_v3', '1');
                localStorage.setItem(
                    'suntrail_settings',
                    JSON.stringify({
                        version: '5.10.0',
                        lang: 'fr',
                        MAP_SOURCE: 'swisstopo',
                        PERFORMANCE_PRESET: 'custom',
                        IS_2D_MODE: true,
                        LAST_LAT: lat,
                        LAST_LON: lon,
                        LAST_ZOOM: 14,
                        SHOW_TRAILS: false,
                        SHOW_SLOPES: false,
                        SHOW_SIGNPOSTS: false,
                        SHOW_BUILDINGS: false,
                        SHOW_HYDROLOGY: false,
                        SHOW_VEGETATION: false,
                        SHOW_WEATHER: false,
                        SHOW_WEATHER_PRO: false,
                        SHOW_INCLINOMETER: true,
                        SHADOWS: false,
                        RESOLUTION: 64,
                        RANGE: 3,
                        FOG_FAR: 60000,
                        VEGETATION_DENSITY: 0,
                        WEATHER_DENSITY: 0,
                        WEATHER_SPEED: 1,
                        WEATHER_RAIN_OPACITY: 0,
                        HIDE_UI_ON_MOVE: false,
                    })
                );
            },
            { lat, lon }
        );
        await page.goto('/app.html?mode=test&tileDiagnostics=1');
        await page.waitForFunction(
            () =>
                window.suntrailReady &&
                window.suntrailSecondaryReady &&
                document.getElementById('settings'),
            null,
            { timeout: 30000 }
        );
        await page.locator('[data-tab="settings"]').click();
        if (
            !(await page.locator('#settings').getAttribute('class')).includes(
                'is-open'
            )
        )
            throw new Error('Configured settings panel did not open');
        await page.locator('#close-panel').click();
        await page.waitForFunction(
            () =>
                window.suntrailTileDiagnostics
                    .snapshot()
                    .traces.some(
                        (trace) =>
                            trace.mode === '2d' &&
                            trace.events.some(
                                (event) =>
                                    event.phase === 'first-render-submitted'
                            )
                    ),
            null,
            { timeout: 30000 }
        );
        await page.screenshot({ path: `${output}/web-${name}-2d.png` });
        if (packExpected) {
            // Fresh context: 2D has not requested elevation. Force application
            // offline BEFORE 3D, so a warm DEM/network cannot hide a pack miss.
            await page.evaluate(() => {
                const toggle = document.getElementById('offline-toggle');
                toggle.checked = true;
                toggle.dispatchEvent(new Event('change', { bubbles: true }));
            });
        }
        await page.locator('#nav-2d-toggle').click();
        await page.waitForFunction(
            () =>
                !document.body.classList.contains('mode-2d') &&
                window.suntrailTileDiagnostics
                    .snapshot()
                    .traces.some(
                        (trace) =>
                            trace.mode === '3d' &&
                            trace.events.some(
                                (event) =>
                                    event.phase === 'first-render-submitted'
                            )
                    ),
            null,
            { timeout: 30000 }
        );
        await page.evaluate(() => {
            const slider = document.getElementById('time-slider');
            slider.dispatchEvent(new Event('pointerdown', { bubbles: true }));
            slider.value = '720';
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            slider.dispatchEvent(new Event('pointerup', { bubbles: true }));
        });
        await page.waitForFunction(
            () =>
                window.suntrailTileDiagnostics.snapshot().cache.pixelDataBytes >
                0
        );
        await page.waitForTimeout(4000); // camera transition, tile fade and temporary toast; not a performance measurement
        await page.screenshot({ path: `${output}/web-${name}-3d.png` });
        const snapshot = await page.evaluate(() =>
            window.suntrailTileDiagnostics.snapshot()
        );
        const rendered = snapshot.traces.filter(
            (trace) =>
                trace.mode === '3d' &&
                trace.events.some(
                    (event) => event.phase === 'first-render-submitted'
                )
        );
        const localElevation = rendered.filter((trace) =>
            trace.resources.some(
                (resource) =>
                    resource.resource === 'elevation' &&
                    resource.source === 'country-pack-asset'
            )
        );
        const nativeElevation = rendered.filter((trace) =>
            trace.resources.some(
                (resource) =>
                    resource.resource === 'elevation' &&
                    resource.source === 'network'
            )
        );
        const report = {
            name,
            lat,
            lon,
            rendered3dTiles: rendered.length,
            assetElevationTiles: localElevation.length,
            nativeElevationTiles: nativeElevation.length,
            manualOfflineFor3d: packExpected,
            sourceReads,
            errors,
            passed:
                errors.length === 0 &&
                rendered.length > 0 &&
                (packExpected
                    ? localElevation.length > 0 && nativeElevation.length === 0
                    : nativeElevation.length > 0),
        };
        fs.writeFileSync(
            `${output}/web-${name}-tiles.json`,
            JSON.stringify(snapshot, null, 2)
        );
        reports.push(report);
        await context.close();
    }
    fs.writeFileSync(
        `${output}/web-app-smoke.json`,
        JSON.stringify(
            {
                scope: 'Desktop Chromium software GPU, local frozen source tiles, not S23 visual validation.',
                reports,
            },
            null,
            2
        )
    );
    console.log(
        JSON.stringify(
            reports.map(({ sourceReads, ...report }) => ({
                ...report,
                frozenSourceReadCount: sourceReads.length,
            })),
            null,
            2
        )
    );
    if (reports.some((report) => !report.passed))
        throw new Error('Application terrain smoke failed');
} finally {
    await browser.close();
}
