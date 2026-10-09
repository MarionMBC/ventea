import type { BillingInterval } from '@ventea/shared';

/**
 * Idiomas de la landing (TASK-012): inglés es el principal (`/`), español el soportado
 * (`/es/`). El idioma lo decide la ruta, nunca el navegador ni `localStorage`: así el HTML
 * prerenderizado y el primer render del cliente son el mismo y la hidratación no se rompe.
 *
 * Este archivo no importa React ni `import.meta.env`: lo usa también el plugin de SEO (Node).
 */
export type Locale = 'en' | 'es';

export const LOCALES: readonly Locale[] = ['en', 'es'];
export const DEFAULT_LOCALE: Locale = 'en';

/** Locale de `Intl` para números y fechas. */
export const INTL_LOCALE: Record<Locale, string> = { en: 'en-US', es: 'es-HN' };

/** `og:locale` de Open Graph. */
export const OG_LOCALE: Record<Locale, string> = { en: 'en_US', es: 'es_HN' };

/** Inicio y registro de cada idioma. `/registro` es la versión en español (enlaces viejos). */
export const PATHS = {
  en: { home: '/', signup: '/signup' },
  es: { home: '/es/', signup: '/registro' },
} as const satisfies Record<Locale, { home: string; signup: string }>;

/** Inicio del idioma, con un ancla opcional (`#precios`). */
export function homeHref(locale: Locale, hash = ''): string {
  return `${PATHS[locale].home}${hash}`;
}

/**
 * Link al registro con el plan y el intervalo elegidos. En español conserva el contrato de
 * siempre (`/registro?plan=pro&intervalo=anual`); en inglés `?plan=pro&interval=annual`. El
 * registro acepta los dos (ver `readInitialChoice`).
 */
export function signupHref(locale: Locale, plan?: string, interval?: BillingInterval): string {
  const base = PATHS[locale].signup;
  if (!plan) return base;
  const yearly = interval === 'year';
  const query =
    locale === 'es'
      ? `intervalo=${yearly ? 'anual' : 'mensual'}`
      : `interval=${yearly ? 'annual' : 'monthly'}`;
  return `${base}?plan=${encodeURIComponent(plan)}&${query}`;
}
