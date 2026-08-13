import { expect, test } from '@playwright/test';
import { dismissFirstLaunch, openFreshApp } from './app';

test.describe('Beginner route planning', () => {
    test('simple taps are contextual and the long-press expert shortcut remains available @smoke', async ({
        page,
    }) => {
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
                            distance: 1200,
                            duration: 900,
                            geometry: { coordinates },
                        },
                    ],
                }),
            });
        });

        await openFreshApp(page);
        await dismissFirstLaunch(page);
        const canvas = page.locator('#canvas-container canvas').first();
        await expect(canvas).toBeVisible();
        const box = await canvas.boundingBox();
        expect(box).not.toBeNull();
        const x = box!.x + box!.width * 0.35;
        const firstY = box!.y + box!.height * 0.4;
        const secondY = box!.y + box!.height * 0.53;
        const holdOnMap = async (y: number) => {
            await page.locator('#canvas-container').evaluate(
                async (element, point) => {
                    element.dispatchEvent(
                        new PointerEvent('pointerdown', {
                            bubbles: true,
                            button: 0,
                            pointerId: 1,
                            isPrimary: true,
                            clientX: point.x,
                            clientY: point.y,
                        })
                    );
                    await new Promise((resolve) => setTimeout(resolve, 550));
                    element.dispatchEvent(
                        new PointerEvent('pointerup', {
                            bubbles: true,
                            button: 0,
                            pointerId: 1,
                            isPrimary: true,
                            clientX: point.x,
                            clientY: point.y,
                        })
                    );
                },
                { x, y }
            );
        };

        // Outside Plan mode, a regular tap remains a selection and adds no waypoint.
        await page.mouse.click(x, firstY);
        await expect(page.locator('body')).not.toHaveClass(
            /route-planner-active/
        );
        await expect(page.locator('#rb-dots .rb-dot')).toHaveCount(0);

        const prepare = page.locator('.nav-tab[data-tab="prepare"]');
        await prepare.click();
        await expect(prepare).toHaveAttribute('aria-selected', 'true');
        await expect(prepare).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('body')).toHaveClass(/route-planning-mode/);
        await expect(page.locator('#rb-info')).toContainText(
            /départ|start|Startpunkt|partenza/i
        );

        // In Prepare mode, a regular terrain tap remains available for moving the map.
        await page.mouse.click(x, firstY);
        await expect(page.locator('#rb-dots .rb-dot')).toHaveCount(0);

        // A deliberate 500 ms hold is required to add each waypoint.
        await holdOnMap(firstY);
        await expect(page.locator('#rb-dots .rb-dot')).toHaveCount(1);
        await holdOnMap(secondY);
        await expect(page.locator('#rb-dots .rb-dot')).toHaveCount(2);

        await page.locator('#rb-reverse-btn').click();
        await expect(page.locator('#rb-dots .rb-dot')).toHaveCount(2);
        await page.locator('#rb-clear-btn').click();
        await expect(page.locator('#rb-dots .rb-dot')).toHaveCount(0);
        await expect(page.locator('body')).toHaveClass(/route-planner-active/);
        await expect(page.locator('#rph-context')).toContainText(
            /départ|start|Startpunkt|partenza/i
        );
        await expect(page.locator('#rph-stats')).toBeHidden();

        // A second click now frees the map without leaving Plan mode.
        await prepare.click();
        await expect(prepare).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('body')).toHaveClass(/route-planning-mode/);
        await expect(page.locator('body')).toHaveClass(
            /route-planner-chrome-hidden/
        );

        // Leaving through another destination still restores the original outside-Plan behavior.
        const explore = page.locator('.nav-tab[data-tab="search"]');
        await explore.click();
        await expect(page.locator('body')).not.toHaveClass(
            /route-planning-mode/
        );
        await explore.click();

        // The expert long-press shortcut still adds a point outside Plan mode.
        await holdOnMap(firstY);
        await expect(page.locator('#rb-dots .rb-dot')).toHaveCount(1);
        await expect(page.locator('body')).not.toHaveClass(
            /route-planning-mode/
        );
    });
});
