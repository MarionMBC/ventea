import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';

import { App } from './App';

export { ROUTES } from './routes';
export { headHtml, robotsTxt, sitemapXml, withRouteHead, LOGO_IMAGE, OG_IMAGE } from './seo/meta';

/** HTML de una ruta para el prerender del build (`scripts/prerender.mjs`). */
export function render(path: string): string {
  return renderToString(
    <StrictMode>
      <App path={path} />
    </StrictMode>,
  );
}
