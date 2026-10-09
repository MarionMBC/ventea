import { fromCents, type Cents } from '@ventea/shared';

/**
 * Formatos del panel, sin texto: los textos traducibles viven en `src/i18n`. El locale lo
 * pone el idioma elegido (`en-US` / `es-HN`); por defecto `es-HN`: miles con coma, decimales
 * con punto y símbolo corto (`$`, `L`). La moneda la decide el tenant.
 */
export const PANEL_LOCALE = 'es-HN';

const moneyFormatters = new Map<string, Intl.NumberFormat>();

/**
 * La moneda es un dato del tenant (el schema solo exige 3 caracteres): un código que
 * Intl no acepta tira RangeError. En ese caso se muestra `CODE 12.34` en vez de
 * romper la pantalla.
 */
export function formatMoney(cents: Cents, currency: string, locale = PANEL_LOCALE): string {
  const key = `${locale}|${currency}`;
  try {
    let formatter = moneyFormatters.get(key);
    if (!formatter) {
      formatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
      });
      moneyFormatters.set(key, formatter);
    }
    return formatter.format(fromCents(cents));
  } catch {
    return `${currency} ${fromCents(cents).toFixed(2)}`;
  }
}

/** Como `formatMoney`, pero sin moneda (marca todavía cargando) muestra solo el número. */
export function formatAmount(
  cents: Cents,
  currency: string | undefined,
  locale = PANEL_LOCALE,
): string {
  return currency ? formatMoney(cents, currency, locale) : fromCents(cents).toFixed(2);
}

/** Hora del pedido, p. ej. «2:05 p. m.». */
export function formatClock(date: Date, locale = PANEL_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
}

/** Minutos enteros desde `from` hasta `now`. Nunca negativo (relojes desfasados). */
export function minutesSince(from: Date, now: number): number {
  return Math.max(0, Math.floor((now - from.getTime()) / 60_000));
}
