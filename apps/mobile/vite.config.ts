/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { parseBrandConfig } from './src/brand/brandConfig.ts';

/**
 * The brand of this build: `brand.config.json` (written by the brand
 * generator), or `VENTEA_BRAND_FILE=brands/brand.carolina.json` to build or
 * preview another example. An invalid file fails the build, loudly.
 */
const brandFile = path.resolve(
  import.meta.dirname,
  process.env.VENTEA_BRAND_FILE ?? 'brand.config.json',
);
const brand = parseBrandConfig(JSON.parse(readFileSync(brandFile, 'utf8')));
const appVersion = (
  JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8')) as {
    version: string;
  }
).version;

/**
 * Web preview against any API without CORS: the browser calls `/api` on the
 * dev server and Vite forwards it. `API_PROXY_TARGET` defaults to a local API;
 * `API_PROXY_TARGET=https://api.ventea.tech` previews production data.
 */
const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * Content Security Policy for the built page. On the web, nginx sends the
 * same policy as a header (connect-src 'self': the API is same-origin); inside
 * the native WebView there is no server, so the page carries it: scripts only
 * from the bundle, API calls only to the brand's API.
 */
const apiOrigins = [brand.apiUrl, process.env.VITE_API_URL]
  // Solo URLs absolutas aportan un origen; una relativa (`/api`) ya es 'self'.
  .filter((url): url is string => Boolean(url) && /^https?:\/\//i.test(url))
  .map((url) => new URL(url).origin);
const buildCsp = (origins: string[]): string =>
  [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${[...new Set(origins)].join(' ')}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

/**
 * `%BRAND_NAME%` → the brand's app name (title before JS runs); the CSP meta
 * only in builds (`vite dev` needs inline scripts and a websocket for HMR).
 */
const brandHtml = (): Plugin => ({
  name: 'ventea-brand-html',
  transformIndexHtml: (html, context) =>
    html
      .replaceAll('%BRAND_NAME%', escapeHtml(brand.appName))
      .replace(
        '<!--%BRAND_CSP%-->',
        context.server
          ? ''
          : `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(buildCsp(apiOrigins))}" />`,
      ),
});

export default defineConfig({
  plugins: [react(), brandHtml()],
  define: {
    __BRAND__: JSON.stringify(brand),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: true,
        // The production API only accepts *.ventea.tech and app origins; the
        // browser sees a same-origin call, so the Origin header is dropped.
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
        },
      },
    },
  },
  build: { outDir: 'dist', sourcemap: 'hidden' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
