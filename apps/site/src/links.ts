import type { Anchors, Locale } from './i18n';
import { dict } from './i18n';
import { PATHS } from './routes';

/** Link a una sección de la home de un idioma: `/#servicios`, `/en/#services`. */
export function sectionHref(locale: Locale, key: keyof Anchors): string {
  return `${PATHS.home[locale]}#${dict(locale).anchors[key]}`;
}

/** Traduce el ancla de una sección al otro idioma (`servicios` → `services`); `null` si no es una. */
export function translateAnchor(anchor: string, from: Locale, to: Locale): string | null {
  const source = dict(from).anchors;
  const key = (Object.keys(source) as (keyof Anchors)[]).find((k) => source[k] === anchor);
  return key ? dict(to).anchors[key] : null;
}
