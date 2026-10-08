import { canAddLocation, fitsLocationLimit } from '@/modules/subscriptions/plan-limits';
import { SlidingWindowLimiter } from '@/modules/platform/rate-limit';

describe('límites de plan', () => {
  it('Básico (1 sucursal): la primera sí, la segunda no', () => {
    expect(canAddLocation(1, 0)).toBe(true);
    expect(canAddLocation(1, 1)).toBe(false);
  });

  it('Pro (3 sucursales): hasta la tercera', () => {
    expect(canAddLocation(3, 2)).toBe(true);
    expect(canAddLocation(3, 3)).toBe(false);
  });

  it('Cadena (null): ilimitadas', () => {
    expect(canAddLocation(null, 0)).toBe(true);
    expect(canAddLocation(null, 500)).toBe(true);
  });

  it('bajar de plan solo si las sucursales activas caben', () => {
    expect(fitsLocationLimit(1, 1)).toBe(true);
    expect(fitsLocationLimit(1, 2)).toBe(false);
    expect(fitsLocationLimit(3, 3)).toBe(true);
    expect(fitsLocationLimit(null, 40)).toBe(true);
  });
});

describe('SlidingWindowLimiter', () => {
  const HOUR = 60 * 60 * 1000;

  it('deja pasar N intentos por ventana y avisa cuánto falta para el siguiente', () => {
    const limiter = new SlidingWindowLimiter(HOUR);
    for (let i = 0; i < 5; i++) expect(limiter.hit('1.2.3.4', 5, 1000 + i)).toBeNull();
    expect(limiter.hit('1.2.3.4', 5, 2000)).toBe(1000 + HOUR - 2000);
    // Otra IP tiene su propio cupo.
    expect(limiter.hit('5.6.7.8', 5, 2000)).toBeNull();
  });

  it('el cupo se libera cuando el intento más viejo sale de la ventana', () => {
    const limiter = new SlidingWindowLimiter(HOUR);
    for (let i = 0; i < 5; i++) limiter.hit('ip', 5, i * 1000);
    expect(limiter.hit('ip', 5, HOUR - 1)).not.toBeNull();
    expect(limiter.hit('ip', 5, HOUR + 1)).toBeNull();
  });
});
