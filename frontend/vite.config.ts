/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  build: {
    // MapLibre alone is ~1.2 MB (≈340 kB gzipped) and is lazy-loaded.
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        // Large and rarely changing, so it caches well as its own chunk.
        manualChunks: { maplibre: ['maplibre-gl', 'react-map-gl/maplibre'] },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/mocks/browser.ts', 'src/test/**', 'src/**/*.test.{ts,tsx}'],
    },
  },
});
