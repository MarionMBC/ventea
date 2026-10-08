import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { orderSchema, publicMenuSchema, type Order } from '@ventea/shared';
import request from 'supertest';

import {
  createApp,
  createRawPrisma,
  importCarolinaMenu,
  loginStaff,
  registerCustomer,
  seedTenant,
  type TestTenant,
} from './helpers';

describe('Pedidos de staff (AC6)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenant: TestTenant;
  let other: TestTenant;
  let staffToken: string;
  let otherStaffToken: string;
  let line: { menuItemId: string; quantity: number; selectedOptionIds: string[] };

  const http = () => request(app.getHttpServer());

  async function placeOrder(customerToken: string, redeemRewardPoints = 0): Promise<Order> {
    const response = await http()
      .post('/api/orders')
      .set('X-Tenant-Slug', tenant.slug)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        locationId: tenant.locationId,
        fulfillmentType: 'pickup',
        lines: [line],
        redeemRewardPoints,
      })
      .expect(201);
    return orderSchema.parse(response.body);
  }

  function setStatus(orderId: string, status: string, token = staffToken, slug = tenant.slug) {
    return http()
      .patch(`/api/staff/orders/${orderId}/status`)
      .set('X-Tenant-Slug', slug)
      .set('Authorization', `Bearer ${token}`)
      .send({ status });
  }

  async function ledgerOf(customerToken: string) {
    const response = await http()
      .get('/api/rewards/ledger')
      .set('X-Tenant-Slug', tenant.slug)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    return response.body as {
      points: number;
      reason: string;
      orderId: string | null;
      note: string | null;
    }[];
  }

  async function balanceOf(customerToken: string): Promise<number> {
    const response = await http()
      .get('/api/rewards/balance')
      .set('X-Tenant-Slug', tenant.slug)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    return (response.body as { balance: number }).balance;
  }

  beforeAll(async () => {
    prisma = createRawPrisma();
    // 1 punto por unidad monetaria (100 centavos), 1 punto = 10 centavos al canjear.
    tenant = await seedTenant(prisma, 'staff', {
      pointsPerCurrencyUnit: 1,
      redemptionValueCents: 10,
      signupBonusPoints: 50,
    });
    other = await seedTenant(prisma, 'staff-otro');
    await importCarolinaMenu(prisma, tenant.slug);
    app = await createApp();

    const menuResponse = await http()
      .get('/api/menu')
      .set('X-Tenant-Slug', tenant.slug)
      .expect(200);
    const sandwich = publicMenuSchema
      .parse(menuResponse.body)
      .categories.flatMap((c) => c.items)
      .find((i) => i.name === 'Reaper Tender Sandwich')!;
    const hot = sandwich.modifierGroups[0]!.options.find((o) => o.name === 'Hot')!;
    line = { menuItemId: sandwich.id, quantity: 2, selectedOptionIds: [hot.id] }; // 2 × 1290 = 2580

    staffToken = (await loginStaff(app, tenant)).accessToken;
    otherStaffToken = (await loginStaff(app, other)).accessToken;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('avanza confirmed → preparing → ready → completed y completed acredita puntos una sola vez', async () => {
    const customer = await registerCustomer(app, tenant.slug);
    const order = await placeOrder(customer.accessToken);

    for (const status of ['preparing', 'ready'] as const) {
      const response = await setStatus(order.id, status).expect(200);
      expect(response.body.status).toBe(status);
    }

    const completed = await setStatus(order.id, 'completed').expect(200);
    expect(completed.body).toMatchObject({
      status: 'completed',
      paymentStatus: 'paid',
      pointsEarned: 25,
    });
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.completedAt).toBeInstanceOf(Date);

    // Segundo intento: transición inválida (409) y el asiento no se repite.
    await setStatus(order.id, 'completed').expect(409);
    const earned = (await ledgerOf(customer.accessToken)).filter(
      (e) => e.reason === 'order_earned',
    );
    expect(earned).toEqual([expect.objectContaining({ points: 25, orderId: order.id })]);
    expect(await balanceOf(customer.accessToken)).toBe(50 + 25);
  });

  it('dos "completed" simultáneos acreditan una sola vez', async () => {
    const customer = await registerCustomer(app, tenant.slug);
    const order = await placeOrder(customer.accessToken);
    await setStatus(order.id, 'preparing').expect(200);
    await setStatus(order.id, 'ready').expect(200);

    const results = await Promise.all([
      setStatus(order.id, 'completed'),
      setStatus(order.id, 'completed'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const earned = (await ledgerOf(customer.accessToken)).filter(
      (e) => e.reason === 'order_earned',
    );
    expect(earned).toHaveLength(1);
  });

  it('rechaza con 409 las transiciones fuera del flujo', async () => {
    const customer = await registerCustomer(app, tenant.slug);
    const order = await placeOrder(customer.accessToken);

    await setStatus(order.id, 'ready').expect(409);
    await setStatus(order.id, 'completed').expect(409);
    await setStatus(order.id, 'confirmed').expect(409);
    await setStatus(order.id, 'preparing').expect(200);
    await setStatus(order.id, 'confirmed').expect(409);
    await setStatus(order.id, 'no-existe').expect(400);
  });

  it('cancelled devuelve el canje y no acredita puntos; un pedido cancelado no cambia más', async () => {
    const customer = await registerCustomer(app, tenant.slug);
    const order = await placeOrder(customer.accessToken, 20);
    expect(order).toMatchObject({ discountCents: 200, pointsRedeemed: 20 });
    expect(await balanceOf(customer.accessToken)).toBe(30);

    await setStatus(order.id, 'preparing').expect(200);
    const cancelled = await setStatus(order.id, 'cancelled').expect(200);
    expect(cancelled.body).toMatchObject({ status: 'cancelled', pointsEarned: 0 });

    expect(await balanceOf(customer.accessToken)).toBe(50);
    const refund = (await ledgerOf(customer.accessToken)).filter(
      (e) => e.reason === 'manual_adjustment',
    );
    expect(refund).toEqual([
      expect.objectContaining({ points: 20, orderId: order.id, note: `refund:${order.id}` }),
    ]);

    await setStatus(order.id, 'cancelled').expect(409);
    await setStatus(order.id, 'completed').expect(409);
  });

  it('el cliente no puede cancelar un pedido que ya entró a cocina', async () => {
    const customer = await registerCustomer(app, tenant.slug);
    const order = await placeOrder(customer.accessToken);
    await setStatus(order.id, 'preparing').expect(200);
    await http()
      .post(`/api/orders/${order.id}/cancel`)
      .set('X-Tenant-Slug', tenant.slug)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .expect(409);
  });

  it('lista los pedidos del tenant, filtra por estado, y el staff de otro tenant no los ve', async () => {
    const customer = await registerCustomer(app, tenant.slug);
    const order = await placeOrder(customer.accessToken);

    const all = await http()
      .get('/api/staff/orders')
      .set('X-Tenant-Slug', tenant.slug)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    const orders = orderSchema.array().parse(all.body);
    expect(orders[0]?.id).toBe(order.id);

    const confirmed = await http()
      .get('/api/staff/orders?status=confirmed')
      .set('X-Tenant-Slug', tenant.slug)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect((confirmed.body as Order[]).every((o) => o.status === 'confirmed')).toBe(true);

    await http()
      .get('/api/staff/orders?status=nope')
      .set('X-Tenant-Slug', tenant.slug)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(400);

    const foreign = await http()
      .get('/api/staff/orders')
      .set('X-Tenant-Slug', other.slug)
      .set('Authorization', `Bearer ${otherStaffToken}`)
      .expect(200);
    expect(foreign.body).toEqual([]);
    await setStatus(order.id, 'preparing', otherStaffToken, other.slug).expect(404);
  });

  it('login de staff con clave incorrecta da 401', async () => {
    await http()
      .post('/api/staff/auth/login')
      .set('X-Tenant-Slug', tenant.slug)
      .send({ email: tenant.staffEmail, password: 'incorrecta-123' }) // gitleaks:allow — clave de prueba
      .expect(401);
  });
});
