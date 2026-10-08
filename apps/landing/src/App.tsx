import { lazy, Suspense } from 'react';

import { useRouteMeta } from './lib/useRouteMeta';
import { LandingPage } from './landing/LandingPage';
import { routeMeta } from './seo/meta';
import { SignupPage } from './signup/SignupPage';

// Las legales se leen poco: van en su propio chunk y no pesan en `/`.
const TermsPage = lazy(() => import('./legal/TermsPage').then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() =>
  import('./legal/PrivacyPage').then((m) => ({ default: m.PrivacyPage })),
);

/**
 * Vistas sin router: `/registro`, `/terminos`, `/privacidad` y todo lo demás la landing. Los
 * links entre ellas son navegaciones normales (nginx sirve el `index.html` de cada ruta, con su
 * `<head>` del build), así el bundle no carga una librería de rutas para cuatro páginas.
 */
export function App({ path = window.location.pathname }: { path?: string }) {
  const route = routeMeta(path);
  useRouteMeta(route.path);

  switch (route.path) {
    case '/registro':
      return <SignupPage />;
    case '/terminos':
    case '/privacidad':
      return (
        <Suspense fallback={<p className="legal__loading">Cargando…</p>}>
          {route.path === '/terminos' ? <TermsPage /> : <PrivacyPage />}
        </Suspense>
      );
    default:
      return <LandingPage />;
  }
}
