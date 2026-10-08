/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Landing pública de Ventea (`https://ventea.tech`) con el registro self-service.
 *
 * En producción llama a `/api` del mismo origen: Traefik manda `ventea.tech/api/*` a la
 * API (ver deploy/test-vps/sync-routes.sh). En desarrollo y en `vite preview` el proxy
 * hace de Traefik: `API_PROXY_TARGET` apunta a una API local o a la de prueba.
 */
const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

const proxy = {
  '/api': {
    target: apiProxyTarget,
    changeOrigin: true,
    secure: true,
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { port: 5175, proxy },
  preview: { port: 4175, proxy },
  build: { outDir: 'dist', sourcemap: 'hidden' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
