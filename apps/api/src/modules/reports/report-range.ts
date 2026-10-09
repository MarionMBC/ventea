import { BadRequestException } from '@nestjs/common';
import {
  REPORT_DEFAULT_DAYS,
  REPORT_MAX_DAYS,
  type ReportGranularity,
  type SalesReport,
} from '@ventea/shared';

import { dayIn, shiftDay } from '@/modules/platform/funnel-report';

/**
 * Reglas puras de los reportes (TASK-023): rango de fechas locales, períodos y relleno de
 * huecos. Sin base de datos: se testean con unit tests.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** La zona de la marca si Intl la conoce; si no (dato roto), UTC antes que un 500. */
export function safeTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/** Días entre dos fechas `AAAA-MM-DD` (`to - from`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * Rango pedido o, si falta, los últimos 30 días hasta hoy en la zona de la marca. `from` solo
 * = desde ese día hasta hoy; `to` solo = los 30 días que terminan ese día.
 */
export function resolveRange(
  query: { from?: string; to?: string },
  timeZone: string,
  now: Date = new Date(),
): { from: string; to: string } {
  const to = query.to ?? dayIn(now, timeZone);
  const from = query.from ?? shiftDay(to, -(REPORT_DEFAULT_DAYS - 1));
  const span = daysBetween(from, to);
  if (span < 0) throw new BadRequestException('La fecha inicial es posterior a la final');
  if (span + 1 > REPORT_MAX_DAYS) {
    throw new BadRequestException(`El rango máximo es de ${REPORT_MAX_DAYS} días`);
  }
  return { from, to };
}

/** Primer día del período que contiene `day`: el mismo día, el lunes de su semana o el 1.º del mes. */
export function periodStart(day: string, granularity: ReportGranularity): string {
  if (granularity === 'month') return `${day.slice(0, 8)}01`;
  if (granularity === 'week') {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = domingo
    return shiftDay(day, -((weekday + 6) % 7));
  }
  return day;
}

function nextPeriod(period: string, granularity: ReportGranularity): string {
  if (granularity === 'day') return shiftDay(period, 1);
  if (granularity === 'week') return shiftDay(period, 7);
  const [year, month] = period.split('-').map(Number) as [number, number];
  const next = new Date(Date.UTC(year, month, 1)); // month es 1-based: esto es el mes siguiente
  return next.toISOString().slice(0, 10);
}

/**
 * Todos los períodos del rango (también los vacíos), con lo que trajo la consulta. El bucle
 * tiene tope numérico (`REPORT_MAX_DAYS + 1` períodos) además de la comparación de fechas:
 * ningún dato raro puede dejarlo girando y bloquear la API (review TASK-023).
 */
export function fillSeries(
  from: string,
  to: string,
  granularity: ReportGranularity,
  rows: readonly { period: string; orders: number; salesCents: number }[],
): SalesReport['series'] {
  const byPeriod = new Map(rows.map((row) => [row.period, row]));
  const series: SalesReport['series'] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  let period = periodStart(from, granularity);
  for (let i = 0; i <= REPORT_MAX_DAYS && Date.parse(`${period}T00:00:00Z`) <= end; i++) {
    const row = byPeriod.get(period);
    series.push({ period, orders: row?.orders ?? 0, salesCents: row?.salesCents ?? 0 });
    period = nextPeriod(period, granularity);
  }
  return series;
}

/** Las 24 horas locales, con ceros donde no hubo pedidos. */
export function fillHours(
  rows: readonly { hour: number; orders: number; salesCents: number }[],
): SalesReport['peakHours'] {
  const byHour = new Map(rows.map((row) => [row.hour, row]));
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: byHour.get(hour)?.orders ?? 0,
    salesCents: byHour.get(hour)?.salesCents ?? 0,
  }));
}
