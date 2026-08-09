import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as {
    version: string;
};
const rootDir = dirname(fileURLToPath(import.meta.url));

const isProd = process.env.NODE_ENV === 'production';
const isCapacitor = process.env.CAPACITOR === 'true';

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    // Sur GitHub Pages on a besoin de /suntrail_threejs/, mais sur Capacitor on a besoin de ./ (relatif)
    base: isCapacitor ? './' : isProd ? '/suntrail_threejs/' : '/',
    server: {
        host: '127.0.0.1',
        port: 5173,
        strictPort: true,
        headers: {
            'Referrer-Policy': 'same-origin',
        },
    },
    build: {
        outDir: 'dist',
        // 820 kB ≈ 800 KiB ; les limites strictes sont vérifiées par check:bundle.
        chunkSizeWarningLimit: 820,
        minify: 'esbuild',
        esbuild: {
            drop: ['console', 'debugger'],
        },
        rollupOptions: {
            input: {
                main: resolve(rootDir, 'index.html'),
                app: resolve(rootDir, 'app.html'),
                login: resolve(rootDir, 'login.html'),
                guestModal: resolve(rootDir, 'guest-purchase-modal.html'),
                notFound: resolve(rootDir, '404.html'),
            },
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules/three')) return 'three';
                    // Capacitor is needed by the app at startup. Keep it out of
                    // the much larger RevenueCat chunk so the purchase SDK can
                    // remain lazy-loaded until IAP initialization.
                    if (id.includes('node_modules/@capacitor'))
                        return 'capacitor';
                    if (id.includes('node_modules/pmtiles')) return 'pmtiles';
                    if (
                        id.includes('node_modules/suncalc') ||
                        id.includes('node_modules/gpxparser') ||
                        id.includes('node_modules/@mapbox') ||
                        id.includes('node_modules/pbf') ||
                        id.includes('node_modules/@supabase')
                    )
                        return 'vendor';
                },
            },
        },
    },
    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,bin}'],
                // SunTrail is multi-page: a navigation to app.html/login.html
                // must never be rewritten to the landing page index.html.
                navigateFallback: null,
                // Exclure le chunk Three.js du précache (trop lourd, en runtime cache à la demande)
                globIgnores: [
                    '**/three-*.js',
                    '**/Purchases*.js',
                    '**/*.pmtiles',
                    '**/icon_*.png',
                ],
                maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MB max par fichier
                // Invalidation automatique du cache précache au déploiement
                cleanupOutdatedCaches: true,
                // Prise de contrôle immédiate des clients après mise à jour
                skipWaiting: true,
                clientsClaim: true,
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/api\.maptiler\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'maptiler-cache-v5.11',
                            expiration: {
                                maxEntries: 1000,
                                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 jours
                            },
                            cacheableResponse: {
                                statuses: [0, 200],
                            },
                        },
                    },
                    {
                        urlPattern: /^https:\/\/wmts\.geo\.admin\.ch\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'swisstopo-cache-v5.11',
                            expiration: {
                                maxEntries: 1000,
                                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 jours
                            },
                            cacheableResponse: {
                                statuses: [0, 200],
                            },
                        },
                    },
                    {
                        urlPattern: /^https:\/\/cache\.kartverket\.no\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'kartverket-cache-v5.20',
                            expiration: {
                                maxEntries: 1000,
                                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 jours
                            },
                            cacheableResponse: {
                                statuses: [0, 200],
                            },
                        },
                    },
                ],
            },
            manifest: {
                name: 'SunTrail 3D',
                short_name: 'SunTrail',
                description: 'Visualisation topographique 3D',
                theme_color: '#12141c',
                background_color: '#12141c',
                display: 'standalone',
                orientation: 'portrait',
                icons: [
                    {
                        src: 'assets/icons/icon_512.png',
                        sizes: '512x512',
                        type: 'image/png',
                    },
                ],
            },
        }),
    ],
    test: {
        environment: 'happy-dom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
        include: ['src/**/*.test.ts'],
        // On désactive les threads pour éviter les corruptions de mémoire en CI
        pool: 'forks',
        clearMocks: true,
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: [
                'src/types/**',
                'src/test/setup.ts',
                'src/vite-env.d.ts',
                'src/**/*.d.ts',
                'src/**/*.test.ts',
                'src/modules/vite-env.d.ts',
                // The browser-worker shell delegates testable policy to tileWorkerCore.
                'src/workers/tileWorker.ts',
            ],
            thresholds: {
                lines: 60,
            },
            reporter: ['text', 'text-summary', 'html'],
            reportsDirectory: './coverage',
        },
    },
});
