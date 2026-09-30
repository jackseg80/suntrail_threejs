/** Non-destructive WebView inspection; ADB must forward the DIAGNOSTIC socket. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const adb = path.join(
    process.env.LOCALAPPDATA,
    'Android/Sdk/platform-tools/adb.exe'
);
const serial = process.env.SUNTRAIL_DIAGNOSTIC_SERIAL ?? 'RFCW100D37E';
const adbArgs = ['-s', serial];
const pid = execFileSync(
    adb,
    [...adbArgs, 'shell', 'pidof', 'com.suntrail.threejs.diagnostic'],
    { encoding: 'utf8' }
).trim();
if (!/^\d+$/.test(pid)) throw new Error('Diagnostic app must be running');
const forwards = execFileSync(adb, ['forward', '--list'], { encoding: 'utf8' });
if (
    !forwards
        .split(/\r?\n/)
        .some(
            (line) =>
                line.trim() ===
                `${serial} tcp:9223 localabstract:webview_devtools_remote_${pid}`
        )
) {
    throw new Error(
        `Forward tcp:9223 ONLY to diagnostic socket webview_devtools_remote_${pid}`
    );
}
const focus = execFileSync(adb, [...adbArgs, 'shell', 'dumpsys', 'window'], {
    encoding: 'utf8',
});
if (
    !focus
        .split(/\r?\n/)
        .some(
            (line) =>
                /mCurrentFocus=/.test(line) &&
                line.includes('com.suntrail.threejs.diagnostic/')
        )
) {
    throw new Error('Only the diagnostic app may be foreground for this check');
}
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
try {
    const page = browser
        .contexts()[0]
        .pages()
        .find((page) => page.url().includes('/app.html'));
    if (!page) throw new Error('Diagnostic app page unavailable');
    const mode = process.argv[2] ?? 'inspect';
    const folder = 'output/terrain-moire';
    fs.mkdirSync(folder, { recursive: true });
    if (mode === 'errors') {
        const session = await page.context().newCDPSession(page);
        const events = [];
        session.on('Runtime.consoleAPICalled', (event) => {
            if (['error', 'warning'].includes(event.type))
                events.push({
                    type: event.type,
                    text: event.args
                        .map((arg) => arg.value ?? arg.description ?? '')
                        .join(' ')
                        .replace(/([?&]key=)[^&\s]+/g, '$1[redacted]'),
                });
        });
        session.on('Runtime.exceptionThrown', (event) =>
            events.push({
                type: 'exception',
                text:
                    event.exceptionDetails.exception?.description ??
                    event.exceptionDetails.text,
            })
        );
        await session.send('Runtime.enable');
        await page.waitForTimeout(250);
        fs.writeFileSync(
            `${folder}/diagnostic-webview-errors.json`,
            JSON.stringify(events, null, 2)
        );
        console.log(JSON.stringify(events.slice(-8), null, 2));
        await session.detach();
    }
    if (mode === 'configure') {
        const [lat, lon, zoom] = process.argv.slice(3).map(Number);
        const range =
            process.argv[6] === undefined ? null : Number(process.argv[6]);
        if (![lat, lon, zoom].every(Number.isFinite))
            throw new Error('lat lon zoom required');
        if (
            lat < -85 ||
            lat > 85 ||
            lon < -180 ||
            lon > 180 ||
            !Number.isInteger(zoom) ||
            zoom < 5 ||
            zoom > 18
        )
            throw new Error('Invalid view coordinates');
        if (
            range !== null &&
            (!Number.isInteger(range) || range < 2 || range > 6)
        )
            throw new Error('Diagnostic range must be an integer from 2 to 6');
        const settings = await page.evaluate(() =>
            Object.fromEntries(
                Object.entries(localStorage).filter(([key]) =>
                    /settings|pro|offline/i.test(key)
                )
            )
        );
        if (!fs.existsSync(`${folder}/diagnostic-settings-before.json`))
            fs.writeFileSync(
                `${folder}/diagnostic-settings-before.json`,
                JSON.stringify(settings, null, 2)
            );
        await page.evaluate(
            ({ lat, lon, zoom, range }) => {
                const key = 'suntrail_settings';
                if (!localStorage.getItem(key))
                    throw new Error(
                        'Settings key absent; do not initialize arbitrary settings'
                    );
                const settings = JSON.parse(localStorage.getItem(key));
                Object.assign(settings, {
                    LAST_LAT: lat,
                    LAST_LON: lon,
                    LAST_ZOOM: zoom,
                    IS_2D_MODE: false,
                });
                if (range !== null) {
                    Object.assign(settings, {
                        RANGE: range,
                        PERFORMANCE_PRESET: 'custom',
                        HIDE_UI_ON_MOVE: false,
                    });
                }
                localStorage.setItem(key, JSON.stringify(settings));
            },
            { lat, lon, zoom, range }
        );
        await page.goto('https://localhost/app.html?tileDiagnostics=1', {
            waitUntil: 'domcontentloaded',
        });
        await page.waitForFunction(
            () => window.suntrailReady && window.suntrailSecondaryReady,
            null,
            { timeout: 15000 }
        );
    }
    if (mode === 'restore-view') {
        const saved = JSON.parse(
            fs.readFileSync(`${folder}/diagnostic-settings-before.json`, 'utf8')
        );
        if (typeof saved.suntrail_settings !== 'string')
            throw new Error('Original settings unavailable');
        await page.evaluate(
            (settings) => localStorage.setItem('suntrail_settings', settings),
            saved.suntrail_settings
        );
        await page.goto('https://localhost/app.html', {
            waitUntil: 'domcontentloaded',
        });
    }
    if (mode === 'offline') {
        await page
            .locator('#net-status-icon')
            .evaluate((button) => button.click());
        await page
            .locator('#offline-toggle')
            .waitFor({ state: 'attached', timeout: 15000 });
        await page.locator('#offline-toggle').evaluate((toggle, checked) => {
            toggle.checked = checked;
            toggle.dispatchEvent(new Event('change', { bubbles: true }));
        }, process.argv[3] === 'on');
        await page
            .locator('#close-connectivity')
            .evaluate((button) => button.click());
    }
    if (mode === 'snapshot') {
        const label = process.argv[3];
        if (!label || !/^[a-z0-9-]+$/.test(label))
            throw new Error('ASCII snapshot label required');
        const report = await page.evaluate(() =>
            window.suntrailTileDiagnostics.snapshot()
        );
        fs.writeFileSync(
            `${folder}/${label}-tiles.json`,
            JSON.stringify(report, null, 2)
        );
        const view = await page.evaluate(() => ({
            capturedAt: new Date().toISOString(),
            url: location.href,
            is2D: document.body.classList.contains('mode-2d'),
            lodLabel: document
                .getElementById('top-pill-lod')
                ?.textContent.trim(),
            settings: JSON.parse(
                localStorage.getItem('suntrail_settings') || '{}'
            ),
            lighting: {
                minutes: document.getElementById('time-slider')?.value,
                shadows: document.getElementById('shadow-toggle')?.checked,
                exaggeration: document.getElementById('exag-slider')?.value,
            },
            offlineToggle: document.getElementById('offline-toggle')?.checked,
        }));
        fs.writeFileSync(
            `${folder}/${label}-view.json`,
            JSON.stringify(view, null, 2)
        );
        // Android WebView CDP screenshots omit the GPU canvas: use compositor pixels.
        const args = adbArgs;
        execFileSync(adb, [
            ...args,
            'shell',
            'screencap',
            '-p',
            '/sdcard/codex-terrain-moire-check.png',
        ]);
        try {
            execFileSync(adb, [
                ...args,
                'pull',
                '/sdcard/codex-terrain-moire-check.png',
                `${folder}/${label}.png`,
            ]);
        } finally {
            execFileSync(adb, [
                ...args,
                'shell',
                'rm',
                '/sdcard/codex-terrain-moire-check.png',
            ]);
        }
    }
    if (mode === '3d') {
        const toggle = page.locator('#nav-2d-toggle');
        if (
            await page.evaluate(() =>
                document.body.classList.contains('mode-2d')
            )
        )
            await toggle.click();
    }
    if (mode === '2d') {
        if (
            !(await page.evaluate(() =>
                document.body.classList.contains('mode-2d')
            ))
        )
            await page.locator('#nav-2d-toggle').click();
    }
    if (mode === 'tester-pro') {
        const desired = process.argv[3] === 'on';
        const current = await page.evaluate(
            () =>
                !!JSON.parse(localStorage.getItem('suntrail_pro') || '{}').isPro
        );
        if (desired !== current) {
            await page
                .locator('[data-tab="settings"]')
                .evaluate((button) => button.click());
            await page.locator('#settings-version').evaluate((button) => {
                for (let index = 0; index < 7; index++) button.click();
            });
            await page
                .locator('#close-panel')
                .evaluate((button) => button.click());
        }
    }
    if (mode === 'zoom-lod') {
        const target = Number(process.argv[3]);
        if (!Number.isInteger(target) || target < 5 || target > 18)
            throw new Error('Target LOD must be between 5 and 18');
        const canvas = await page
            .locator('#canvas-container canvas[data-engine]')
            .boundingBox();
        if (!canvas) throw new Error('Diagnostic canvas unavailable');
        await page.mouse.move(
            canvas.x + canvas.width / 2,
            canvas.y + canvas.height / 2
        );
        let reached = false;
        for (let index = 0; index < 30; index++) {
            const text = await page.locator('#top-pill-lod').textContent();
            const labelZoom = text.match(/\d+/g)?.at(-1);
            const current =
                labelZoom === undefined
                    ? await page.evaluate(() => {
                          const traces =
                              window.suntrailTileDiagnostics.snapshot().traces;
                          return traces
                              .filter((trace) => trace.mode === '3d')
                              .at(-1)?.zoom;
                      })
                    : Number(labelZoom);
            if (current === target) {
                reached = true;
                break;
            }
            if (!Number.isFinite(current))
                throw new Error('Cannot read current LOD');
            await page
                .locator('#canvas-container canvas[data-engine]')
                .evaluate(
                    (canvas, deltaY) => {
                        const rect = canvas.getBoundingClientRect();
                        canvas.dispatchEvent(
                            new WheelEvent('wheel', {
                                deltaY,
                                clientX: rect.x + rect.width / 2,
                                clientY: rect.y + rect.height / 2,
                                bubbles: true,
                                cancelable: true,
                            })
                        );
                    },
                    current < target ? -200 : 200
                );
            await page.waitForTimeout(350);
        }
        if (!reached)
            throw new Error(`Requested LOD ${target} was not reached`);
    }
    if (mode === 'settle') {
        await page.waitForFunction(
            () => {
                const report = window.suntrailTileDiagnostics?.snapshot();
                return (
                    report?.cache.activeKeys > 0 &&
                    report.cache.cachedActiveEntries ===
                        report.cache.activeKeys &&
                    (document.body.classList.contains('mode-2d') ||
                        report.cache.pixelDataBytes > 0)
                );
            },
            null,
            { timeout: 40000 }
        );
        await page.waitForTimeout(2000);
    }
    if (mode === 'lighting') {
        const minutes = Number(process.argv[3] ?? 720);
        const shadows = process.argv[4] !== 'off';
        if ((await page.locator('#shadow-toggle').count()) === 0) {
            await page
                .locator('[data-tab="settings"]')
                .evaluate((button) => button.click());
            await page
                .locator('#shadow-toggle')
                .waitFor({ state: 'attached', timeout: 15000 });
        }
        await page.evaluate(
            ({ minutes, shadows }) => {
                const slider = document.getElementById('time-slider');
                const toggle = document.getElementById('shadow-toggle');
                if (!slider || !toggle)
                    throw new Error('Lighting controls unavailable');
                slider.dispatchEvent(
                    new Event('pointerdown', { bubbles: true })
                );
                slider.value = String(minutes);
                slider.dispatchEvent(new Event('input', { bubbles: true }));
                slider.dispatchEvent(new Event('pointerup', { bubbles: true }));
                toggle.checked = shadows;
                toggle.dispatchEvent(new Event('change', { bubbles: true }));
            },
            { minutes, shadows }
        );
        await page.locator('#close-panel').evaluate((button) => button.click());
    }
    if (mode === 'relief') {
        const factor = Number(process.argv[3]);
        if (!Number.isFinite(factor) || factor < 1 || factor > 3)
            throw new Error('Visual relief factor must be between 1 and 3');
        await page
            .locator('[data-tab="settings"]')
            .evaluate((button) => button.click());
        await page.locator('#exag-slider').evaluate((slider, factor) => {
            slider.value = String(factor);
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        }, factor);
        await page.locator('#close-panel').evaluate((button) => button.click());
        await page.waitForTimeout(2000);
    }
    console.log(
        JSON.stringify(
            await page.evaluate(
                (mode) => ({
                    url: location.href,
                    ready: window.suntrailReady,
                    secondaryReady: window.suntrailSecondaryReady,
                    settingsAttached: !!document.getElementById('settings'),
                    is2D: document.body.classList.contains('mode-2d'),
                    lodLabel: document
                        .getElementById('top-pill-lod')
                        ?.textContent.trim(),
                    lighting: {
                        minutes: document.getElementById('time-slider')?.value,
                        shadows:
                            document.getElementById('shadow-toggle')?.checked,
                    },
                    settings: Object.fromEntries(
                        Object.entries(localStorage).filter(([key]) =>
                            /settings|pro|offline/i.test(key)
                        )
                    ),
                    buttons:
                        mode === 'inspect'
                            ? [...document.querySelectorAll('button')]
                                  .filter(
                                      (button) =>
                                          button.getBoundingClientRect().width >
                                          0
                                  )
                                  .map((button) => ({
                                      id: button.id,
                                      text: button.textContent
                                          .trim()
                                          .slice(0, 70),
                                  }))
                                  .slice(0, 45)
                            : undefined,
                }),
                mode
            ),
            null,
            2
        )
    );
} finally {
    await browser.close(); // disconnect CDP, keep the app and its data intact
}
