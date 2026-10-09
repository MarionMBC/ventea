import type { Plugin } from 'vite';

import { ROUTES } from './src/routes';
import { withRouteHead } from './src/seo/meta';

/**
 * En desarrollo, `index.html` recibe el `<head>` de `/` (español). En el build no hace nada: el
 * HTML de cada ruta (head + contenido prerenderizado), sitemap, robots, og.png y logo.png los
 * escribe `scripts/prerender.mjs` con el bundle SSR (TASK-009).
 */
export function seoPlugin(): Plugin {
  return {
    name: 'ventea-site-seo',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => withRouteHead(html, ROUTES[0]!),
    },
  };
}
