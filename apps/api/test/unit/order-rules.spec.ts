import { assertJwtSecret, parseTtl } from '@/modules/auth/token.service';

import { generateOrderCode, orderCodePrefix } from '@/modules/orders/order-code';
import { canTransition } from '@/modules/orders/order-status';

describe('canTransition', () => {
  it.each([
    ['confirmed', 'preparing'],
    ['preparing', 'ready'],
    ['ready', 'completed'],
    ['confirmed', 'cancelled'],
    ['preparing', 'cancelled'],
    ['ready', 'cancelled'],
  ] as const)('%s → %s es válida', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ['confirmed', 'ready'],
    ['confirmed', 'completed'],
    ['preparing', 'confirmed'],
    ['ready', 'preparing'],
    ['completed', 'cancelled'],
    ['cancelled', 'confirmed'],
    ['completed', 'completed'],
    ['confirmed', 'confirmed'],
  ] as const)('%s → %s es inválida', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

describe('código de pedido', () => {
  it('prefijo desde el slug', () => {
    expect(orderCodePrefix('carolina-hot-chicken')).toBe('CHC');
    expect(orderCodePrefix('demo-burgers')).toBe('DB');
    expect(orderCodePrefix('burgers')).toBe('BUR');
  });

  it('formato PREFIJO-NNNN', () => {
    expect(generateOrderCode('CHC')).toMatch(/^CHC-\d{4}$/);
    expect(generateOrderCode('CHC', 6)).toMatch(/^CHC-\d{6}$/);
  });
});

describe('assertJwtSecret', () => {
  const strong = 'x'.repeat(32);

  it('exige secreto en cualquier entorno', () => {
    expect(() => assertJwtSecret(undefined, 'development')).toThrow(/Falta JWT_SECRET/);
    expect(() => assertJwtSecret('', 'production')).toThrow(/Falta JWT_SECRET/);
  });

  it('en producción rechaza el valor de .env.example y los cortos', () => {
    expect(() => assertJwtSecret('cambiar-en-cada-entorno', 'production')).toThrow(/env.example/);
    expect(() => assertJwtSecret('x'.repeat(31), 'production')).toThrow(/corto/);
    expect(assertJwtSecret(strong, 'production')).toBe(strong);
  });

  it('fuera de producción acepta un secreto corto', () => {
    expect(assertJwtSecret('dev', 'development')).toBe('dev');
  });
});

describe('parseTtl', () => {
  it('entiende segundos, minutos, horas y días', () => {
    expect(parseTtl('900')).toBe(900);
    expect(parseTtl('15m')).toBe(900);
    expect(parseTtl('12h')).toBe(43200);
    expect(parseTtl('30d')).toBe(2592000);
  });

  it('falla con un valor que no entiende', () => {
    expect(() => parseTtl('quince')).toThrow(/TTL/);
    expect(() => parseTtl('0m')).toThrow(/TTL/);
  });
});
