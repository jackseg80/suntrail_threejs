import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Vital pour GitHub Pages (chemins relatifs)
  build: {
    outDir: 'dist',
  }
});
