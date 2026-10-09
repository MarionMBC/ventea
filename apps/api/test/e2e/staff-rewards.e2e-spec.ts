import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type {
  PublicTenant,
  RewardBalance,
  RewardCatalogItem,
  RewardCustomerDetail,
  RewardCustomersPage,
  StaffRewards,
} from '@ventea/shared';
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

describe('Puntos desde el panel (TASK-023)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenant: TestTenant;
  let other: TestTenant;
  let owner: string;
  let manager: string;
  let staff: string;
  let otherOwner: string;
  let itemId: string;
  let otherItemId: string;
  let customerId: string;
  let customerToken: string;

  const as = (token: string, slug = tenant.slug) => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('X-Tenant-Slug', slug)
        .set('Authorization', `Bearer ${token}`),
    post: (url: string, body?: object) =>
      request(app.getHttpServer())
        .post(url)
        .set('X-Tenant-Slug', slug)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
    put: (url: string, body: object) =>
      request(app.getHttpServer())
        .put(url)
        .set('X-Tenant-Slug', slug)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
    delete: (url: string) =>
      request(app.getHttpServer())
        .delete(url)
        .set('X-Tenant-Slug', slug)
        .set('Authorization', `Bearer ${token}`),
  });

  const publicTenant = async (slug = tenant.slug): Promise<PublicTenant> =>
    (await request(app.getHttpServer()).get('/api/tenant').set('X-Tenant-Slug', slug).expect(200))
      .body as PublicTenant;

  const PROGRAM = {
    isEnabled: true,
    pointsPerCurrencyUnit: 2.5,
    redemptionValueCents: 5,
    minPointsToRedeem: 20,
    signupBonusPoints: 50,
  };

  beforeAll(async () => {
    app = await createApp();
    prisma = createRawPrisma();
    tenant = await seedTenant(prisma, 'rewards-admin');
    other = await seedTenant(prisma, 'rewards-admin-other');
    owner = (await loginStaff(app, tenant)).accessToken;
    manager = await loginStaffAs(app, tenant, await createStaffMember(prisma, tenant, 'manager'));
    staff = await loginStaffAs(app, tenant, await createStaffMember(prisma, tenant, 'staff'));
    otherOwner = (await loginStaff(app, other)).accessToken;

    for (const t of [tenant, other]) {
      const category = await prisma.menuCategory.create({ data: { tenantId: t.id, name: 'Cat' } });
      const item = await prisma.menuItem.create({
        data: { tenantId: t.id, categoryId: category.id, name: 'Café', basePriceCents: 1500 },
      });
      if (t === tenant) itemId = item.id;
      else otherItemId = item.id;
    }

    const customer = await registerCustomer(app, tenant.slug, { email: 'ana.puntos@example.com' });
    customerId = customer.customer.id;
    customerToken = customer.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('solo el dueño: gerente, staff, cliente y otra marca no', async () => {
    const overview = (await as(owner).get('/api/staff/rewards').expect(200)).body as StaffRewards;
    expect(overview).toMatchObject({ currency: 'CLP', catalog: [] });
    expect(overview.program.isEnabled).toBe(true);

    await as(manager).get('/api/staff/rewards').expect(403);
    await as(staff).get('/api/staff/rewards').expect(403);
    await as(customerToken).get('/api/staff/rewards').expect(401);
    await as(otherOwner).get('/api/staff/rewards').expect(401);
    await as(manager).put('/api/staff/rewards/program', PROGRAM).expect(403);
    await as(manager)
      .post(`/api/staff/rewards/customers/${customerId}/adjustments`, { points: 5, reason: 'xxx' })
      .expect(403);
  });

  it('el programa se guarda y la app lo ve en GET /api/tenant', async () => {
    await as(owner)
      .put('/api/staff/rewards/program', { ...PROGRAM, pointsPerCurrencyUnit: 1.234 })
      .expect(400);
    await as(owner)
      .put('/api/staff/rewards/program', { ...PROGRAM, redemptionValueCents: -1 })
      .expect(400);
    const saved = (await as(owner).put('/api/staff/rewards/program', PROGRAM).expect(200))
      .body as StaffRewards;
    expect(saved.program).toEqual(PROGRAM);
    expect((await publicTenant()).rewardProgram).toEqual(PROGRAM);
    // La otra marca no cambia.
    expect((await publicTenant(other.slug)).rewardProgram.pointsPerCurrencyUnit).toBe(1);
  });

  let coffee: RewardCatalogItem;
  let discount: RewardCatalogItem;

  it('catálogo: producto propio o descuento; la app ve solo los activos', async () => {
    await as(owner)
      .post('/api/staff/rewards/catalog', {
        name: 'Café',
        pointsCost: 100,
        kind: 'item',
        menuItemId: otherItemId,
      })
      .expect(400);
    await as(owner)
      .post('/api/staff/rewards/catalog', { name: 'Sin monto', pointsCost: 100, kind: 'discount' })
      .expect(400);
    await as(owner)
      .post('/api/staff/rewards/catalog', {
        name: 'Cero',
        pointsCost: 0,
        kind: 'discount',
        discountCents: 1,
      })
      .expect(400);

    coffee = (
      await as(owner)
        .post('/api/staff/rewards/catalog', {
          name: 'Café gratis',
          pointsCost: 300,
          kind: 'item',
          menuItemId: itemId,
        })
        .expect(201)
    ).body as RewardCatalogItem;
    expect(coffee).toMatchObject({ kind: 'item', menuItemName: 'Café', isActive: true });
    discount = (
      await as(owner)
        .post('/api/staff/rewards/catalog', {
          name: '$1 de descuento',
          pointsCost: 40,
          kind: 'discount',
          discountCents: 100,
        })
        .expect(201)
    ).body as RewardCatalogItem;

    expect((await publicTenant()).rewards?.map((r) => r.name)).toEqual([
      'Café gratis',
      '$1 de descuento',
    ]);
    expect((await publicTenant(other.slug)).rewards).toEqual([]);

    // Desactivar la saca de la app; la otra marca no puede tocarla.
    await as(owner)
      .put(`/api/staff/rewards/catalog/${coffee.id}`, {
        name: 'Café gratis',
        pointsCost: 300,
        kind: 'item',
        menuItemId: itemId,
        isActive: false,
      })
      .expect(200);
    expect((await publicTenant()).rewards?.map((r) => r.name)).toEqual(['$1 de descuento']);
    await as(otherOwner, other.slug)
      .put(`/api/staff/rewards/catalog/${discount.id}`, {
        name: 'Robado',
        pointsCost: 1,
        kind: 'discount',
        discountCents: 1,
      })
      .expect(404);
    await as(otherOwner, other.slug)
      .delete(`/api/staff/rewards/catalog/${discount.id}`)
      .expect(404);

    // Programa apagado: la app no muestra recompensas.
    await as(owner)
      .put('/api/staff/rewards/program', { ...PROGRAM, isEnabled: false })
      .expect(200);
    expect((await publicTenant()).rewards).toEqual([]);
    await as(owner).put('/api/staff/rewards/program', PROGRAM).expect(200);
  });

  it('clientes con saldo, búsqueda y aislamiento', async () => {
    const page = (await as(owner).get('/api/staff/rewards/customers').expect(200))
      .body as RewardCustomersPage;
    expect(page).toMatchObject({ total: 1, page: 1 });
    expect(page.items[0]).toMatchObject({
      id: customerId,
      email: 'ana.puntos@example.com',
      balance: 50,
      lifetimeEarned: 50,
    });

    const byName = (await as(owner).get('/api/staff/rewards/customers?q=p%C3%A9rez').expect(200))
      .body as RewardCustomersPage;
    expect(byName.total).toBe(1);
    // `%` es literal, no comodín.
    const literal = (await as(owner).get('/api/staff/rewards/customers?q=%25').expect(200))
      .body as RewardCustomersPage;
    expect(literal.total).toBe(0);

    const otherPage = (
      await as(otherOwner, other.slug).get('/api/staff/rewards/customers').expect(200)
    ).body as RewardCustomersPage;
    expect(otherPage.total).toBe(0);
    await as(otherOwner, other.slug).get(`/api/staff/rewards/customers/${customerId}`).expect(404);
    await as(otherOwner, other.slug)
      .post(`/api/staff/rewards/customers/${customerId}/adjustments`, { points: 5, reason: 'Robo' })
      .expect(404);
  });

  it('ajuste manual auditado: autor y motivo en el panel, no en la app', async () => {
    const base = `/api/staff/rewards/customers/${customerId}/adjustments`;
    await as(owner).post(base, { points: 0, reason: 'Nada' }).expect(400);
    await as(owner).post(base, { points: 10, reason: 'x' }).expect(400);
    await as(owner).post(base, { points: -51, reason: 'Corrección' }).expect(400);

    const detail = (
      await as(owner).post(base, { points: 100, reason: 'Compensación por demora' }).expect(201)
    ).body as RewardCustomerDetail;
    expect(detail.customer.balance).toBe(150);
    expect(detail.entries[0]).toMatchObject({
      points: 100,
      reason: 'manual_adjustment',
      staffName: 'Dueño',
      staffNote: 'Compensación por demora',
    });

    const balance = (
      await request(app.getHttpServer())
        .get('/api/rewards/balance')
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200)
    ).body as RewardBalance;
    expect(balance.balance).toBe(150);
    const ledger = await request(app.getHttpServer())
      .get('/api/rewards/ledger')
      .set('X-Tenant-Slug', tenant.slug)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(JSON.stringify(ledger.body)).not.toContain('Compensación');
    expect(ledger.body[0]).not.toHaveProperty('staffNote');
  });

  it('canje en el local: descuenta el costo y deja el nombre de la recompensa', async () => {
    const base = `/api/staff/rewards/customers/${customerId}/redemptions`;
    // Inactiva → 404; de otra marca → 404.
    await as(owner).post(base, { rewardId: coffee.id }).expect(404);

    const detail = (await as(owner).post(base, { rewardId: discount.id }).expect(201))
      .body as RewardCustomerDetail;
    expect(detail.customer.balance).toBe(110);
    expect(detail.entries[0]).toMatchObject({
      points: -40,
      reason: 'redemption',
      rewardName: '$1 de descuento',
      staffName: 'Dueño',
    });

    await as(owner)
      .put(`/api/staff/rewards/catalog/${discount.id}`, {
        name: 'Caro',
        pointsCost: 1000,
        kind: 'discount',
        discountCents: 100,
      })
      .expect(200);
    await as(owner).post(base, { rewardId: discount.id }).expect(400);

    // Borrada: el asiento conserva el nombre con que se canjeó.
    await as(owner).delete(`/api/staff/rewards/catalog/${discount.id}`).expect(204);
    const after = (await as(owner).get(`/api/staff/rewards/customers/${customerId}`).expect(200))
      .body as RewardCustomerDetail;
    expect(after.entries.find((e) => e.reason === 'redemption')?.rewardName).toBe(
      '$1 de descuento',
    );
  });

  it('Idempotency-Key: un reintento de ajuste o canje no duplica el asiento (review)', async () => {
    const other = await registerCustomer(app, tenant.slug);
    const fresh = (await registerCustomer(app, tenant.slug)).customer.id;
    const post = (path: string, key: string, body: object) =>
      as(owner)
        .post(`/api/staff/rewards/customers/${fresh}/${path}`, body)
        .set('Idempotency-Key', key);

    const first = await post('adjustments', 'adjust-key-0001', { points: 10, reason: 'Reintento' });
    expect(first.status).toBe(201);
    const again = await post('adjustments', 'adjust-key-0001', { points: 10, reason: 'Reintento' });
    expect(again.status).toBe(200);
    expect((again.body as RewardCustomerDetail).customer.balance).toBe(60);
    expect(
      (again.body as RewardCustomerDetail).entries.filter((e) => e.reason === 'manual_adjustment'),
    ).toHaveLength(1);

    // Misma clave con otro movimiento u otro cliente: 409, nada se escribe.
    await post('adjustments', 'adjust-key-0001', { points: 11, reason: 'Reintento' }).expect(409);
    await as(owner)
      .post(`/api/staff/rewards/customers/${other.customer.id}/adjustments`, {
        points: 10,
        reason: 'Reintento',
      })
      .set('Idempotency-Key', 'adjust-key-0001')
      .expect(409);
    await post('adjustments', 'x', { points: 10, reason: 'Reintento' }).expect(400);

    const reward = (
      await as(owner)
        .post('/api/staff/rewards/catalog', {
          name: 'Postre',
          pointsCost: 20,
          kind: 'discount',
          discountCents: 50,
        })
        .expect(201)
    ).body as RewardCatalogItem;
    await post('redemptions', 'redeem-key-0001', { rewardId: reward.id }).expect(201);
    const replay = await post('redemptions', 'redeem-key-0001', { rewardId: reward.id }).expect(
      200,
    );
    expect((replay.body as RewardCustomerDetail).customer.balance).toBe(40);
    expect(
      (replay.body as RewardCustomerDetail).entries.filter((e) => e.reason === 'redemption'),
    ).toHaveLength(1);
  });

  it('el autor del asiento sobrevive al borrado del staff (review)', async () => {
    const email = await createStaffMember(prisma, tenant, 'owner');
    const token = await loginStaffAs(app, tenant, email);
    const customer = (await registerCustomer(app, tenant.slug)).customer.id;
    await as(token)
      .post(`/api/staff/rewards/customers/${customer}/adjustments`, { points: 5, reason: 'Regalo' })
      .expect(201);
    await prisma.staffMember.deleteMany({ where: { tenantId: tenant.id, email } });
    const detail = (await as(owner).get(`/api/staff/rewards/customers/${customer}`).expect(200))
      .body as RewardCustomerDetail;
    expect(detail.entries[0]).toMatchObject({ staffNote: 'Regalo', staffName: 'owner' });
  });
});
