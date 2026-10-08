import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { billingOverviewSchema, type PublicMenu } from '@ventea/shared';
import request from 'supertest';

import { addDays, GRACE_DAYS } from '@/modules/subscriptions/subscription-state';

import {
  createApp,
  createRawPrisma,
  importCarolinaMenu,
  loginStaff,
  registerCustomer,
  seedTenant,
  type TestTenant,
} from './helpers';

/**
 * Gracia de `past_due` (decisión de producto TASK-007): una marca cuyo período pagado venció
 * sin pago sigue atendiendo (menú y pedidos) hasta `currentPeriodEnd + GRACE_DAYS`; el panel
 * avisa con `graceEndsAt`. Solo `suspended`/`canceled` (y la gracia vencida, o una prueba
 * vencida sin pago) responden 402.
 */
describe('past_due en gracia sigue atendiendo (TASK-007)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenant: TestTenant;
  let customerToken: string;
  let ownerToken: string;
  let line: { menuItemId: string; quantity: number; selectedOptionIds: string[] };

  const http = () => request(app.getHttpServer());
  const menu = () => http().get('/api/menu').set('X-Tenant-Slug', tenant.slug);
  const order = () =>
    http()
      .post('/api/orders')
      .set('X-Tenant-Slug', tenant.slug)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ locationId: tenant.locationId, fulfillmentType: 'pickup', lines: [line] });
  const billing = () =>
    http()
      .get('/api/billing')
      .set('X-Tenant-Slug', tenant.slug)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .then((response) => billingOverviewSchema.parse(response.body));

  async function setSubscription(data: {
    status: 'past_due' | 'suspended' | 'active';
    trialEndsAt: Date | null;
    currentPeriodEnd: Date;
  }) {
    await prisma.subscription.update({ where: { tenantId: tenant.id }, data });
  }

  beforeAll(async () => {
    prisma = createRawPrisma();
    app = await createApp();
    tenant = await seedTenant(prisma, 'gracia');
    await importCarolinaMenu(prisma, tenant.slug);
    const published = (await menu().expect(200)).body as PublicMenu;
    const sandwich = published.categories
      .flatMap((c) => c.items)
      .find((i) => i.name === 'Reaper Tender Sandwich')!;
    const heat = sandwich.modifierGroups.find((g) => g.name === 'Heat level')!;
    line = {
      menuItemId: sandwich.id,
      quantity: 1,
      selectedOptionIds: [heat.options.find((o) => o.name === 'Hot')!.id],
    };
    customerToken = (await registerCustomer(app, tenant.slug)).accessToken;
    ownerToken = (await loginStaff(app, tenant)).accessToken;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('período pagado vencido hace 2 días: menú 200, pedido 201 y graceEndsAt en /api/billing', async () => {
    const due = addDays(new Date(), -2);
    await setSubscription({ status: 'past_due', trialEndsAt: null, currentPeriodEnd: due });

    await menu().expect(200);
    await order().expect(201);

    const overview = await billing();
    expect(overview.status).toBe('past_due');
    expect(overview.graceEndsAt).toEqual(addDays(due, GRACE_DAYS));
  });

  it('gracia vencida (el ciclo todavía no la suspendió): 402', async () => {
    const due = addDays(new Date(), -(GRACE_DAYS + 1));
    await setSubscription({ status: 'past_due', trialEndsAt: null, currentPeriodEnd: due });
    await menu().expect(402);
    await order().expect(402);
  });

  it('suspendida: 402 en menú y pedidos; /api/billing sigue abierto, sin gracia', async () => {
    await setSubscription({
      status: 'suspended',
      trialEndsAt: null,
      currentPeriodEnd: addDays(new Date(), -2),
    });
    await menu().expect(402);
    await order().expect(402);
    expect((await billing()).graceEndsAt).toBeNull();
  });

  it('prueba vencida sin pago (past_due desde trialing): 402, sin gracia', async () => {
    const end = addDays(new Date(), -1);
    await setSubscription({ status: 'past_due', trialEndsAt: end, currentPeriodEnd: end });
    await menu().expect(402);
    expect((await billing()).graceEndsAt).toBeNull();
  });

  it('activa: sin graceEndsAt', async () => {
    await setSubscription({
      status: 'active',
      trialEndsAt: null,
      currentPeriodEnd: addDays(new Date(), 20),
    });
    await menu().expect(200);
    expect((await billing()).graceEndsAt).toBeNull();
  });
});
