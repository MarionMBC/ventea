import { buildFunnelReport, dayIn, shiftDay } from '@/modules/platform/funnel-report';

describe('embudo de registro: reporte por día', () => {
  it('el día se corta en Honduras (UTC-6)', () => {
    expect(dayIn(new Date('2026-10-09T05:59:00Z'))).toBe('2026-10-08');
    expect(dayIn(new Date('2026-10-09T06:00:00Z'))).toBe('2026-10-09');
  });

  it('shiftDay cruza meses y años', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('rellena con ceros, más nuevo primero, suma totales e ignora tipos y días fuera de rango', () => {
    const report = buildFunnelReport(
      [
        { day: '2026-10-08', event: 'visit', count: 40 },
        { day: '2026-10-08', event: 'signup_complete', count: 2 },
        { day: '2026-10-06', event: 'visit', count: 10 },
        { day: '2026-10-06', event: 'evento_viejo', count: 99 },
        { day: '2026-09-01', event: 'visit', count: 500 },
      ],
      '2026-10-08',
      3,
    );

    expect(report.timezone).toBe('America/Tegucigalpa');
    expect(report.days.map((d) => d.day)).toEqual(['2026-10-08', '2026-10-07', '2026-10-06']);
    expect(report.days[0]!.counts).toEqual({
      visit: 40,
      cta_click: 0,
      signup_start: 0,
      signup_step_2: 0,
      signup_step_3: 0,
      signup_complete: 2,
    });
    expect(report.days[1]!.counts.visit).toBe(0);
    expect(report.totals.visit).toBe(50);
    expect(report.totals.signup_complete).toBe(2);
    expect(Object.keys(report.totals)).not.toContain('evento_viejo');
  });
});
