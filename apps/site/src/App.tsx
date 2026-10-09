import { useEffect } from 'react';

import { HomePage } from './home/HomePage';
import { SiteFooter, SiteHeader } from './home/SiteChrome';
import { NotFoundPage } from './pages/NotFoundPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { canonicalUrl, routeMeta } from './seo/meta';

/**
 * Vistas sin router: `/`, `/privacy` y todo lo demás la 404. nginx sirve el `index.html` de cada
 * ruta (con su `<head>` del build) y `404.html` para lo que no existe.
 */
export function App({ path = window.location.pathname }: { path?: string }) {
  const route = routeMeta(path);

  useEffect(() => {
    document.title = route.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', route.description);
    if (route.priority !== null) {
      document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonicalUrl(route));
    }
  }, [route]);

  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        {route.path === '/' ? (
          <HomePage />
        ) : route.path === '/privacy' ? (
          <PrivacyPage />
        ) : (
          <NotFoundPage />
        )}
      </main>
      <SiteFooter />
    </>
  );
}
