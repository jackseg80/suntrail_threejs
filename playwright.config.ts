import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for SunTrail 3D
 * Focused on hybrid E2E testing (UI + Canvas)
 */
export default defineConfig({
    testDir: './e2e',
    testMatch: '**/*.{spec,test}.ts',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : 2,
    reporter: 'html',
    use: {
        baseURL: 'http://127.0.0.1:5173',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        // Le Service Worker PWA intercepte les requêtes réseau (ex. geocoding
        // MapTiler) via un runtimeCaching CacheFirst, ce qui court-circuite
        // les mocks `page.route` des tests E2E. Le désactiver rend les mocks
        // déterministes (et évite la persistance d'un SW fantôme entre runs).
        serviceWorkers: 'block',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
        {
            name: 'Mobile Safari',
            use: { ...devices['iPhone 12'] },
        },
    ],

    webServer: {
        // Vite 8's on-demand transformation of this multi-page graph can stall
        // before DOMContentLoaded. Test the release-shaped PWA build instead.
        command:
            'cross-env CAPACITOR=true npm run build && npx vite preview --base / --host 127.0.0.1 --port 5173',
        url: 'http://127.0.0.1:5173/app.html',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
    },
});
