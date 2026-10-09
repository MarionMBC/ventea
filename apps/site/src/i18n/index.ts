import { en } from './en';
import { es } from './es';
import type { Dict, Locale } from './types';

export type * from './types';

export const LOCALES: readonly Locale[] = ['en', 'es'];
export const DEFAULT_LOCALE: Locale = 'en';

const DICTS: Readonly<Record<Locale, Dict>> = { es, en };

export function dict(locale: Locale): Dict {
  return DICTS[locale];
}

/** `{name}` → valor. Las llaves sin valor quedan tal cual (un test detecta el olvido). */
export function format(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
