import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { OrderStatus, PrismaClient } from '@prisma/client';
import type { SalesReport } from '@ventea/shared';
import request from 'supertest';

import {
  createApp,
  createRawPrisma,
  createStaffMember,
  loginStaff,
  loginStaffAs,
  registerCustomer,
  seedTenant,
  type TestTenant,
} from './helpers';

/**
 * Reportes de ventas (TASK-023) con pedidos sembrados a mano en fechas y horas conocidas.
 * La marca está en America/Tegucigalpa (UTC-6, sin horario de verano): las fronteras del día
 * se prueban con pedidos a minutos de la medianoche local.
 */
describe('Reportes de ventas (TASK-023)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenant: TestTenant;
  let other: TestTenant;
  let owner: string;
  let manager: string;
  let staff: string;
  let otherOwner: string;
  let secondLocation: string;
  let burgerId: string;
  let sodaId: string;

  const get = (url: string, token: string, slug = tenant.slug) =>
    request(app.getHttpServer())
      .get(url)
      .set('X-Tenant-Slug', slug)
      .set('Authorization', `Bearer ${token}`);

  const RANGE = '/api/staff/reports/sales?from=2026-03-01&to=2026-03-07';

  async function menuItem(tenantId: string, categoryId: string, name: string): Promise<string> {
    const item = await prisma.menuItem.create({
      data: { tenantId, categoryId, name, basePriceCents: 100 },
    });
    return item.id;
  }

  async function order(
    t: TestTenant,
    data: {
      placedAt: string;
      status: OrderStatus;
      totalCents: number;
      discountCents?: number;
      locationId?: string;
      lines?: { menuItemId: string | null; name: string; quantity: number; totalCents: number }[];
    },
  ): Promise<void> {
    await prisma.order.create({
      data: {
        tenantId: t.id,
        locationId: data.locationId ?? t.locationId,
        code: `R-${randomUUID().slice(0, 8)}`,
        status: data.status,
        fulfillmentType: 'pickup',
        subtotalCents: data.totalCents + (data.discountCents ?? 0),
        discountCents: data.discountCents ?? 0,
        totalCents: data.totalCents,
        placedAt: new Date(data.placedAt),
        lines: {
          create: (data.lines ?? []).map((line) => ({
            tenantId: t.id,
            menuItemId: line.menuItemId,
            nameSnapshot: line.name,
            quantity: line.quantity,
            unitPriceCents: Math.round(line.totalCents / line.quantity),
            totalCents: line.totalCents,
          })),
        },
      },
    });
  }

  beforeAll(async () => {
    app = await createApp();
    prisma = createRawPrisma();
    tenant = await seedTenant(prisma, 'reports');
    other = await seedTenant(prisma, 'reports-other');
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { timezone: 'America/Tegucigalpa' },
    });
    secondLocation = (
      await prisma.location.create({
        data: {
          tenantId: tenant.id,
          name: 'Sucursal Norte',
          address: 'N',
          latitude: 0,
          longitude: 0,
        },
      })
    ).id;
    const category = await prisma.menuCategory.create({
      data: { tenantId: tenant.id, name: 'Todo' },
    });
    burgerId = await menuItem(tenant.id, category.id, 'Burger');
    sodaId = await menuItem(tenant.id, category.id, 'Soda');

    owner = (await loginStaff(app, tenant)).accessToken;
    manager = await loginStaffAs(app, tenant, await createStaffMember(prisma, tenant, 'manager'));
    staff = await loginStaffAs(app, tenant, await createStaffMember(prisma, tenant, 'staff'));
    otherOwner = (await loginStaff(app, other)).accessToken;

    // 2026-03-02 18:30 local, completado, 2 productos.
    await order(tenant, {
      placedAt: '2026-03-03T00:30:00Z',
      status: 'completed',
      totalCents: 1000,
      lines: [
        { menuItemId: burgerId, name: 'Burger', quantity: 2, totalCents: 800 },
        { menuItemId: sodaId, name: 'Soda', quantity: 1, totalCents: 200 },
      ],
    });
    // 2026-03-02 12:10 local, listo, con descuento por puntos, otra sucursal. El nombre
    // vendido cambió: el producto se agrupa por ítem y muestra el nombre más reciente.
    await order(tenant, {
      placedAt: '2026-03-02T18:10:00Z',
      status: 'ready',
      totalCents: 500,
      discountCents: 100,
      locationId: secondLocation,
      lines: [{ menuItemId: burgerId, name: 'Burger vieja', quantity: 1, totalCents: 600 }],
    });
    // Cancelado: no es venta ni producto vendido, pero aparece por estado.
    await order(tenant, {
      placedAt: '2026-03-03T18:45:00Z',
      status: 'cancelled',
      totalCents: 9999,
      lines: [{ menuItemId: burgerId, name: 'Burger', quantity: 5, totalCents: 9999 }],
    });
    // Sin confirmar: tampoco es venta.
    await order(tenant, {
      placedAt: '2026-03-04T15:00:00Z',
      status: 'pending_payment',
      totalCents: 4444,
    });
    // 2026-02-28 18:30 local: fuera del rango aunque en UTC ya sea 1 de marzo.
    await order(tenant, {
      placedAt: '2026-03-01T00:30:00Z',
      status: 'completed',
      totalCents: 7777,
    });
    // 2026-03-07 23:30 local: dentro aunque en UTC ya sea 8 de marzo. Ítem borrado (sin id).
    await order(tenant, {
      placedAt: '2026-03-08T05:30:00Z',
      status: 'completed',
      totalCents: 300,
      lines: [{ menuItemId: null, name: 'Agua', quantity: 1, totalCents: 300 }],
    });
    // 2026-03-08 00:30 local: fuera.
    await order(tenant, {
      placedAt: '2026-03-08T06:30:00Z',
      status: 'completed',
      totalCents: 8888,
    });
    // Otra marca, mismo rango: nunca se suma.
    await order(other, {
      placedAt: '2026-03-03T18:00:00Z',
      status: 'completed',
      totalCents: 55555,
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('agregados del rango: ventas, ticket promedio, cancelados y descuentos', async () => {
    const report = (await get(RANGE, owner).expect(200)).body as SalesReport;
    expect(report).toMatchObject({
      timezone: 'America/Tegucigalpa',
      currency: 'CLP',
      from: '2026-03-01',
      to: '2026-03-07',
      granularity: 'day',
      locationId: null,
      totals: {
        orders: 3,
        salesCents: 1800,
        averageTicketCents: 600,
        discountCents: 100,
        cancelledOrders: 1,
      },
    });
    expect(report.locations.map((l) => l.name).sort()).toEqual([
      'Sucursal Centro',
      'Sucursal Cerrada',
      'Sucursal Norte',
    ]);
    expect(report.byStatus).toEqual([
      { status: 'pending_payment', orders: 1 },
      { status: 'ready', orders: 1 },
      { status: 'completed', orders: 2 },
      { status: 'cancelled', orders: 1 },
    ]);
  });

  it('serie diaria con días vacíos y frontera de medianoche en la zona de la marca', async () => {
    const report = (await get(RANGE, owner).expect(200)).body as SalesReport;
    expect(report.series).toEqual([
      { period: '2026-03-01', orders: 0, salesCents: 0 },
      { period: '2026-03-02', orders: 2, salesCents: 1500 },
      { period: '2026-03-03', orders: 0, salesCents: 0 },
      { period: '2026-03-04', orders: 0, salesCents: 0 },
      { period: '2026-03-05', orders: 0, salesCents: 0 },
      { period: '2026-03-06', orders: 0, salesCents: 0 },
      { period: '2026-03-07', orders: 1, salesCents: 300 },
    ]);
  });

  it('semana (desde el lunes) y mes', async () => {
    const week = (await get(`${RANGE}&granularity=week`, owner).expect(200)).body as SalesReport;
    expect(week.series).toEqual([
      { period: '2026-02-23', orders: 0, salesCents: 0 },
      { period: '2026-03-02', orders: 3, salesCents: 1800 },
    ]);
    const month = (await get(`${RANGE}&granularity=month`, owner).expect(200)).body as SalesReport;
    expect(month.series).toEqual([{ period: '2026-03-01', orders: 3, salesCents: 1800 }]);
  });

  it('top productos y horas pico (hora local)', async () => {
    const report = (await get(RANGE, owner).expect(200)).body as SalesReport;
    expect(report.topProducts).toEqual([
      { menuItemId: burgerId, name: 'Burger', quantity: 3, salesCents: 1400 },
      { menuItemId: null, name: 'Agua', quantity: 1, salesCents: 300 },
      { menuItemId: sodaId, name: 'Soda', quantity: 1, salesCents: 200 },
    ]);
    expect(report.peakHours).toHaveLength(24);
    const busy = report.peakHours.filter((h) => h.orders > 0);
    expect(busy).toEqual([
      { hour: 12, orders: 1, salesCents: 500 },
      { hour: 18, orders: 1, salesCents: 1000 },
      { hour: 23, orders: 1, salesCents: 300 },
    ]);
  });

  it('filtro por sucursal', async () => {
    const report = (await get(`${RANGE}&locationId=${secondLocation}`, owner).expect(200))
      .body as SalesReport;
    expect(report.locationId).toBe(secondLocation);
    expect(report.totals).toMatchObject({ orders: 1, salesCents: 500, cancelledOrders: 0 });
    expect(report.topProducts).toEqual([
      { menuItemId: burgerId, name: 'Burger vieja', quantity: 1, salesCents: 600 },
    ]);
  });

  it('rango sin ventas: todo en cero', async () => {
    const report = (
      await get('/api/staff/reports/sales?from=2026-01-01&to=2026-01-03', owner).expect(200)
    ).body as SalesReport;
    expect(report.totals).toEqual({
      orders: 0,
      salesCents: 0,
      averageTicketCents: 0,
      discountCents: 0,
      cancelledOrders: 0,
    });
    expect(report.series).toHaveLength(3);
    expect(report.topProducts).toEqual([]);
    expect(report.byStatus).toEqual([]);
    expect(report.peakHours.every((h) => h.orders === 0)).toBe(true);
  });

  it('sin fechas: últimos 30 días hasta hoy', async () => {
    const report = (await get('/api/staff/reports/sales', owner).expect(200)).body as SalesReport;
    expect(report.series).toHaveLength(30);
    expect(report.series.at(-1)?.period).toBe(report.to);
  });

  it('gerente sí; staff, cliente y sin sesión no', async () => {
    await get(RANGE, manager).expect(200);
    await get(RANGE, staff).expect(403);
    const customer = await registerCustomer(app, tenant.slug);
    // Token de cliente en una ruta de staff: sesión inválida para esta ruta.
    await get(RANGE, customer.accessToken).expect(401);
    await request(app.getHttpServer()).get(RANGE).set('X-Tenant-Slug', tenant.slug).expect(401);
  });

  it('aislamiento: cada marca ve lo suyo; token de otra marca no sirve', async () => {
    const report = (await get(RANGE, otherOwner, other.slug).expect(200)).body as SalesReport;
    expect(report.totals).toMatchObject({ orders: 1, salesCents: 55555 });
    await get(RANGE, otherOwner).expect(401);
    // Sucursal de otra marca: 404, no un reporte vacío que confirme que existe.
    await get(`${RANGE}&locationId=${other.locationId}`, owner).expect(404);
  });

  it('valida el rango', async () => {
    await get('/api/staff/reports/sales?from=2026-02-30', owner).expect(400);
    // Años extremos: antes colgaban la API en un bucle infinito (review TASK-023).
    await get('/api/staff/reports/sales?from=9999-12-31&to=9999-12-31', owner).expect(400);
    await get('/api/staff/reports/sales?from=0001-01-01&to=0001-01-01', owner).expect(400);
    await get('/api/staff/reports/sales?to=9999-12-31', owner).expect(400);
    await get('/api/staff/reports/sales?from=2026-03-07&to=2026-03-01', owner).expect(400);
    await get('/api/staff/reports/sales?from=2025-01-01&to=2026-03-01', owner).expect(400);
    await get(`${RANGE}&granularity=year`, owner).expect(400);
    await get(`${RANGE}&locationId=nope`, owner).expect(400);
  });

  it('respeta el plan: Básico y Pro no incluyen reportes (403 plan_limit)', async () => {
    for (const code of ['basic', 'pro'] as const) {
      const plan = await prisma.plan.findUniqueOrThrow({ where: { code } });
      await prisma.subscription.update({
        where: { tenantId: other.id },
        data: { planId: plan.id },
      });
      const response = await get(RANGE, otherOwner, other.slug).expect(403);
      expect(response.body).toMatchObject({
        code: 'plan_limit',
        limit: { resource: 'reports', plan: code, max: null },
      });
    }
  });
});
