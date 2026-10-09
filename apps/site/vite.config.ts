/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

import { seoPlugin } from './seo-plugin';

/**
 * Sitio corporativo de Ventea (`https://ventea.tech`, TASK-008). Estático: no llama a ninguna
 * API (el formulario de contacto arma un `mailto:`), así que no hay proxy.
 */
export default defineConfig({
  plugins: [react(), seoPlugin()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { port: 5176 },
  preview: { port: 4176 },
  build: { outDir: 'dist', sourcemap: 'hidden' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
