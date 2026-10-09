import { createContext, useContext, type ReactNode } from 'react';

import { en, type Messages } from './en';
import { es } from './es';
import { DEFAULT_LOCALE, INTL_LOCALE, type Locale } from './locale';

export { en, es, type Messages };
export * from './locale';

/** Diccionario por idioma. */
export const MESSAGES: Record<Locale, Messages> = { en, es };

interface I18nValue {
  locale: Locale;
  /** Ruta de la vista actual (`/`, `/es/`, `/signup`…). */
  path: string;
  /** La misma vista en el otro idioma, si existe (las legales solo están en español). */
  alternate?: string;
}

const I18nContext = createContext<I18nValue>({ locale: DEFAULT_LOCALE, path: '/' });

/**
 * Idioma de la vista. Lo fija `App` según la ruta (TASK-012). Sin proveedor (tests de un
 * componente suelto) vale el idioma principal, inglés.
 */
export function I18nProvider({
  locale,
  path = locale === 'en' ? '/' : '/es/',
  alternate,
  children,
}: {
  locale: Locale;
  path?: string;
  alternate?: string;
  children: ReactNode;
}) {
  return (
    <I18nContext.Provider value={{ locale, path, alternate }}>{children}</I18nContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}

/** Ruta actual y su equivalente en el otro idioma. */
export function useRouteInfo(): { path: string; alternate?: string } {
  const { path, alternate } = useContext(I18nContext);
  return { path, alternate };
}

/** Textos del idioma actual. */
export function useT(): Messages {
  return MESSAGES[useContext(I18nContext).locale];
}

/** Locale de `Intl` del idioma actual (`en-US` / `es-HN`). */
export function useIntlLocale(): string {
  return INTL_LOCALE[useContext(I18nContext).locale];
}
