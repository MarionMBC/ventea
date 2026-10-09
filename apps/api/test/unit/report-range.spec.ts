import { BadRequestException } from '@nestjs/common';

import {
  fillHours,
  fillSeries,
  periodStart,
  resolveRange,
  safeTimeZone,
} from '@/modules/reports/report-range';

describe('resolveRange', () => {
  // 2026-10-09 03:30 UTC = 2026-10-08 21:30 en Tegucigalpa (UTC-6).
  const now = new Date('2026-10-09T03:30:00Z');

  it('por defecto: los últimos 30 días hasta hoy EN LA ZONA de la marca', () => {
    expect(resolveRange({}, 'America/Tegucigalpa', now)).toEqual({
      from: '2026-09-09',
      to: '2026-10-08',
    });
    expect(resolveRange({}, 'UTC', now)).toEqual({ from: '2026-09-10', to: '2026-10-09' });
  });

  it('respeta from/to y acepta un solo día', () => {
    expect(resolveRange({ from: '2026-01-01', to: '2026-01-01' }, 'UTC', now)).toEqual({
      from: '2026-01-01',
      to: '2026-01-01',
    });
    expect(resolveRange({ from: '2026-10-01' }, 'UTC', now)).toEqual({
      from: '2026-10-01',
      to: '2026-10-09',
    });
  });

  it('400 con el rango invertido o de más de 366 días', () => {
    expect(() => resolveRange({ from: '2026-02-02', to: '2026-02-01' }, 'UTC', now)).toThrow(
      BadRequestException,
    );
    expect(() => resolveRange({ from: '2025-01-01', to: '2026-01-02' }, 'UTC', now)).toThrow(
      BadRequestException,
    );
    expect(resolveRange({ from: '2025-01-01', to: '2026-01-01' }, 'UTC', now).from).toBe(
      '2025-01-01',
    );
  });
});

describe('periodStart', () => {
  it('semana ISO (lunes) y mes', () => {
    expect(periodStart('2026-10-08', 'day')).toBe('2026-10-08');
    expect(periodStart('2026-10-08', 'week')).toBe('2026-10-05'); // jueves → lunes
    expect(periodStart('2026-10-11', 'week')).toBe('2026-10-05'); // domingo → lunes anterior
    expect(periodStart('2026-10-05', 'week')).toBe('2026-10-05');
    expect(periodStart('2026-10-31', 'month')).toBe('2026-10-01');
  });
});

describe('fillSeries', () => {
  it('rellena los días sin ventas con ceros', () => {
    const series = fillSeries('2026-10-01', '2026-10-03', 'day', [
      { period: '2026-10-02', orders: 2, salesCents: 500 },
    ]);
    expect(series).toEqual([
      { period: '2026-10-01', orders: 0, salesCents: 0 },
      { period: '2026-10-02', orders: 2, salesCents: 500 },
      { period: '2026-10-03', orders: 0, salesCents: 0 },
    ]);
  });

  it('semanas desde el lunes de la primera y meses cruzando el año', () => {
    expect(fillSeries('2026-10-01', '2026-10-14', 'week', []).map((p) => p.period)).toEqual([
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
    ]);
    expect(fillSeries('2026-11-15', '2027-02-01', 'month', []).map((p) => p.period)).toEqual([
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
      '2027-02-01',
    ]);
  });
});

describe('fillHours / safeTimeZone', () => {
  it('24 horas con ceros', () => {
    const hours = fillHours([{ hour: 13, orders: 3, salesCents: 900 }]);
    expect(hours).toHaveLength(24);
    expect(hours[13]).toEqual({ hour: 13, orders: 3, salesCents: 900 });
    expect(hours[0]).toEqual({ hour: 0, orders: 0, salesCents: 0 });
  });

  it('una zona inválida cae a UTC', () => {
    expect(safeTimeZone('America/Santiago')).toBe('America/Santiago');
    expect(safeTimeZone('Marte/Base')).toBe('UTC');
  });
});
