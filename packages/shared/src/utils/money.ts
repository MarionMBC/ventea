/**
 * El dinero se maneja SIEMPRE en la unidad mínima de la moneda (centavos), como entero.
 * Nunca float: 0.1 + 0.2 !== 0.3 y un céntimo perdido por pedido es un descuadre de caja.
 * La DB guarda `Int`; el formateo a texto ocurre solo en la capa de presentación.
 */
export type Cents = number;

export function toCents(amount: number): Cents {
  return Math.round(amount * 100);
}

export function fromCents(cents: Cents): number {
  return cents / 100;
}

export function formatMoney(cents: Cents, currency: string, locale = 'es-CL'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(fromCents(cents));
}
