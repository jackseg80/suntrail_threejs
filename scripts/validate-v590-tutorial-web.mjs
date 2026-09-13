import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(repositoryRoot, 'outputs/v590-web-matrix-20260913');
const widths = [320, 360, 390, 412, 899, 900, 1280];
const screenshotWidths = new Set([320, 899, 900, 1280]);

await mkdir(outputDir, { recursive: true });

const browser = process.env.SUNTRAIL_CDP_URL
    ? await chromium.connectOverCDP(process.env.SUNTRAIL_CDP_URL)
    : await chromium.launch({ headless: true });
const results = [];

function assertLayout(result) {
    const controlsVisible = result.next?.visible && result.skip?.visible;
    const cardFits =
        result.card &&
        result.card.x >= 0 &&
        result.card.right <= result.viewport.width &&
        result.card.y >= 0 &&
        result.card.bottom <= result.viewport.height;
    const noHorizontalOverflow = result.scroll.width <= result.viewport.width;

    if (!controlsVisible || !cardFits || !noHorizontalOverflow) {
        throw new Error(`Disposition invalide: ${JSON.stringify(result)}`);
    }
}

async function measure(page, width, step, zoom) {
    return page.evaluate(
        ({ width: testedWidth, step: testedStep, zoom: testedZoom }) => {
            const rect = (selector) => {
                const element = document.querySelector(selector);
                if (!element) return null;
                const bounds = element.getBoundingClientRect();
                return {
                    x: Math.round(bounds.x),
                    y: Math.round(bounds.y),
                    width: Math.round(bounds.width),
                    height: Math.round(bounds.height),
                    right: Math.round(bounds.right),
                    bottom: Math.round(bounds.bottom),
                    visible: Boolean(
                        bounds.width &&
                        bounds.height &&
                        bounds.bottom > 0 &&
                        bounds.right > 0 &&
                        bounds.x < innerWidth &&
                        bounds.y < innerHeight
                    ),
                };
            };

            return {
                width: testedWidth,
                step: testedStep,
                zoom: testedZoom,
                viewport: { width: innerWidth, height: innerHeight },
                scroll: {
                    width: document.documentElement.scrollWidth,
                    height: document.documentElement.scrollHeight,
                },
                card: rect('.ob-live-card'),
                next: rect('#ob-next'),
                skip: rect('#ob-skip'),
                mode: rect('#nav-2d-toggle'),
                lod: rect('#top-pill-lod'),
            };
        },
        { width, step, zoom }
    );
}

async function openTutorial(context) {
    const page = await context.newPage();
    await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
    });
    await page.goto(
        'http://127.0.0.1:5174/suntrail_threejs/app.html?mode=test',
        {
            waitUntil: 'domcontentloaded',
            timeout: 60_000,
        }
    );
    await page.waitForFunction(() => window.suntrailReady === true);
    await page.locator('#aw-accept-btn').click();
    await page.locator('#onboarding-overlay').waitFor({ state: 'visible' });
    return page;
}

try {
    for (const width of widths) {
        const context = await browser.newContext({
            viewport: { width, height: 800 },
            serviceWorkers: 'block',
        });
        const page = await openTutorial(context);

        const first = await measure(page, width, 1, 100);
        assertLayout(first);
        results.push(first);
        if (screenshotWidths.has(width)) {
            await page.screenshot({ path: `${outputDir}/${width}-step1.png` });
        }

        await page.locator('#ob-next').click();
        const second = await measure(page, width, 2, 100);
        assertLayout(second);
        results.push(second);
        if (screenshotWidths.has(width)) {
            await page.screenshot({ path: `${outputDir}/${width}-step2.png` });
        }

        await context.close();
    }

    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        serviceWorkers: 'block',
    });
    const page = await openTutorial(context);
    await page.evaluate(() => {
        document.documentElement.style.zoom = '2';
    });

    const first = await measure(page, 1280, 1, 200);
    assertLayout(first);
    results.push(first);
    await page.screenshot({ path: `${outputDir}/1280-zoom200-step1.png` });

    await page.locator('#ob-next').click();
    const second = await measure(page, 1280, 2, 200);
    assertLayout(second);
    results.push(second);
    await page.screenshot({ path: `${outputDir}/1280-zoom200-step2.png` });
    await context.close();

    const report = `${JSON.stringify(results, null, 2)}\n`;
    await writeFile(resolve(outputDir, 'measurements.json'), report, 'utf8');
    console.log(report);
} finally {
    await browser.close();
}
