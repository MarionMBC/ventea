import { FUNNEL_EVENT, type FunnelEvent, type FunnelReport } from '@ventea/shared';

/** Zona con la que se corta el día del embudo: la operación está en Honduras. */
export const FUNNEL_TIMEZONE = 'America/Tegucigalpa';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` de `now` en `timeZone`. */
export function dayIn(now: Date, timeZone = FUNNEL_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * `YYYY-MM-DD` corrido `delta` días (aritmética de calendario, sin zona). Fuera de los años
 * 0000–9999 `toISOString` da `+010000-…`, que compara mal como string: se rechaza (RangeError)
 * en vez de devolver una fecha que rompa los bucles de quien llama.
 */
export function shiftDay(day: string, delta: number): string {
  const time = Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS;
  const iso = Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new RangeError(`Fecha fuera de rango: ${day}`);
  return iso;
}

function zeros(): Record<FunnelEvent, number> {
  return Object.fromEntries(FUNNEL_EVENT.map((event) => [event, 0])) as Record<FunnelEvent, number>;
}

/**
 * Serie de los últimos `days` días hasta `today` inclusive, el más nuevo primero, con ceros
 * donde no hubo eventos. Filas de tipos desconocidos (un evento que se dejó de usar) se ignoran.
 */
export function buildFunnelReport(
  rows: { day: string; event: string; count: number }[],
  today: string,
  days: number,
  timezone = FUNNEL_TIMEZONE,
): FunnelReport {
  const byDay = new Map<string, Record<FunnelEvent, number>>();
  for (let i = 0; i < days; i++) byDay.set(shiftDay(today, -i), zeros());

  const totals = zeros();
  for (const row of rows) {
    const counts = byDay.get(row.day);
    if (!counts || !(FUNNEL_EVENT as readonly string[]).includes(row.event)) continue;
    const event = row.event as FunnelEvent;
    counts[event] += row.count;
    totals[event] += row.count;
  }

  return {
    timezone,
    days: [...byDay].map(([day, counts]) => ({ day, counts })),
    totals,
  };
}
