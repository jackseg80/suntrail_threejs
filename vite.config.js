import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Vital pour GitHub Pages (chemins relatifs)
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  }
});
