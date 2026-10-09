import { lazy, Suspense } from 'react';

import { I18nProvider } from './i18n';
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
 * Vistas sin router: la landing (`/` en inglés, `/es/` en español), el registro (`/signup`,
 * `/registro`) y las legales (`/terminos`, `/privacidad`, solo en español); todo lo demás es la
 * landing. El idioma sale de la ruta (TASK-012). Los links entre vistas son navegaciones normales
 * (nginx sirve el `index.html` de cada ruta, con su `<head>` del build), así el bundle no carga
 * una librería de rutas para seis páginas.
 */
export function App({ path = window.location.pathname }: { path?: string }) {
  const route = routeMeta(path);
  useRouteMeta(route.path);

  let view;
  switch (route.page) {
    case 'signup':
      view = <SignupPage />;
      break;
    case 'terms':
    case 'privacy':
      view = (
        <Suspense fallback={<p className="legal__loading">Cargando…</p>}>
          {route.page === 'terms' ? <TermsPage /> : <PrivacyPage />}
        </Suspense>
      );
      break;
    default:
      view = <LandingPage />;
  }
  return (
    <I18nProvider locale={route.lang} path={route.path} alternate={route.alternate}>
      {view}
    </I18nProvider>
  );
}
