import { z } from 'zod';

import { ORDER_STATUS } from '../domain/enums.js';

/**
 * Reportes de ventas (TASK-023, `GET /api/staff/reports/sales`, owner y manager; solo planes
 * con `features.reports`). Fechas en la zona horaria de la marca, montos en centavos.
 *
 * Venta = pedido colocado (`placedAt`) que no está cancelado ni sin confirmar.
 */

export const REPORT_GRANULARITY = ['day', 'week', 'month'] as const;
export type ReportGranularity = (typeof REPORT_GRANULARITY)[number];

/** Rango máximo de un reporte, en días (inclusive). */
export const REPORT_MAX_DAYS = 366;
/** Rango por defecto: los últimos 30 días, hoy incluido. */
export const REPORT_DEFAULT_DAYS = 30;
export const REPORT_TOP_PRODUCTS = 10;

/**
 * Años admitidos en un reporte. Acotados a propósito: con años extremos (9999, 0001) la
 * aritmética de fechas produce strings como `+010000-01-01` y un bucle por períodos podría no
 * terminar nunca (review TASK-023).
 */
export const REPORT_MIN_YEAR = 2000;
export const REPORT_MAX_YEAR = 2100;

/**
 * Fecha `AAAA-MM-DD` que existe en el calendario, sin acotar el año. Es la de la RESPUESTA: el
 * primer período de una semana de enero del 2000 empieza en 1999 (`1999-12-27`), y el panel no
 * puede rechazar lo que la API devuelve bien.
 */
export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, 'Fecha inválida');

/** Fecha local `AAAA-MM-DD` de la ENTRADA: existe en el calendario y está entre 2000 y 2100. */
export const isoDateSchema = calendarDateSchema.refine((value) => {
  const year = Number(value.slice(0, 4));
  return year >= REPORT_MIN_YEAR && year <= REPORT_MAX_YEAR;
}, `Año entre ${REPORT_MIN_YEAR} y ${REPORT_MAX_YEAR}`);

export const salesReportQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  locationId: z.string().uuid().optional(),
  granularity: z.enum(REPORT_GRANULARITY).default('day'),
});

const count = z.number().int().nonnegative();
const cents = z.number().int();

export const salesReportSchema = z.object({
  timezone: z.string(),
  currency: z.string().length(3),
  from: calendarDateSchema,
  to: calendarDateSchema,
  granularity: z.enum(REPORT_GRANULARITY),
  locationId: z.string().uuid().nullable(),
  /** Sucursales de la marca para el filtro (también las inactivas: tienen historia). */
  locations: z.array(z.object({ id: z.string().uuid(), name: z.string(), isActive: z.boolean() })),
  totals: z.object({
    orders: count,
    salesCents: cents,
    averageTicketCents: cents,
    discountCents: cents,
    cancelledOrders: count,
  }),
  /** Un punto por período del rango (también los vacíos). `period` = primer día del período. */
  series: z.array(z.object({ period: calendarDateSchema, orders: count, salesCents: cents })),
  /** Todos los pedidos colocados del rango por estado (incluye cancelados). */
  byStatus: z.array(z.object({ status: z.enum(ORDER_STATUS), orders: count })),
  topProducts: z.array(
    z.object({
      menuItemId: z.string().uuid().nullable(),
      name: z.string(),
      quantity: count,
      salesCents: cents,
    }),
  ),
  /** 24 horas locales (0–23) con pedidos y ventas. */
  peakHours: z.array(
    z.object({ hour: z.number().int().min(0).max(23), orders: count, salesCents: cents }),
  ),
});

export type SalesReportQuery = z.infer<typeof salesReportQuerySchema>;
export type SalesReport = z.infer<typeof salesReportSchema>;
