import { Logger, type INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import {
  billingOverviewSchema,
  billingSummarySchema,
  platformTenantDetailSchema,
  type BillingInterval,
  type BillingOverview,
  type PlanCode,
  type SubscriptionStatus,
} from '@ventea/shared';
import request from 'supertest';

import { RedactingLogger } from '@/common/logging/redacting-logger';
import { BillingCycleService } from '@/modules/billing/billing-cycle.service';
import { renewalOrderId } from '@/modules/billing/billing-rules';
import { FakeGateway } from '@/modules/billing/gateway/fake.gateway';
import { addDays, periodEnd } from '@/modules/subscriptions/subscription-state';

import {
  createApp,
  createRawPrisma,
  createStaffMember,
  loginStaff,
  loginStaffAs,
  platformAdminToken,
  registerCustomer,
  seedTenant,
  type TestTenant,
} from './helpers';

const PAN = '4111111111111111';
const CVV = '7391';
const CARD_BODY = {
  card: {
    number: '4111 1111 1111 1111',
    expiryMonth: '12',
    expiryYear: '2031',
    cvv: CVV,
    holder: 'Ana Pérez',
  },
  billing: { country: 'HN', city: 'Tegucigalpa' },
};
const MINUTE = 60_000;
const later = (date: Date, ms = MINUTE) => new Date(date.getTime() + ms);

interface Brand {
  tenant: TestTenant;
  owner: string;
}

describe('Cobro recurrente con FakeGateway (TASK-005)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let cycle: BillingCycleService;
  let platformToken: string;
  const fake = new FakeGateway();
  const created: string[] = [];

  const http = () => request(app.getHttpServer());
  const asOwner = (req: request.Test, brand: Brand, token = brand.owner) =>
    req.set('X-Tenant-Slug', brand.tenant.slug).set('Authorization', `Bearer ${token}`);
  const asPlatform = (req: request.Test) => req.set('Authorization', `Bearer ${platformToken}`);

  beforeAll(async () => {
    prisma = createRawPrisma();
    app = await createApp({ gateway: fake });
    app.useLogger(new RedactingLogger()); // el mismo logger que main.ts
    cycle = app.get(BillingCycleService);
    platformToken = await platformAdminToken(app, prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(() => fake.reset());

  // Cada marca queda `canceled` al terminar su test: el ciclo recorre TODAS las marcas y
  // las de un test no pueden cobrarse en las corridas del siguiente.
  afterEach(async () => {
    await prisma.subscription.updateMany({
      where: { tenantId: { in: created.splice(0) } },
      data: { status: 'canceled' },
    });
  });

  /** Marca nueva con el dueño logueado. Por defecto: Pro mensual, en prueba 5 días más. */
  async function brand(
    base: string,
    options: {
      plan?: PlanCode;
      interval?: BillingInterval;
      status?: SubscriptionStatus;
      periodEndsInDays?: number;
    } = {},
  ): Promise<Brand> {
    const tenant = await seedTenant(prisma, base);
    created.push(tenant.id);
    const plan = await prisma.plan.findUniqueOrThrow({ where: { code: options.plan ?? 'pro' } });
    const now = new Date();
    const status = options.status ?? 'trialing';
    const end = addDays(now, options.periodEndsInDays ?? 5);
    await prisma.subscription.update({
      where: { tenantId: tenant.id },
      data: {
        planId: plan.id,
        interval: options.interval ?? 'month',
        status,
        trialEndsAt: status === 'trialing' ? end : null,
        currentPeriodStart: now,
        currentPeriodEnd: end,
      },
    });
    return { tenant, owner: (await loginStaff(app, tenant)).accessToken };
  }

  async function addCard(target: Brand): Promise<BillingOverview> {
    const response = await asOwner(http().post('/api/billing/payment-method'), target)
      .send(CARD_BODY)
      .expect(200);
    return billingOverviewSchema.parse(response.body);
  }

  const subscriptionOf = (target: Brand) =>
    prisma.subscription.findUniqueOrThrow({ where: { tenantId: target.tenant.id } });

  const eventsOf = (target: Brand, type: string) =>
    prisma.billingEvent.findMany({
      where: { tenantId: target.tenant.id, type: type as never },
      orderBy: { createdAt: 'asc' },
    });

  const recurringCharges = () => fake.charges.filter((c) => c.kind === 'recurring');

  /** Todo lo que la base guarda de la marca en tablas de cobro, sin ids (uuid/hex). */
  async function storedBillingData(tenantId: string): Promise<string> {
    const rows = await prisma.$queryRaw<{ j: string }[]>`
      SELECT row_to_json(s)::text AS j FROM subscriptions s WHERE s."tenantId" = ${tenantId}
      UNION ALL SELECT row_to_json(e)::text FROM billing_events e WHERE e."tenantId" = ${tenantId}
      UNION ALL SELECT row_to_json(a)::text FROM payment_attempts a WHERE a."tenantId" = ${tenantId}`;
    return rows
      .map((row) => row.j)
      .join('\n')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>')
      .replace(/[0-9a-f]{32}/g, '<hex>');
  }

  /** Captura lo que la app escribe en stdout/stderr (el ConsoleLogger de Nest) mientras corre `fn`. */
  async function captureOutput(fn: () => Promise<void>): Promise<string> {
    const chunks: string[] = [];
    const stdout = process.stdout.write.bind(process.stdout);
    const stderr = process.stderr.write.bind(process.stderr);
    const capture = ((chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    process.stdout.write = capture;
    process.stderr.write = capture;
    try {
      await fn();
    } finally {
      process.stdout.write = stdout;
      process.stderr.write = stderr;
    }
    return chunks.join('');
  }

  describe('alta de tarjeta (AC1, AC6)', () => {
    it('owner en prueba: establish aprobado → active desde el fin de la prueba, token guardado, sin PAN ni CVV en base ni logs', async () => {
      const target = await brand('alta-ok');
      const before = await subscriptionOf(target);

      let overview: BillingOverview | undefined;
      const output = await captureOutput(async () => {
        overview = await addCard(target);
        // Prueba de que el logger de la app redacta: aunque alguien logueara el body…
        new Logger('Prueba').error(`body ${JSON.stringify(CARD_BODY)}`);
      });

      expect(overview).toMatchObject({
        status: 'active',
        planCode: 'pro',
        card: { brand: 'visa', last4: '1111', expMonth: 12, expYear: 2031 },
      });
      const after = await subscriptionOf(target);
      // Período pagado desde el fin de la prueba: los días de prueba no se pierden.
      expect(after.currentPeriodStart).toEqual(before.trialEndsAt);
      expect(after.currentPeriodEnd).toEqual(periodEnd(before.trialEndsAt!, 'month'));
      expect(after).toMatchObject({
        paymentProvider: 'fake',
        paymentToken: 'fake-token-1111',
        cardBrand: 'visa',
        cardLast4: '1111',
      });
      expect(after.networkTransactionId).toMatch(/^fake-ntid-/);

      expect(fake.charges).toEqual([
        expect.objectContaining({
          kind: 'establish',
          amount: { amountCents: 5900, currency: 'USD' },
          outcome: 'approved',
        }),
      ]);
      const [paid] = await eventsOf(target, 'payment_succeeded');
      expect(paid).toMatchObject({ amountCents: 5900, status: 'succeeded' });
      expect(paid!.orderId).toMatch(/^est-/);

      const stored = await storedBillingData(target.tenant.id);
      expect(stored).not.toContain(PAN);
      expect(stored).not.toContain(CVV);
      expect(stored).not.toMatch(/cvv/i);

      expect(output).toContain('[REDACTED]');
      expect(output).not.toContain(PAN);
      expect(output).not.toContain('4111 1111 1111 1111');
      expect(output).not.toContain(CVV);
    });

    it('rechazada → 402 con el motivo, la suscripción no cambia y queda payment_failed', async () => {
      const target = await brand('alta-rechazo', { status: 'active', periodEndsInDays: 10 });
      const before = await subscriptionOf(target);
      fake.next('decline');

      const response = await asOwner(http().post('/api/billing/payment-method'), target)
        .send(CARD_BODY)
        .expect(402);
      expect(response.body.message).toMatch(/rechazada/);
      expect(JSON.stringify(response.body)).not.toContain(PAN);

      const after = await subscriptionOf(target);
      expect(after).toEqual({ ...before, updatedAt: after.updatedAt });
      expect(after.paymentToken).toBeNull();
      expect(await eventsOf(target, 'payment_failed')).toHaveLength(1);
      expect(await eventsOf(target, 'payment_succeeded')).toHaveLength(0);
    });

    it('pasarela caída → 503 y 400 de la pasarela → 400, sin dejar intento abierto', async () => {
      const target = await brand('alta-caida');
      fake.next('invalid');
      await asOwner(http().post('/api/billing/payment-method'), target).send(CARD_BODY).expect(400);
      fake.next('unavailable');
      await asOwner(http().post('/api/billing/payment-method'), target).send(CARD_BODY).expect(503);

      const open = await prisma.paymentAttempt.count({
        where: { tenantId: target.tenant.id, status: { in: ['pending', 'unknown'] } },
      });
      expect(open).toBe(0);
      expect((await subscriptionOf(target)).status).toBe('trialing');
    });

    it('solo el owner: manager y staff 403, cliente 401', async () => {
      const target = await brand('alta-roles');
      const manager = await loginStaffAs(
        app,
        target.tenant,
        await createStaffMember(prisma, target.tenant, 'manager'),
      );
      const staff = await loginStaffAs(
        app,
        target.tenant,
        await createStaffMember(prisma, target.tenant, 'staff'),
      );
      const customer = await registerCustomer(app, target.tenant.slug);

      for (const token of [manager, staff]) {
        await asOwner(http().get('/api/billing'), target, token).expect(403);
        await asOwner(http().post('/api/billing/payment-method'), target, token)
          .send(CARD_BODY)
          .expect(403);
        await asOwner(http().post('/api/billing/cancel'), target, token).expect(403);
      }
      await asOwner(http().get('/api/billing'), target, customer.accessToken).expect(401);
      await asOwner(http().get('/api/billing'), target).expect(200);
      expect(fake.charges).toHaveLength(0);
    });

    it('número inválido (Luhn) → 400 sin devolver el número', async () => {
      const target = await brand('alta-luhn');
      const response = await asOwner(http().post('/api/billing/payment-method'), target)
        .send({ ...CARD_BODY, card: { ...CARD_BODY.card, number: '4111111111111112' } })
        .expect(400);
      expect(JSON.stringify(response.body)).not.toContain('4111111111111112');
      expect(fake.charges).toHaveLength(0);
    });

    it('5 intentos por marca y hora; el 6.º → 429', async () => {
      const target = await brand('alta-limite');
      for (let i = 0; i < 5; i++) {
        await asOwner(http().post('/api/billing/payment-method'), target).send({}).expect(400);
      }
      await asOwner(http().post('/api/billing/payment-method'), target).send(CARD_BODY).expect(429);
      expect(fake.charges).toHaveLength(0);
    });

    it('marca suspendida: /api/billing abierto (el resto 402) y pagar la reactiva desde hoy', async () => {
      const target = await brand('alta-suspendida', { status: 'suspended', periodEndsInDays: -20 });
      await http().get('/api/menu').set('X-Tenant-Slug', target.tenant.slug).expect(402);
      const overview = billingOverviewSchema.parse(
        (await asOwner(http().get('/api/billing'), target).expect(200)).body,
      );
      expect(overview.status).toBe('suspended');

      const start = Date.now();
      const paid = await addCard(target);
      expect(paid.status).toBe('active');
      expect(paid.currentPeriodStart.getTime()).toBeGreaterThanOrEqual(start - 1000);
      await http().get('/api/menu').set('X-Tenant-Slug', target.tenant.slug).expect(200);
    });

    it('respuesta perdida → 504; reintentar → 409; el admin lo confirma → active', async () => {
      const target = await brand('alta-perdida');
      fake.next({ timeout: 'approved' });
      const lost = await asOwner(http().post('/api/billing/payment-method'), target)
        .send(CARD_BODY)
        .expect(504);
      expect(lost.body.message).toMatch(/No lo intentes de nuevo/);
      await asOwner(http().post('/api/billing/payment-method'), target).send(CARD_BODY).expect(409);
      expect(fake.approvedCharges()).toHaveLength(1);

      const attempt = await prisma.paymentAttempt.findFirstOrThrow({
        where: { tenantId: target.tenant.id, status: 'unknown' },
      });
      const detail = await asPlatform(
        http().post(`/api/platform/tenants/${target.tenant.slug}/resolve-payment`),
      )
        .send({ orderId: attempt.orderId, outcome: 'succeeded', note: 'visto en CyberSource' })
        .expect(200);
      expect(platformTenantDetailSchema.parse(detail.body).subscription?.status).toBe('active');
      expect(await eventsOf(target, 'payment_succeeded')).toHaveLength(1);
      await asPlatform(http().post(`/api/platform/tenants/${target.tenant.slug}/resolve-payment`))
        .send({ orderId: attempt.orderId, outcome: 'succeeded' })
        .expect(404);
    });
  });

  describe('ciclo de renovación (AC2, AC3, AC4)', () => {
    it('renovación aprobada avanza el período; cada cobro se ancla al networkTransactionId del establish', async () => {
      const target = await brand('ciclo-ok');
      await addCard(target);
      const established = await subscriptionOf(target);
      const due = established.currentPeriodEnd;

      const summary = await cycle.run(later(due));
      expect(summary.charged.approved).toBe(1);
      const first = await subscriptionOf(target);
      expect(first.status).toBe('active');
      expect(first.currentPeriodStart).toEqual(due);
      expect(first.currentPeriodEnd).toEqual(periodEnd(due, 'month'));

      await cycle.run(later(first.currentPeriodEnd));
      const second = await subscriptionOf(target);
      expect(second.currentPeriodStart).toEqual(first.currentPeriodEnd);

      expect(recurringCharges()).toEqual([
        expect.objectContaining({
          initialTransactionId: established.networkTransactionId,
          amount: { amountCents: 5900, currency: 'USD' },
          orderId: renewalOrderId(established.id, due, 1),
        }),
        expect.objectContaining({ initialTransactionId: established.networkTransactionId }),
      ]);
      expect(await eventsOf(target, 'payment_succeeded')).toHaveLength(3);
    });

    it('rechazos: past_due → reintentos a los días 1, 3 y 7 → suspended', async () => {
      const target = await brand('ciclo-dunning');
      await addCard(target);
      const { currentPeriodEnd: due, id } = await subscriptionOf(target);
      fake.next('decline', 'decline', 'decline', 'decline');

      await cycle.run(later(due));
      let sub = await subscriptionOf(target);
      expect(sub).toMatchObject({ status: 'past_due', retryAt: addDays(due, 1) });
      await http().get('/api/menu').set('X-Tenant-Slug', target.tenant.slug).expect(402);
      await asOwner(http().get('/api/billing'), target).expect(200);

      await cycle.run(later(due, 2 * 60 * MINUTE)); // antes del reintento: no cobra
      expect(recurringCharges()).toHaveLength(1);

      await cycle.run(later(addDays(due, 1)));
      sub = await subscriptionOf(target);
      expect(sub).toMatchObject({ status: 'past_due', retryAt: addDays(due, 3) });

      await cycle.run(later(addDays(due, 3)));
      sub = await subscriptionOf(target);
      expect(sub).toMatchObject({ status: 'past_due', retryAt: addDays(due, 7) });

      await cycle.run(later(addDays(due, 7)));
      sub = await subscriptionOf(target);
      expect(sub).toMatchObject({ status: 'suspended', retryAt: null, currentPeriodEnd: due });

      await cycle.run(addDays(due, 8));
      expect(recurringCharges().map((c) => c.orderId)).toEqual([
        renewalOrderId(id, due, 1),
        renewalOrderId(id, due, 2),
        renewalOrderId(id, due, 3),
        renewalOrderId(id, due, 4),
      ]);
      expect(await eventsOf(target, 'payment_failed')).toHaveLength(4);
      expect(await eventsOf(target, 'suspended')).toHaveLength(1);
    });

    it('timeout con estado final aprobado → se concilia vía status: un solo cobro y un solo payment_succeeded', async () => {
      const target = await brand('ciclo-timeout');
      await addCard(target);
      const { currentPeriodEnd: due, id } = await subscriptionOf(target);
      fake.next({ timeout: 'approved' });

      const first = await cycle.run(later(due));
      expect(first.charged.unknown).toBe(1);
      let sub = await subscriptionOf(target);
      expect(sub).toMatchObject({ status: 'active', currentPeriodEnd: due }); // no se castiga
      expect(await eventsOf(target, 'payment_unknown')).toHaveLength(1);

      const second = await cycle.run(later(due, 2 * MINUTE));
      expect(second.reconciled).toBe(1);
      await cycle.run(later(due, 3 * MINUTE));

      sub = await subscriptionOf(target);
      expect(sub.currentPeriodStart).toEqual(due);
      expect(recurringCharges()).toHaveLength(1);
      expect(fake.statusQueries).toBeGreaterThanOrEqual(1);
      const renewals = await prisma.billingEvent.findMany({
        where: { tenantId: target.tenant.id, orderId: renewalOrderId(id, due, 1) },
      });
      expect(renewals).toEqual([expect.objectContaining({ type: 'payment_succeeded' })]);
    });

    it('timeout sin transactionId → no se recobra nunca; queda para el admin', async () => {
      const target = await brand('ciclo-sin-id');
      await addCard(target);
      const { currentPeriodEnd: due, id } = await subscriptionOf(target);
      fake.next({ timeout: 'approved', withTransactionId: false });

      await cycle.run(later(due));
      await cycle.run(later(due, 30 * MINUTE));
      await cycle.run(later(addDays(due, 2)));
      expect(recurringCharges()).toHaveLength(1);
      expect((await subscriptionOf(target)).status).toBe('active');

      const summary = billingSummarySchema.parse(
        (await asPlatform(http().get('/api/platform/billing/summary')).expect(200)).body,
      );
      expect(summary.unresolvedPayments).toBeGreaterThanOrEqual(1);

      await asPlatform(http().post(`/api/platform/tenants/${target.tenant.slug}/resolve-payment`))
        .send({ orderId: renewalOrderId(id, due, 1), outcome: 'succeeded' })
        .expect(200);
      expect((await subscriptionOf(target)).currentPeriodStart).toEqual(due);
    });

    it('dos corridas concurrentes del ciclo cobran una sola vez (lock)', async () => {
      const target = await brand('ciclo-concurrente');
      await addCard(target);
      const { currentPeriodEnd: due } = await subscriptionOf(target);
      fake.delayMs = 300;

      const runs = await Promise.all([cycle.run(later(due)), cycle.run(later(due))]);
      expect(runs.filter((r) => r.skipped)).toHaveLength(1);
      expect(recurringCharges()).toHaveLength(1);
      expect(await eventsOf(target, 'payment_succeeded')).toHaveLength(2); // alta + renovación
    });

    it('change-plan: bajar con sucursales de más → 409; el agendado se cobra y aplica en la renovación', async () => {
      const target = await brand('ciclo-plan');
      await prisma.location.create({
        data: {
          tenantId: target.tenant.id,
          name: 'Segunda',
          address: 'Calle 2',
          latitude: 0,
          longitude: 0,
        },
      });
      await addCard(target);

      await asOwner(http().post('/api/billing/change-plan'), target)
        .send({ planCode: 'basic', interval: 'month' })
        .expect(409);
      const scheduled = billingOverviewSchema.parse(
        (
          await asOwner(http().post('/api/billing/change-plan'), target)
            .send({ planCode: 'chain', interval: 'year' })
            .expect(200)
        ).body,
      );
      expect(scheduled).toMatchObject({
        planCode: 'pro',
        interval: 'month',
        pendingPlan: {
          planCode: 'chain',
          interval: 'year',
          price: { amountCents: 129000, currency: 'USD' },
        },
      });

      const { currentPeriodEnd: due } = await subscriptionOf(target);
      await cycle.run(later(due));
      expect(recurringCharges()).toEqual([
        expect.objectContaining({ amount: { amountCents: 129000, currency: 'USD' } }),
      ]);
      const renewed = billingOverviewSchema.parse(
        (await asOwner(http().get('/api/billing'), target).expect(200)).body,
      );
      expect(renewed).toMatchObject({ planCode: 'chain', interval: 'year', pendingPlan: null });
      expect(renewed.currentPeriodEnd).toEqual(periodEnd(due, 'year'));
      expect(await eventsOf(target, 'plan_changed')).toHaveLength(1);
    });

    it('cancelar al fin del período → canceled sin cobrar; reanudar lo anula', async () => {
      const target = await brand('ciclo-cancel');
      await addCard(target);
      const cancel = () => asOwner(http().post('/api/billing/cancel'), target).expect(200);

      expect((await cancel()).body.cancelAtPeriodEnd).toBe(true);
      const resumed = await asOwner(http().post('/api/billing/resume'), target).expect(200);
      expect(resumed.body.cancelAtPeriodEnd).toBe(false);
      await cancel();

      const { currentPeriodEnd: due } = await subscriptionOf(target);
      await cycle.run(later(due));
      expect((await subscriptionOf(target)).status).toBe('canceled');
      expect(recurringCharges()).toHaveLength(0);
      expect(await eventsOf(target, 'cancel_scheduled')).toHaveLength(2);
      expect(await eventsOf(target, 'cancel_resumed')).toHaveLength(1);
      await asOwner(http().post('/api/billing/resume'), target).expect(409);
    });
  });

  describe('review TASK-005: bloqueantes de dinero', () => {
    it('R1 · alta sin confirmar sobre el período siguiente → la renovación NO cobra ese período', async () => {
      const target = await brand('r1-doble');
      await addCard(target);
      const paidThrough = (await subscriptionOf(target)).currentPeriodEnd;

      // Cambio de tarjeta con período vigente: cobra [paidThrough, +1 mes]; se pierde la respuesta.
      fake.next({ timeout: 'approved', withTransactionId: false });
      await asOwner(http().post('/api/billing/payment-method'), target).send(CARD_BODY).expect(504);

      await cycle.run(later(paidThrough));
      expect(recurringCharges()).toHaveLength(0); // un intento abierto bloquea todo cobro nuevo

      const attempt = await prisma.paymentAttempt.findFirstOrThrow({
        where: { tenantId: target.tenant.id, status: 'unknown' },
      });
      await asPlatform(http().post(`/api/platform/tenants/${target.tenant.slug}/resolve-payment`))
        .send({ orderId: attempt.orderId, outcome: 'succeeded' })
        .expect(200);
      const sub = await subscriptionOf(target);
      expect(sub.currentPeriodStart).toEqual(paidThrough);
      expect(sub.currentPeriodEnd).toEqual(periodEnd(paidThrough, 'month'));
    });

    it('R1 · confirmar un cobro cuyo período ya quedó cubierto → alerta de posible doble pago, sin mover el período', async () => {
      const target = await brand('r1-alerta');
      await addCard(target);
      fake.next({ timeout: 'approved', withTransactionId: false });
      await asOwner(http().post('/api/billing/payment-method'), target).send(CARD_BODY).expect(504);
      // Algo cubrió ese período mientras tanto (dato corrido a mano).
      const covered = addDays(new Date(), 400);
      await prisma.subscription.update({
        where: { tenantId: target.tenant.id },
        data: { currentPeriodEnd: covered },
      });
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({
        where: { tenantId: target.tenant.id, status: 'unknown' },
      });
      await asPlatform(http().post(`/api/platform/tenants/${target.tenant.slug}/resolve-payment`))
        .send({ orderId: attempt.orderId, outcome: 'succeeded' })
        .expect(200);

      expect((await subscriptionOf(target)).currentPeriodEnd).toEqual(covered);
      expect(await eventsOf(target, 'billing_alert')).toHaveLength(1);
      const summary = billingSummarySchema.parse(
        (await asPlatform(http().get('/api/platform/billing/summary')).expect(200)).body,
      );
      expect(summary.alertsLast7Days).toBeGreaterThanOrEqual(1);
    });

    it('R2 · se aplica lo que se cobró: plan e intervalo congelados en el intento; change-plan 409 con cobro abierto', async () => {
      const target = await brand('r2-plan');
      await addCard(target);
      const { currentPeriodEnd: due } = await subscriptionOf(target);
      fake.next({ timeout: 'approved' });
      await cycle.run(later(due));

      await asOwner(http().post('/api/billing/change-plan'), target)
        .send({ planCode: 'pro', interval: 'year' })
        .expect(409);
      // Aunque el agendado cambiara en el medio (dato corrido a mano), manda el intento.
      const chain = await prisma.plan.findUniqueOrThrow({ where: { code: 'chain' } });
      await prisma.subscription.update({
        where: { tenantId: target.tenant.id },
        data: { pendingPlanId: chain.id, pendingInterval: 'year' },
      });

      await cycle.run(later(due, 2 * MINUTE));
      const sub = await subscriptionOf(target);
      expect(sub).toMatchObject({ interval: 'month', currentPeriodStart: due });
      expect(sub.currentPeriodEnd).toEqual(periodEnd(due, 'month'));
      expect(sub.pendingPlanId).toBe(chain.id); // el agendado sigue para el próximo período
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({
        where: { tenantId: target.tenant.id, kind: 'renewal' },
      });
      expect(attempt).toMatchObject({
        interval: 'month',
        amountCents: 5900,
        periodStart: due,
        periodEnd: periodEnd(due, 'month'),
      });
    });

    it('R3 · confirmar una renovación no pisa la cancelación del dueño; cancel/resume/record-payment 409 con cobro abierto', async () => {
      const target = await brand('r3-cancel');
      await addCard(target);
      const { currentPeriodEnd: due } = await subscriptionOf(target);
      fake.next({ timeout: 'approved' });
      await cycle.run(later(due));

      await asOwner(http().post('/api/billing/cancel'), target).expect(409);
      await asOwner(http().post('/api/billing/resume'), target).expect(409);
      await asPlatform(http().post(`/api/platform/tenants/${target.tenant.slug}/record-payment`))
        .send({ amountCents: 5900, reference: 'TRF-R3' })
        .expect(409);

      await prisma.subscription.update({
        where: { tenantId: target.tenant.id },
        data: { cancelAtPeriodEnd: true }, // el dueño canceló justo antes
      });
      await cycle.run(later(due, 2 * MINUTE)); // concilia: aprobado
      const sub = await subscriptionOf(target);
      expect(sub).toMatchObject({ status: 'active', cancelAtPeriodEnd: true });

      await cycle.run(later(sub.currentPeriodEnd));
      expect((await subscriptionOf(target)).status).toBe('canceled');
      expect(recurringCharges()).toHaveLength(1);
    });
  });

  describe('review TASK-005: importantes', () => {
    it('monto aprobado distinto del pedido → no se da por pagado, alerta', async () => {
      const target = await brand('rv-monto');
      await addCard(target);
      const { currentPeriodEnd: due } = await subscriptionOf(target);
      fake.next({ approveAmountCents: 100 });
      const summary = await cycle.run(later(due));
      expect(summary.charged.unknown).toBe(1);
      expect((await subscriptionOf(target)).currentPeriodEnd).toEqual(due);
      expect(await eventsOf(target, 'billing_alert')).toHaveLength(1);

      // Re-review: la conciliación siguiente (status sin monto) NO lo da por pagado ni repite
      // la alerta; queda para resolve-payment.
      await cycle.run(later(due, 16 * MINUTE));
      await cycle.run(later(due, 31 * MINUTE));
      expect((await subscriptionOf(target)).currentPeriodEnd).toEqual(due);
      expect(await eventsOf(target, 'payment_succeeded')).toHaveLength(1); // solo el alta
      expect(await eventsOf(target, 'billing_alert')).toHaveLength(1);
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({
        where: { tenantId: target.tenant.id, kind: 'renewal' },
      });
      expect(attempt.status).toBe('needs_review');
      expect(recurringCharges()).toHaveLength(1);
    });

    it('400 de la pasarela → intento failed_non_bank visible, sin dunning ni ráfaga', async () => {
      const target = await brand('rv-invalid');
      await addCard(target);
      const { currentPeriodEnd: due } = await subscriptionOf(target);
      fake.next('invalid');
      await cycle.run(later(due));
      await cycle.run(later(due, 30 * MINUTE));

      const attempts = await prisma.paymentAttempt.findMany({
        where: { tenantId: target.tenant.id, kind: 'renewal' },
      });
      expect(attempts).toEqual([expect.objectContaining({ status: 'failed_non_bank' })]);
      const sub = await subscriptionOf(target);
      expect(sub.status).toBe('active');
      expect(sub.retryAt!.getTime()).toBeGreaterThan(later(due, 30 * MINUTE).getTime());
      const summary = billingSummarySchema.parse(
        (await asPlatform(http().get('/api/platform/billing/summary')).expect(200)).body,
      );
      expect(summary.unresolvedPayments).toBeGreaterThanOrEqual(1);
    });

    it('circuit breaker: 3 cobros desconocidos seguidos cortan las renovaciones de la corrida', async () => {
      const targets: Brand[] = [];
      for (let i = 0; i < 4; i++) {
        const target = await brand(`rv-breaker-${i}`);
        await addCard(target);
        targets.push(target);
      }
      const due = (await subscriptionOf(targets[0]!)).currentPeriodEnd;
      for (const target of targets) {
        await prisma.subscription.update({
          where: { tenantId: target.tenant.id },
          data: { currentPeriodEnd: due },
        });
      }
      const unknown = { timeout: 'declined', withTransactionId: false } as const;
      fake.next(unknown, unknown, unknown, 'approve');
      const summary = await cycle.run(later(due));
      expect(summary.charged.unknown).toBe(3);
      expect(recurringCharges()).toHaveLength(3);
    });

    it('3 rechazos seguidos de la marca → alta de tarjeta bloqueada 24 h y alerta', async () => {
      const target = await brand('rv-cardtesting');
      fake.next('decline', 'decline', 'decline');
      for (let i = 0; i < 3; i++) {
        await asOwner(http().post('/api/billing/payment-method'), target)
          .send(CARD_BODY)
          .expect(402);
      }
      const blocked = await asOwner(http().post('/api/billing/payment-method'), target)
        .send(CARD_BODY)
        .expect(429);
      expect(blocked.body.message).toMatch(/24 h/);
      expect(fake.charges).toHaveLength(3);
      expect(await eventsOf(target, 'billing_alert')).toHaveLength(1);
    });

    it('alta sin confirmar en prueba → no se vence ni se suspende mientras se resuelve', async () => {
      const target = await brand('rv-no-suspender');
      fake.next({ timeout: 'approved', withTransactionId: false });
      await asOwner(http().post('/api/billing/payment-method'), target).send(CARD_BODY).expect(504);
      const { trialEndsAt } = await subscriptionOf(target);
      await cycle.run(addDays(trialEndsAt!, 9));
      expect((await subscriptionOf(target)).status).toBe('trialing');
    });

    it('límite por IP en el alta de tarjeta (card-testing entre marcas)', async () => {
      const previous = process.env.BILLING_IP_RATE_LIMIT_PER_DAY;
      process.env.BILLING_IP_RATE_LIMIT_PER_DAY = '1';
      try {
        const target = await brand('rv-ip');
        const response = await asOwner(http().post('/api/billing/payment-method'), target)
          .send(CARD_BODY)
          .expect(429);
        expect(response.body.message).toMatch(/conexión/);
      } finally {
        process.env.BILLING_IP_RATE_LIMIT_PER_DAY = previous;
      }
    });
  });

  describe('re-review TASK-005', () => {
    it('3 failed_non_bank seguidos del mismo período → past_due + alerta (entra al dunning)', async () => {
      const target = await brand('rr-invalid3');
      await addCard(target);
      const { currentPeriodEnd: due } = await subscriptionOf(target);
      fake.next('invalid', 'invalid', 'invalid');
      await cycle.run(later(due));
      await cycle.run(later(due, 25 * 60 * MINUTE));
      expect((await subscriptionOf(target)).status).toBe('active');
      await cycle.run(later(due, 50 * 60 * MINUTE));

      const sub = await subscriptionOf(target);
      expect(sub.status).toBe('past_due');
      expect(sub.retryAt).not.toBeNull();
      expect(await eventsOf(target, 'billing_alert')).toHaveLength(1);
      await http().get('/api/menu').set('X-Tenant-Slug', target.tenant.slug).expect(402);
    });

    it('prueba vencida con un alta sin confirmar → el tráfico NO la vence (menú 200)', async () => {
      const target = await brand('rr-trial-open');
      fake.next({ timeout: 'approved', withTransactionId: false });
      await asOwner(http().post('/api/billing/payment-method'), target).send(CARD_BODY).expect(504);
      const past = addDays(new Date(), -1);
      await prisma.subscription.update({
        where: { tenantId: target.tenant.id },
        data: { trialEndsAt: past, currentPeriodEnd: past },
      });

      await http().get('/api/menu').set('X-Tenant-Slug', target.tenant.slug).expect(200);
      await asOwner(http().get('/api/billing'), target).expect(200);
      expect((await subscriptionOf(target)).status).toBe('trialing');
      expect(await eventsOf(target, 'trial_expired')).toHaveLength(0);
    });

    it('suspensión del admin gana: la conciliación aprobada no la deshace; reactivate 409 con cobro abierto', async () => {
      const target = await brand('rr-suspend');
      await addCard(target);
      const { currentPeriodEnd: due } = await subscriptionOf(target);
      fake.next({ timeout: 'approved' });
      await cycle.run(later(due));

      await asPlatform(http().post(`/api/platform/tenants/${target.tenant.slug}/suspend`))
        .send({ reason: 'fraude' })
        .expect(200);
      await asPlatform(
        http().post(`/api/platform/tenants/${target.tenant.slug}/reactivate`),
      ).expect(409);

      await cycle.run(later(due, 2 * MINUTE)); // concilia: aprobado
      const sub = await subscriptionOf(target);
      expect(sub.status).toBe('suspended');
      expect(sub.currentPeriodStart).toEqual(due); // el pago se aplica al período
      expect(await eventsOf(target, 'billing_alert')).toHaveLength(1);
      await asPlatform(
        http().post(`/api/platform/tenants/${target.tenant.slug}/reactivate`),
      ).expect(200);
    });
  });

  describe('plataforma', () => {
    it('detalle con tarjeta (marca y últimos 4) y eventos; resumen con MRR', async () => {
      const target = await brand('plataforma-cobro');
      await addCard(target);

      const detail = platformTenantDetailSchema.parse(
        (await asPlatform(http().get(`/api/platform/tenants/${target.tenant.slug}`)).expect(200))
          .body,
      );
      expect(detail.card).toEqual({ brand: 'visa', last4: '1111' });
      expect(detail.billingEvents.map((e) => e.type)).toEqual(
        expect.arrayContaining(['payment_succeeded', 'payment_method_updated']),
      );
      expect(JSON.stringify(detail)).not.toContain('fake-token');

      const summary = billingSummarySchema.parse(
        (await asPlatform(http().get('/api/platform/billing/summary')).expect(200)).body,
      );
      expect(summary.currency).toBe('USD');
      expect(summary.mrrCents).toBeGreaterThanOrEqual(5900);
      expect(summary.byStatus.active).toBeGreaterThanOrEqual(1);
      await http().get('/api/platform/billing/summary').expect(401);
    });
  });
});
