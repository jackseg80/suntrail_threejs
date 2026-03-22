import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './', 
  build: {
    outDir: 'dist',
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,bin}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB limit pour le WebAssembly ou gros assets
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.maptiler\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'maptiler-cache',
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
              cacheName: 'swisstopo-cache',
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
        icons: [
          {
            src: '/assets/icons/icon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/assets/icons/icon_1024.png',
            sizes: '512x512',
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
    // On désactive les threads pour éviter les corruptions de mémoire en CI
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  }
});
