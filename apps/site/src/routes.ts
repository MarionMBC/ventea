import type { Locale } from './i18n';

/**
 * Rutas del sitio (TASK-014: inglés por defecto). Inglés en la raíz (`/`, `/privacy`), español
 * bajo `/es/`. La privacidad en español NO puede ser `/privacidad` (esa ruta del apex redirige a
 * app.ventea.tech, TASK-008): es `/es/politica-de-privacidad`. Las rutas de TASK-009 (`/en/*`,
 * `/politica-de-privacidad`) redirigen con 301 en nginx.
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
  home: { en: '/', es: '/es/' },
  privacy: { en: '/privacy', es: '/es/politica-de-privacidad' },
};

/** Archivo de la 404 por idioma (nginx: `error_page 404`). */
export const NOT_FOUND_PATHS: Readonly<Record<Locale, string>> = {
  en: '/404',
  es: '/es/404',
};

/** El primero es la home por defecto (inglés): el plugin de desarrollo usa su `<head>`. */
export const ROUTES: readonly Route[] = [
  { page: 'home', locale: 'en', path: PATHS.home.en },
  { page: 'home', locale: 'es', path: PATHS.home.es },
  { page: 'privacy', locale: 'en', path: PATHS.privacy.en },
  { page: 'privacy', locale: 'es', path: PATHS.privacy.es },
  { page: 'notFound', locale: 'en', path: NOT_FOUND_PATHS.en },
  { page: 'notFound', locale: 'es', path: NOT_FOUND_PATHS.es },
];

/** Normaliza `pathname`: sin `index.html`, sin barras finales (salvo `/es/`). */
function normalize(pathname: string): string {
  const clean =
    pathname
      .replace(/\/index\.html$/, '')
      .replace(/\.html$/, '')
      .replace(/\/+$/, '') || '/';
  return clean === '/es' ? '/es/' : clean;
}

export function localeOfPath(pathname: string): Locale {
  return /^\/es(\/|$)/.test(pathname) ? 'es' : 'en';
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
