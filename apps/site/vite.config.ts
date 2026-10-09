/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

import { seoPlugin } from './seo-plugin';

/**
 * Sitio corporativo de Ventea (`https://ventea.tech`, TASK-008/009). Estático y prerenderizado:
 * `vite build` (cliente) → `vite build --ssr src/entry-server.tsx` → `scripts/prerender.mjs`
 * escribe el HTML de cada ruta e idioma. No llama a ninguna API (el contacto arma un `mailto:`).
 */
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), seoPlugin()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { port: 5176 },
  preview: { port: 4176 },
  build: isSsrBuild
    ? { outDir: 'dist-ssr', emptyOutDir: true, sourcemap: false, copyPublicDir: false }
    : { outDir: 'dist', sourcemap: 'hidden', assetsInlineLimit: 0 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
