import { describe, expect, it } from 'vitest';

import {
  customerName,
  formatAmount,
  formatElapsed,
  formatMoney,
  fulfillmentLabel,
  minutesSince,
} from './format';

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

describe('formatElapsed', () => {
  const placed = new Date('2026-10-08T15:00:00Z');
  const at = (minutes: number, seconds = 0) => placed.getTime() + minutes * 60_000 + seconds * 1000;

  it.each([
    [0, 30, 'ahora'],
    [1, 0, 'hace 1 min'],
    [7, 59, 'hace 7 min'],
    [59, 0, 'hace 59 min'],
    [60, 0, 'hace 1 h'],
    [65, 0, 'hace 1 h 5 min'],
    [150, 0, 'hace 2 h 30 min'],
  ])('%i min %i s → %s', (minutes, seconds, expected) => {
    expect(formatElapsed(placed, at(minutes, seconds))).toBe(expected);
  });

  it('un reloj atrasado no da tiempos negativos', () => {
    expect(minutesSince(placed, at(-5))).toBe(0);
    expect(formatElapsed(placed, at(-5))).toBe('ahora');
  });
});

describe('customerName / fulfillmentLabel', () => {
  it('nombre completo, parcial, vacío o sin cuenta', () => {
    expect(customerName({ firstName: 'Ana', lastName: 'Pérez', phone: null })).toBe('Ana Pérez');
    expect(customerName({ firstName: 'Ana', lastName: null, phone: null })).toBe('Ana');
    expect(customerName({ firstName: null, lastName: null, phone: '1' })).toBe(
      'Cliente sin nombre',
    );
    expect(customerName(null)).toBe('Cliente sin cuenta');
  });

  it('tipo de pedido en español', () => {
    expect(fulfillmentLabel('pickup')).toBe('Para llevar');
    expect(fulfillmentLabel('dine_in')).toBe('Comer aquí');
  });
});
