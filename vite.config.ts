import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  base: './',
  build: {
    outDir: 'dist',
    // Three.js fait ~520kB minifié (dans son propre chunk — correct)
    // On relève le seuil pour éviter le warning sur un chunk qu'on ne peut pas réduire
    chunkSizeWarningLimit: 600,
    // Strip tous les console.log/debug en production (W7 — sécurité + perf)
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        // Découpe le bundle pour un LCP optimal :
        //  - three     : ~350 kB, rarement mis à jour → cache long
        //  - vendor    : deps tierces stables
        //  - pmtiles   : optionnel (mode hors-ligne seulement)
        //  - app       : code métier, change à chaque déploiement
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/pmtiles')) return 'pmtiles';
          if (
            id.includes('node_modules/suncalc') ||
            id.includes('node_modules/gpxparser') ||
            id.includes('node_modules/@mapbox') ||
            id.includes('node_modules/pbf')
          ) return 'vendor';
        },
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,bin}'],
        // Exclure le chunk Three.js du précache (trop lourd, en runtime cache à la demande)
        globIgnores: ['**/three-*.js', '**/*.pmtiles', '**/icon_*.png'],
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
              }
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
              }
            },
          }
        ]
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
            type: 'image/png'
          },
          {
            src: 'assets/icons/icon_1024.png',
            sizes: '1024x1024',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    // On désactive les threads pour éviter les corruptions de mémoire en CI
    pool: 'forks',
    clearMocks: true
  }
});
