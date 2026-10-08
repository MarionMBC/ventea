import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { orderSchema, publicMenuSchema } from '@ventea/shared';
import request from 'supertest';

import {
  createApp,
  createRawPrisma,
  importCarolinaMenu,
  registerCustomer,
  seedTenant,
  type TestTenant,
} from './helpers';

describe('Idempotency-Key en POST /api/orders (TASK-002)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenant: TestTenant;
  let other: TestTenant;
  let sandwichLine: { menuItemId: string; quantity: number; selectedOptionIds: string[] };
  let otherSandwichLine: typeof sandwichLine;

  const http = () => request(app.getHttpServer());

  async function lineFor(slug: string): Promise<typeof sandwichLine> {
    const response = await http().get('/api/menu').set('X-Tenant-Slug', slug).expect(200);
    const sandwich = publicMenuSchema
      .parse(response.body)
      .categories.flatMap((c) => c.items)
      .find((i) => i.name === 'Reaper Tender Sandwich')!;
    const hot = sandwich.modifierGroups[0]!.options.find((o) => o.name === 'Hot')!;
    return { menuItemId: sandwich.id, quantity: 1, selectedOptionIds: [hot.id] };
  }

  function placeOrder(
    token: string,
    body: Record<string, unknown>,
    key?: string,
    target: TestTenant = tenant,
  ) {
    const req = http()
      .post('/api/orders')
      .set('X-Tenant-Slug', target.slug)
      .set('Authorization', `Bearer ${token}`);
    if (key !== undefined) req.set('Idempotency-Key', key);
    return req.send({ locationId: target.locationId, fulfillmentType: 'pickup', ...body });
  }

  const newKey = () => `ord_${randomUUID()}`;

  beforeAll(async () => {
    prisma = createRawPrisma();
    tenant = await seedTenant(prisma, 'idem', { signupBonusPoints: 50, redemptionValueCents: 10 });
    other = await seedTenant(prisma, 'idem-otro', {
      signupBonusPoints: 50,
      redemptionValueCents: 10,
    });
    await importCarolinaMenu(prisma, tenant.slug, { keepRewardProgram: true });
    await importCarolinaMenu(prisma, other.slug, { keepRewardProgram: true });
    app = await createApp();
    sandwichLine = await lineFor(tenant.slug);
    otherSandwichLine = await lineFor(other.slug);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('AC1: reintento con misma clave y mismo cuerpo → 200 con el mismo pedido, sin duplicar pedido ni canje', async () => {
    const { accessToken, customer } = await registerCustomer(app, tenant.slug);
    const key = newKey();
    const body = { lines: [sandwichLine], redeemRewardPoints: 20 };

    const first = await placeOrder(accessToken, body, key).expect(201);
    const retry = await placeOrder(accessToken, body, key).expect(200);

    expect(orderSchema.parse(retry.body)).toEqual(orderSchema.parse(first.body));
    expect(await prisma.order.count({ where: { customerId: customer.id } })).toBe(1);
    expect(
      await prisma.rewardLedgerEntry.count({
        where: { customerId: customer.id, reason: 'redemption' },
      }),
    ).toBe(1);
  });

  it('el reintento devuelve el pedido aunque ya haya avanzado de estado', async () => {
    const { accessToken } = await registerCustomer(app, tenant.slug);
    const key = newKey();
    const body = { lines: [sandwichLine] };
    const first = await placeOrder(accessToken, body, key).expect(201);
    await prisma.order.update({ where: { id: first.body.id }, data: { status: 'preparing' } });

    const retry = await placeOrder(accessToken, body, key).expect(200);
    expect(retry.body).toMatchObject({ id: first.body.id, status: 'preparing' });
  });

  it('AC2: misma clave con otro cuerpo → 409', async () => {
    const { accessToken, customer } = await registerCustomer(app, tenant.slug);
    const key = newKey();
    await placeOrder(accessToken, { lines: [sandwichLine] }, key).expect(201);

    const response = await placeOrder(
      accessToken,
      { lines: [{ ...sandwichLine, quantity: 2 }] },
      key,
    ).expect(409);
    expect(response.body).toEqual({
      statusCode: 409,
      message: 'Idempotency-Key reutilizada con otro pedido',
      error: 'Conflict',
    });
    expect(await prisma.order.count({ where: { customerId: customer.id } })).toBe(1);
  });

  it('AC3: 5 requests concurrentes con la misma clave → 1 pedido', async () => {
    const { accessToken, customer } = await registerCustomer(app, tenant.slug);
    const key = newKey();
    const body = { lines: [sandwichLine], redeemRewardPoints: 10 };

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => placeOrder(accessToken, body, key)),
    );

    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(responses.map((r) => (r.body as { id: string }).id)).size).toBe(1);
    expect(await prisma.order.count({ where: { customerId: customer.id } })).toBe(1);
    expect(
      await prisma.rewardLedgerEntry.count({
        where: { customerId: customer.id, reason: 'redemption' },
      }),
    ).toBe(1);
  });

  it('AC4: la misma clave en dos clientes (y en otro tenant) crea pedidos distintos', async () => {
    const key = newKey();
    const ana = await registerCustomer(app, tenant.slug);
    const beto = await registerCustomer(app, tenant.slug);
    const carla = await registerCustomer(app, other.slug);

    const a = await placeOrder(ana.accessToken, { lines: [sandwichLine] }, key).expect(201);
    const b = await placeOrder(beto.accessToken, { lines: [sandwichLine] }, key).expect(201);
    const c = await placeOrder(
      carla.accessToken,
      { lines: [otherSandwichLine] },
      key,
      other,
    ).expect(201);

    expect(new Set([a.body.id, b.body.id, c.body.id]).size).toBe(3);
  });

  it.each([
    ['muy corta', 'abc1234'],
    ['muy larga', 'k'.repeat(129)],
    ['caracteres inválidos', 'clave con espacios!'],
  ])('clave con formato inválido (%s) → 400', async (_case, key) => {
    const { accessToken, customer } = await registerCustomer(app, tenant.slug);
    await placeOrder(accessToken, { lines: [sandwichLine] }, key).expect(400);
    expect(await prisma.order.count({ where: { customerId: customer.id } })).toBe(0);
  });

  it('sin header: cada POST crea un pedido nuevo (comportamiento anterior)', async () => {
    const { accessToken, customer } = await registerCustomer(app, tenant.slug);
    await placeOrder(accessToken, { lines: [sandwichLine] }).expect(201);
    await placeOrder(accessToken, { lines: [sandwichLine] }).expect(201);
    expect(await prisma.order.count({ where: { customerId: customer.id } })).toBe(2);
  });
});
