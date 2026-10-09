import type { Locale } from './i18n';

/**
 * Rutas del sitio (TASK-009). Español en la raíz, inglés bajo `/en/`. La privacidad en español
 * NO puede ser `/privacidad`: esa ruta del apex redirige a app.ventea.tech (nginx, TASK-008).
 * `/privacy` (la ruta vieja, en inglés) → 301 a `/en/privacy` en nginx.
 */
export type PageId = 'home' | 'privacy' | 'notFound';

export interface Route {
  page: PageId;
  locale: Locale;
  path: string;
}

export const PATHS: Readonly<
  Record<Exclude<PageId, 'notFound'>, Readonly<Record<Locale, string>>>
> = {
  home: { es: '/', en: '/en/' },
  privacy: { es: '/politica-de-privacidad', en: '/en/privacy' },
};

/** Archivo de la 404 por idioma (nginx: `error_page 404`). */
export const NOT_FOUND_PATHS: Readonly<Record<Locale, string>> = {
  es: '/404',
  en: '/en/404',
};

export const ROUTES: readonly Route[] = [
  { page: 'home', locale: 'es', path: PATHS.home.es },
  { page: 'home', locale: 'en', path: PATHS.home.en },
  { page: 'privacy', locale: 'es', path: PATHS.privacy.es },
  { page: 'privacy', locale: 'en', path: PATHS.privacy.en },
  { page: 'notFound', locale: 'es', path: NOT_FOUND_PATHS.es },
  { page: 'notFound', locale: 'en', path: NOT_FOUND_PATHS.en },
];

/** Normaliza `pathname`: sin `index.html`, sin barras finales (salvo `/en/`). */
function normalize(pathname: string): string {
  const clean =
    pathname
      .replace(/\/index\.html$/, '')
      .replace(/\.html$/, '')
      .replace(/\/+$/, '') || '/';
  return clean === '/en' ? '/en/' : clean;
}

export function localeOfPath(pathname: string): Locale {
  return /^\/en(\/|$)/.test(pathname) ? 'en' : 'es';
}

/** Ruta de un `pathname`; cualquier otro camino es la 404 de su idioma. */
export function resolveRoute(pathname: string): Route {
  const path = normalize(pathname);
  const found = ROUTES.find((route) => route.page !== 'notFound' && route.path === path);
  if (found) return found;
  const locale = localeOfPath(path);
  return ROUTES.find((route) => route.page === 'notFound' && route.locale === locale)!;
}

/** Misma página en el otro idioma (la 404 lleva a la home del otro idioma). */
export function alternatePath(route: Route, locale: Locale): string {
  return route.page === 'notFound' ? PATHS.home[locale] : PATHS[route.page][locale];
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'es' ? 'en' : 'es';
}
