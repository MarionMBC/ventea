/**
 * Precios del editor de menú: el dueño escribe en la moneda de su marca («12.50», «1,250»,
 * «12,5») y la API guarda centavos enteros. La plataforma maneja siempre 2 decimales.
 */

/** Centavos → texto para el campo (sin símbolo ni separador de miles): `1250` → `12.50`. */
export function centsToInput(cents: number | null): string {
  if (cents === null) return '';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Texto del campo → centavos, o `null` si no es un monto. Acepta punto o coma decimal y comas o
 * puntos de miles: con los dos, el último es el decimal; un punto solo es decimal; una coma
 * sola es decimal si la siguen 1 o 2 dígitos. Más de 2 decimales no es un precio válido.
 */
export function parseMoneyInput(text: string, { allowNegative = false } = {}): number | null {
  let value = text.trim().replace(/\s/g, '');
  let negative = false;
  if (value.startsWith('-')) {
    if (!allowNegative) return null;
    negative = true;
    value = value.slice(1);
  }
  if (!/^[\d.,]+$/.test(value) || !/\d/.test(value) || /[.,]{2}/.test(value)) return null;

  const lastDot = value.lastIndexOf('.');
  const lastComma = value.lastIndexOf(',');
  let decimalAt = -1;
  if (lastDot >= 0 && lastComma >= 0) decimalAt = Math.max(lastDot, lastComma);
  else if (lastDot >= 0) {
    // Solo puntos: uno es el decimal (12.50, o 12.345 inválido); varios, miles (1.250.000).
    if (value.indexOf('.') === lastDot) decimalAt = lastDot;
  } else if (lastComma >= 0) {
    // Solo comas: decimal si es una y la siguen 1 o 2 dígitos (12,5); si no, miles (1,250).
    if (value.indexOf(',') === lastComma && value.length - lastComma - 1 <= 2) {
      decimalAt = lastComma;
    }
  }

  const intPart = (decimalAt >= 0 ? value.slice(0, decimalAt) : value).replace(/[.,]/g, '');
  const fraction = decimalAt >= 0 ? value.slice(decimalAt + 1) : '';
  if (!/^\d*$/.test(fraction) || fraction.length > 2) return null;
  if (intPart.length > 9) return null;

  const cents = Number(intPart || '0') * 100 + Number(fraction.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Símbolo corto de la moneda en el idioma del panel (`$`, `L`), o el código si Intl no la conoce. */
export function currencySymbol(currency: string, locale: string): string {
  try {
    const part = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}
