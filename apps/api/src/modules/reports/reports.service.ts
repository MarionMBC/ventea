import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ORDER_STATUS,
  REPORT_TOP_PRODUCTS,
  type OrderStatus,
  type SalesReport,
  type SalesReportQuery,
} from '@ventea/shared';

import { toPlan } from '@/modules/platform/platform.mapper';
import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { fillHours, fillSeries, resolveRange, safeTimeZone } from './report-range';

/** Estados que NO son venta: cancelado, o todavía sin confirmar. */
const NOT_SALE: readonly OrderStatus[] = ['cancelled', 'draft', 'pending_payment'];

type Num = bigint | number | null;
const num = (value: Num): number => Number(value ?? 0);

/**
 * Reportes de ventas (TASK-023). Todo se agrega en Postgres (4 consultas en paralelo) y nada
 * trae pedidos a Node. El rango llega en fechas locales de la marca y se convierte a UTC en
 * constantes, así el filtro sobre `placedAt` usa los índices `(tenantId, placedAt)` y
 * `(tenantId, locationId, placedAt)`; la zona solo se aplica al agrupar.
 */
@Injectable()
export class ReportsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClientExtended) {}

  /** 403 `plan_limit` si el plan no incluye reportes. Sin suscripción no hay plan que limite. */
  private async assertPlanIncludesReports(tenantId: string): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      select: { plan: true },
    });
    if (!subscription) return;
    const plan = toPlan(subscription.plan);
    if (plan?.features.reports) return;
    throw new ForbiddenException({
      message: `El plan ${subscription.plan.name} no incluye reportes de ventas`,
      code: 'plan_limit',
      limit: {
        resource: 'reports',
        plan: plan?.code ?? null,
        planName: subscription.plan.name,
        max: null,
      },
    });
  }

  async sales(tenantId: string, query: SalesReportQuery, now = new Date()): Promise<SalesReport> {
    await this.assertPlanIncludesReports(tenantId);

    const [tenant, locations] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { currency: true, timezone: true },
      }),
      this.prisma.location.findMany({
        where: { tenantId },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        select: { id: true, name: true, isActive: true },
      }),
    ]);
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    const locationId = query.locationId ?? null;
    if (locationId && !locations.some((location) => location.id === locationId)) {
      throw new NotFoundException('Sucursal no encontrada');
    }

    const tz = safeTimeZone(tenant.timezone);
    const { from, to } = resolveRange(query, tz, now);
    const granularity = query.granularity;

    // `placedAt` es timestamp sin zona en UTC. Límites: medianoche local de `from` y del día
    // siguiente a `to`, pasadas a UTC (constantes → sargable).
    const where = Prisma.sql`
      o."tenantId" = ${tenantId}
      AND o."placedAt" >= ((${from}::date)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC'
      AND o."placedAt" < ((${to}::date + 1)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC'
      ${locationId ? Prisma.sql`AND o."locationId" = ${locationId}` : Prisma.empty}`;
    const isSale = Prisma.sql`o."status"::text NOT IN (${Prisma.join([...NOT_SALE])})`;
    const local = Prisma.sql`((o."placedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})`;

    const [statusRows, seriesRows, productRows, hourRows] = await Promise.all([
      this.prisma.$queryRaw<{ status: string; orders: Num; sales: Num; discount: Num }[]>`
        SELECT o."status"::text AS "status", COUNT(*) AS "orders",
               SUM(o."totalCents") AS "sales", SUM(o."discountCents") AS "discount"
        FROM "orders" o
        WHERE ${where}
        GROUP BY o."status"`,
      this.prisma.$queryRaw<{ period: string; orders: Num; sales: Num }[]>`
        SELECT to_char(date_trunc(${granularity}, ${local}), 'YYYY-MM-DD') AS "period",
               COUNT(*) AS "orders", SUM(o."totalCents") AS "sales"
        FROM "orders" o
        WHERE ${where} AND ${isSale}
        GROUP BY 1`,
      // Producto = el ítem del menú (con el nombre más reciente vendido); las líneas cuyo ítem ya
      // no existe se agrupan por nombre. Montos brutos de línea: el descuento por puntos es del
      // pedido, no de un producto.
      this.prisma.$queryRaw<
        { menuItemId: string | null; name: string; quantity: Num; sales: Num }[]
      >`
        SELECT ol."menuItemId",
               (array_agg(ol."nameSnapshot" ORDER BY o."placedAt" DESC))[1] AS "name",
               SUM(ol."quantity") AS "quantity", SUM(ol."totalCents") AS "sales"
        FROM "order_lines" ol
        JOIN "orders" o ON o."id" = ol."orderId" AND o."tenantId" = ol."tenantId"
        WHERE ol."tenantId" = ${tenantId} AND ${where} AND ${isSale}
        GROUP BY ol."menuItemId", CASE WHEN ol."menuItemId" IS NULL THEN ol."nameSnapshot" END
        ORDER BY "quantity" DESC, "sales" DESC, "name"
        LIMIT ${REPORT_TOP_PRODUCTS}`,
      this.prisma.$queryRaw<{ hour: Num; orders: Num; sales: Num }[]>`
        SELECT EXTRACT(HOUR FROM ${local})::int AS "hour",
               COUNT(*) AS "orders", SUM(o."totalCents") AS "sales"
        FROM "orders" o
        WHERE ${where} AND ${isSale}
        GROUP BY 1`,
    ]);

    const byStatus = new Map(
      statusRows.map((row) => [
        row.status,
        { orders: num(row.orders), sales: num(row.sales), discount: num(row.discount) },
      ]),
    );
    const sales = [...byStatus]
      .filter(([status]) => !(NOT_SALE as readonly string[]).includes(status))
      .map(([, row]) => row);
    const orders = sales.reduce((sum, row) => sum + row.orders, 0);
    const salesCents = sales.reduce((sum, row) => sum + row.sales, 0);
    const discountCents = sales.reduce((sum, row) => sum + row.discount, 0);

    return {
      timezone: tz,
      currency: tenant.currency,
      from,
      to,
      granularity,
      locationId,
      locations,
      totals: {
        orders,
        salesCents,
        averageTicketCents: orders > 0 ? Math.round(salesCents / orders) : 0,
        discountCents,
        cancelledOrders: byStatus.get('cancelled')?.orders ?? 0,
      },
      series: fillSeries(
        from,
        to,
        granularity,
        seriesRows.map((row) => ({
          period: row.period,
          orders: num(row.orders),
          salesCents: num(row.sales),
        })),
      ),
      byStatus: ORDER_STATUS.flatMap((status) => {
        const row = byStatus.get(status);
        return row ? [{ status, orders: row.orders }] : [];
      }),
      topProducts: productRows.map((row) => ({
        menuItemId: row.menuItemId,
        name: row.name,
        quantity: num(row.quantity),
        salesCents: num(row.sales),
      })),
      peakHours: fillHours(
        hourRows.map((row) => ({
          hour: num(row.hour),
          orders: num(row.orders),
          salesCents: num(row.sales),
        })),
      ),
    };
  }
}
