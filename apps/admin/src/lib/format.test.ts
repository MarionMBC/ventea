import { describe, expect, it } from 'vitest';

import { formatAmount, formatClock, formatMoney, minutesSince } from './format';

describe('formatMoney', () => {
  it('usa la moneda del tenant con símbolo corto', () => {
    expect(formatMoney(2580, 'USD')).toBe('$25.80');
    expect(formatMoney(123456, 'USD')).toBe('$1,234.56');
    // Intl separa símbolo y número con un espacio duro (U+00A0).
    expect(formatMoney(2580, 'HNL')).toBe('L 25.80');
  });

  it('respeta los decimales de cada moneda', () => {
    // CLP no tiene centavos: 1290 "centavos" = 12.9 → $13
    expect(formatMoney(1290, 'CLP')).toBe('$13');
  });

  it('un código de moneda que Intl no acepta no rompe: CODE monto', () => {
    expect(formatMoney(2580, 'L$1')).toBe('L$1 25.80');
  });

  it('sin moneda (marca cargando) muestra solo el número', () => {
    expect(formatAmount(2580, undefined)).toBe('25.80');
    expect(formatAmount(2580, 'USD')).toBe('$25.80');
  });
});

describe('formatAmount / formatClock por locale', () => {
  it('inglés (en-US) y español (es-HN)', () => {
    expect(formatAmount(2580, 'USD', 'en-US')).toBe('$25.80');
    const at = new Date(2026, 9, 8, 14, 5);
    expect(formatClock(at, 'en-US').replace(/\s/g, ' ')).toBe('2:05 PM');
    expect(formatClock(at, 'es-HN')).toMatch(/^2:05/);
  });

  it('minutesSince nunca es negativo', () => {
    const placed = new Date('2026-10-08T15:00:00Z');
    expect(minutesSince(placed, placed.getTime() - 5 * 60_000)).toBe(0);
    expect(minutesSince(placed, placed.getTime() + 7 * 60_000 + 59_000)).toBe(7);
  });
});
