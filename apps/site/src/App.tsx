import { useEffect } from 'react';

import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { HomePage } from './home/HomePage';
import { dict } from './i18n';
import { NotFoundPage } from './pages/NotFoundPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { resolveRoute } from './routes';
import { pageMeta } from './seo/meta';

/**
 * Vistas sin router: home y privacidad por idioma, y la 404 de cada idioma. El build prerenderiza
 * cada ruta en su `index.html` (con su `<head>`); el cliente hidrata ese HTML.
 */
export function App({ path }: { path: string }) {
  const route = resolveRoute(path);
  const t = dict(route.locale);

  useEffect(() => {
    document.documentElement.lang = route.locale;
    document.title = pageMeta(route).title;
  }, [route]);

  return (
    <>
      <Header route={route} />
      <main id="main" tabIndex={-1}>
        {route.page === 'home' ? (
          <HomePage t={t} />
        ) : route.page === 'privacy' ? (
          <PrivacyPage t={t} />
        ) : (
          <NotFoundPage t={t} />
        )}
      </main>
      <Footer route={route} />
    </>
  );
}
