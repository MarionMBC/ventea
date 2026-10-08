import { randomInt } from 'node:crypto';

/**
 * Prefijo del código de pedido derivado del slug: iniciales de las primeras tres
 * palabras (`carolina-hot-chicken` → `CHC`) o las tres primeras letras si el slug
 * es una sola palabra (`burgers` → `BUR`).
 */
export function orderCodePrefix(slug: string): string {
  const words = slug.split('-').filter(Boolean);
  const prefix =
    words.length >= 2
      ? words
          .slice(0, 3)
          .map((word) => word[0])
          .join('')
      : (words[0] ?? 'ORD').slice(0, 3);
  return prefix.toUpperCase();
}

/**
 * Código corto que se canta en el mostrador: `CHC-4821`. La unicidad la garantiza
 * el índice `(tenantId, code)`; quien llama reintenta ante colisión. `digits` crece
 * en los reintentos para que un tenant con mucho volumen no se quede sin códigos.
 */
export function generateOrderCode(prefix: string, digits = 4): string {
  const number = randomInt(0, 10 ** digits);
  return `${prefix}-${String(number).padStart(digits, '0')}`;
}
