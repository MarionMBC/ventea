import { fromCents, type Cents, type FulfillmentType, type StaffOrder } from '@ventea/shared';

/**
 * Formatos del panel. Locale `es-HN` (el staff es hondureño/latino): miles con coma,
 * decimales con punto y símbolo corto (`$`, `L`). La moneda la decide el tenant.
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
export function formatAmount(cents: Cents, currency: string | undefined): string {
  return currency ? formatMoney(cents, currency) : fromCents(cents).toFixed(2);
}

/** Hora del pedido, p. ej. «2:05 p. m.». */
export function formatClock(date: Date, locale = PANEL_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
}

/** Minutos enteros desde `from` hasta `now`. Nunca negativo (relojes desfasados). */
export function minutesSince(from: Date, now: number): number {
  return Math.max(0, Math.floor((now - from.getTime()) / 60_000));
}

/** «ahora», «hace 7 min», «hace 1 h 5 min». */
export function formatElapsed(from: Date, now: number): string {
  const minutes = minutesSince(from, now);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `hace ${hours} h` : `hace ${hours} h ${rest} min`;
}

export function customerName(customer: StaffOrder['customer']): string {
  if (!customer) return 'Cliente sin cuenta';
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
  return name || 'Cliente sin nombre';
}

const FULFILLMENT_LABEL: Record<FulfillmentType, string> = {
  pickup: 'Para llevar',
  dine_in: 'Comer aquí',
  delivery: 'Delivery',
};

export function fulfillmentLabel(type: FulfillmentType): string {
  return FULFILLMENT_LABEL[type];
}
