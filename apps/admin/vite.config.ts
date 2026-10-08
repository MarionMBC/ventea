/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * En producción el panel vive en `<slug>.ventea.tech/admin` y llama a `/api` del mismo
 * origen (nginx sirve los estáticos, Traefik manda `/api` a la API). En desarrollo el
 * proxy de Vite hace de Traefik: `API_PROXY_TARGET` apunta a una API local o a la de
 * prueba (`https://api.ventea.tech`). Ahí el subdominio no existe, así que el tenant
 * va en `VITE_TENANT_SLUG` → header `X-Tenant-Slug`.
 */
const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: true,
        // La API de producción solo acepta orígenes *.ventea.tech; el navegador ve un
        // pedido al mismo origen (localhost), así que el header Origin no hace falta.
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
        },
      },
    },
  },
  // 'hidden': se generan los .map (para depurar errores reportados) pero el bundle no
  // los referencia y nginx responde 404 a /admin/*.map: el fuente no queda público.
  build: { outDir: 'dist', sourcemap: 'hidden' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
