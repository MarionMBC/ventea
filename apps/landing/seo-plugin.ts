import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { Resvg } from '@resvg/resvg-js';
import type { Plugin, ResolvedConfig } from 'vite';

import { OG_IMAGE, ROUTES, robotsTxt, sitemapXml, withRouteHead } from './src/seo/meta';

/**
 * SEO de la landing en el build (TASK-007), sin prerender de React:
 *
 * - `index.html` recibe el `<head>` de `/` (title, description, canonical, Open Graph, JSON-LD)
 *   también en desarrollo.
 * - Al terminar el build escribe `<ruta>/index.html` para `/registro`, `/terminos` y
 *   `/privacidad` con su propio `<head>` (nginx ya resuelve `try_files $uri $uri/`), más
 *   `sitemap.xml`, `robots.txt` y `og.png` (1200×630) rasterizado desde `og/og.svg`. El SVG
 *   no usa `<text>`: la imagen de build no tiene fuentes, el texto está en trazos.
 */
export function seoPlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'ventea-seo',
    configResolved(resolved) {
      config = resolved;
    },
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => withRouteHead(html, ROUTES[0]!),
    },
    closeBundle() {
      if (config.command !== 'build' || config.build.ssr) return;
      const outDir = path.resolve(config.root, config.build.outDir);
      const html = readFileSync(path.join(outDir, 'index.html'), 'utf8');

      for (const route of ROUTES) {
        if (route.path === '/') continue;
        const dir = path.join(outDir, route.path.slice(1));
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, 'index.html'), withRouteHead(html, route));
      }

      const today = new Date().toISOString().slice(0, 10);
      writeFileSync(path.join(outDir, 'sitemap.xml'), sitemapXml(today));
      writeFileSync(path.join(outDir, 'robots.txt'), robotsTxt());

      const svg = readFileSync(path.join(config.root, 'og', 'og.svg'), 'utf8');
      const png = new Resvg(svg, {
        fitTo: { mode: 'width', value: OG_IMAGE.width },
        font: { loadSystemFonts: false },
      })
        .render()
        .asPng();
      writeFileSync(path.join(outDir, OG_IMAGE.path.slice(1)), png);
    },
  };
}
