import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { billingOverviewSchema, platformTenantDetailSchema } from '@ventea/shared';
import request from 'supertest';

import { BillingCycleService } from '@/modules/billing/billing-cycle.service';
import { addDays, periodEnd } from '@/modules/subscriptions/subscription-state';

import {
  createApp,
  createRawPrisma,
  loginStaff,
  platformAdminToken,
  seedTenant,
  type TestTenant,
} from './helpers';

const MINUTE = 60_000;
const later = (date: Date, ms = MINUTE) => new Date(date.getTime() + ms);

/** `BILLING_MODE=manual` (el de env.cjs): sin pasarela, el ciclo solo vence estados (AC5). */
describe('Cobro en modo manual (TASK-005, AC5)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let cycle: BillingCycleService;
  let platformToken: string;
  const created: string[] = [];

  const http = () => request(app.getHttpServer());
  const asPlatform = (req: request.Test) => req.set('Authorization', `Bearer ${platformToken}`);

  beforeAll(async () => {
    prisma = createRawPrisma();
    app = await createApp();
    cycle = app.get(BillingCycleService);
    platformToken = await platformAdminToken(app, prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.subscription.updateMany({
      where: { tenantId: { in: created.splice(0) } },
      data: { status: 'canceled' },
    });
  });

  async function brand(
    base: string,
    status: 'trialing' | 'active',
    endsInDays: number,
  ): Promise<TestTenant> {
    const tenant = await seedTenant(prisma, base);
    created.push(tenant.id);
    const basic = await prisma.plan.findUniqueOrThrow({ where: { code: 'basic' } });
    const now = new Date();
    const end = addDays(now, endsInDays);
    await prisma.subscription.update({
      where: { tenantId: tenant.id },
      data: {
        planId: basic.id,
        interval: 'month',
        status,
        trialEndsAt: status === 'trialing' ? end : null,
        currentPeriodStart: now,
        currentPeriodEnd: end,
      },
    });
    return tenant;
  }

  const subscriptionOf = (tenant: TestTenant) =>
    prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const menu = (tenant: TestTenant) => http().get('/api/menu').set('X-Tenant-Slug', tenant.slug);

  it('prueba vencida → past_due → suspended tras 7 días de gracia; record-payment → active', async () => {
    const tenant = await brand('manual-prueba', 'trialing', 1);
    const { trialEndsAt } = await subscriptionOf(tenant);
    const due = trialEndsAt!;

    await cycle.run(later(due));
    expect((await subscriptionOf(tenant)).status).toBe('past_due');

    await cycle.run(addDays(due, 6));
    expect((await subscriptionOf(tenant)).status).toBe('past_due');

    await cycle.run(later(addDays(due, 7)));
    expect((await subscriptionOf(tenant)).status).toBe('suspended');
    await menu(tenant).expect(402);

    const start = Date.now();
    const response = await asPlatform(
      http().post(`/api/platform/tenants/${tenant.slug}/record-payment`),
    )
      .send({ amountCents: 2500, reference: 'TRF-0001' })
      .expect(200);
    const detail = platformTenantDetailSchema.parse(response.body);
    const subscription = detail.subscription!;
    expect(subscription.status).toBe('active');
    expect(subscription.currentPeriodStart.getTime()).toBeGreaterThanOrEqual(start - 1000);
    expect(subscription.currentPeriodEnd).toEqual(
      periodEnd(subscription.currentPeriodStart, 'month'),
    );
    expect(detail.billingEvents.map((e) => e.type)).toEqual(
      expect.arrayContaining(['trial_expired', 'suspended', 'payment_succeeded']),
    );
    expect(detail.billingEvents.find((e) => e.type === 'payment_succeeded')).toMatchObject({
      amountCents: 2500,
      status: 'succeeded',
    });
    await menu(tenant).expect(200);
  });

  it('período vencido sin pago → past_due (el ciclo no cobra)', async () => {
    const tenant = await brand('manual-vencida', 'active', 2);
    const { currentPeriodEnd } = await subscriptionOf(tenant);
    const summary = await cycle.run(later(currentPeriodEnd));
    expect(summary.charged).toEqual({ approved: 0, declined: 0, unknown: 0 });
    expect((await subscriptionOf(tenant)).status).toBe('past_due');
    const events = await prisma.billingEvent.findMany({
      where: { tenantId: tenant.id, type: 'past_due' },
    });
    expect(events).toHaveLength(1);
  });

  it('pago adelantado: con el período vigente, el nuevo empieza al terminar el actual', async () => {
    const tenant = await brand('manual-adelantado', 'active', 10);
    const before = await subscriptionOf(tenant);
    await asPlatform(http().post(`/api/platform/tenants/${tenant.slug}/record-payment`))
      .send({ amountCents: 2500, reference: 'TRF-0002' })
      .expect(200);
    const after = await subscriptionOf(tenant);
    expect(after.currentPeriodStart).toEqual(before.currentPeriodEnd);
    expect(after.currentPeriodEnd).toEqual(periodEnd(before.currentPeriodEnd, 'month'));
  });

  it('record-payment valida el body y la marca', async () => {
    const tenant = await brand('manual-validacion', 'active', 10);
    await asPlatform(http().post(`/api/platform/tenants/${tenant.slug}/record-payment`))
      .send({ amountCents: 0, reference: 'x' })
      .expect(400);
    await asPlatform(http().post('/api/platform/tenants/no-existe-xyz/record-payment'))
      .send({ amountCents: 100, reference: 'x' })
      .expect(404);
    await http()
      .post(`/api/platform/tenants/${tenant.slug}/record-payment`)
      .send({ amountCents: 100, reference: 'x' })
      .expect(401);
  });

  it('el dueño ve el modo manual y no puede cargar tarjeta (409)', async () => {
    const tenant = await brand('manual-dueno', 'trialing', 5);
    const { accessToken } = await loginStaff(app, tenant);
    const asOwner = (req: request.Test) =>
      req.set('X-Tenant-Slug', tenant.slug).set('Authorization', `Bearer ${accessToken}`);

    const overview = billingOverviewSchema.parse(
      (await asOwner(http().get('/api/billing')).expect(200)).body,
    );
    expect(overview).toMatchObject({
      mode: 'manual',
      status: 'trialing',
      planCode: 'basic',
      price: { amountCents: 2500, currency: 'USD' },
      card: null,
    });
    await asOwner(http().post('/api/billing/payment-method'))
      .send({
        card: {
          number: '4111111111111111',
          expiryMonth: '12',
          expiryYear: '2031',
          cvv: '123',
          holder: 'Ana Pérez',
        },
        billing: { country: 'HN' },
      })
      .expect(409);
  });
});
