import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { TERMS_VERSION, type PlatformEmail, type PlatformEmailList } from '@ventea/shared';
import request from 'supertest';

import { FakeMailTransport } from '@/modules/mail/fake.transport';
import { MAX_ATTEMPTS, MailService } from '@/modules/mail/mail.service';
import { LifecycleMailer } from '@/modules/notifications/lifecycle-mailer.service';

import {
  createApp,
  createRawPrisma,
  loginStaff,
  platformAdminToken,
  seedTenant,
  type TestTenant,
} from './helpers';

const DAY = 24 * 60 * 60 * 1000;
const HOSTILE = '<b>Pollos</b> & "Ana"';
const ALERTS = ['ops@ventea.tech', 'alertas@ventea.tech'];

describe('Correos transaccionales (TASK-021)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let mail: MailService;
  let mailer: LifecycleMailer;
  let platform: string;
  const fake = new FakeMailTransport();

  const outbox = (tenantId: string, kind?: string) =>
    prisma.emailMessage.findMany({
      where: { tenantId, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  const sentTo = (tenantName: string) =>
    fake.sent.filter((m) => m.text.includes(tenantName) || m.subject.includes(tenantName));

  beforeAll(async () => {
    process.env.PLATFORM_ALERT_EMAILS = ALERTS.join(', ');
    process.env.SIGNUP_RATE_LIMIT_PER_HOUR = '100';
    process.env.SIGNUP_DAILY_LIMIT = '1000';
    process.env.SIGNUP_WEEKLY_LIMIT = '1000';
    app = await createApp({ mail: fake });
    mail = app.get(MailService);
    mailer = app.get(LifecycleMailer);
    prisma = createRawPrisma();
    platform = await platformAdminToken(app, prisma);
  });

  afterAll(async () => {
    delete process.env.PLATFORM_ALERT_EMAILS;
    delete process.env.SIGNUP_RATE_LIMIT_PER_HOUR;
    delete process.env.SIGNUP_DAILY_LIMIT;
    delete process.env.SIGNUP_WEEKLY_LIMIT;
    await mail.drain();
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(() => fake.reset());

  describe('solicitud de app → plataforma', () => {
    let tenant: TestTenant;
    let owner: string;

    beforeAll(async () => {
      tenant = await seedTenant(prisma, 'mail-app');
      await prisma.tenant.update({ where: { id: tenant.id }, data: { name: HOSTILE } });
      owner = (await loginStaff(app, tenant)).accessToken;
    });

    const requestApp = () =>
      request(app.getHttpServer())
        .post('/api/staff/brand/app-request')
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${owner}`);

    it('un correo por destinatario de PLATFORM_ALERT_EMAILS, con escape y links de la cola', async () => {
      await requestApp().expect(201);
      await mail.drain();

      expect(fake.sent.map((m) => m.to).sort()).toEqual([...ALERTS].sort());
      const [first] = fake.sent;
      expect(first?.subject).toBe(`Solicitud de app: ${HOSTILE} (${tenant.slug})`);
      expect(first?.subject).not.toMatch(/[\r\n]/);
      expect(first?.html).not.toContain('<b>Pollos</b>');
      expect(first?.html).toContain('&lt;b&gt;Pollos&lt;/b&gt; &amp; &quot;Ana&quot;');
      expect(first?.text).toContain('plan Cadena');
      expect(first?.html).toContain('https://app.ventea.tech/admin/plataforma/apps');
      expect(first?.from).toEqual({ name: 'Ventea', address: 'hola@ventea.tech' });

      const rows = await outbox(tenant.id, 'app_request');
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.status === 'sent' && row.attempts === 1)).toBe(true);
    });

    it('idempotente: repetir el evento no manda un segundo correo', async () => {
      await requestApp().expect(409);
      mailer.appRequested(tenant.id);
      await mail.drain();
      expect(fake.sent).toHaveLength(0);
      expect(await outbox(tenant.id, 'app_request')).toHaveLength(2);
    });
  });

  describe('alta de marca → bienvenida', () => {
    it('bienvenida al dueño en español, escapada, con links al panel y al menú; una sola', async () => {
      const slug = `mail-${randomUUID().slice(0, 8)}`;
      const response = await request(app.getHttpServer())
        .post('/api/platform/signup')
        .send({
          restaurantName: HOSTILE,
          slug,
          ownerName: 'Ana <i>Pérez</i>',
          ownerEmail: 'Ana@PollosAna.com',
          ownerPassword: 'una-clave-larga-123',
          planCode: 'pro',
          interval: 'month',
          acceptedTermsVersion: TERMS_VERSION,
        })
        .expect(201);
      expect(response.body).not.toHaveProperty('email');
      await mail.drain();

      expect(fake.sent).toHaveLength(1);
      const [welcome] = fake.sent;
      expect(welcome?.to).toBe('ana@pollosana.com');
      expect(welcome?.subject).toBe(`Bienvenido a Ventea, ${HOSTILE}`);
      expect(welcome?.html).toContain('<html lang="es">');
      expect(welcome?.html).not.toMatch(/<b>|<i>/);
      expect(welcome?.html).toContain('Ana &lt;i&gt;Pérez&lt;/i&gt;');
      expect(welcome?.html).toContain(`href="https://${slug}.ventea.tech/admin"`);
      expect(welcome?.text).toContain(`https://${slug}.ventea.tech`);
      expect(welcome?.text).toContain('Recibes este correo porque creaste la cuenta');

      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug } });
      mailer.welcome(tenant.id);
      await mail.drain();
      expect(fake.sent).toHaveLength(1);
      expect(await outbox(tenant.id, 'welcome')).toHaveLength(1);
    });
  });

  describe('job de ciclo de vida: prueba por vencer y pago pendiente', () => {
    const now = new Date('2031-03-10T15:00:00.000Z');
    const at = (days: number) => new Date(now.getTime() + days * DAY);
    let trial: TestTenant;
    let pastDue: TestTenant;
    let expired: TestTenant;

    beforeAll(async () => {
      trial = await seedTenant(prisma, 'mail-trial');
      await prisma.subscription.update({
        where: { tenantId: trial.id },
        data: { status: 'trialing', trialEndsAt: at(2.5), currentPeriodEnd: at(2.5) },
      });
      pastDue = await seedTenant(prisma, 'mail-pd');
      await prisma.tenantBranding.update({
        where: { tenantId: pastDue.id },
        data: { language: 'en' },
      });
      await prisma.subscription.update({
        where: { tenantId: pastDue.id },
        data: { status: 'past_due', trialEndsAt: at(-60), currentPeriodEnd: at(-1) },
      });
      expired = await seedTenant(prisma, 'mail-exp');
      await prisma.subscription.update({
        where: { tenantId: expired.id },
        data: { status: 'past_due', trialEndsAt: at(-2), currentPeriodEnd: at(-2) },
      });
    });

    it('cada evento genera un solo correo, en el idioma de la marca, y el job no duplica', async () => {
      const first = await mailer.runLifecycle(now);
      expect(first.locked).toBe(true);
      await mail.drain();

      const trialMails = await outbox(trial.id, 'trial_ending');
      expect(trialMails).toHaveLength(1);
      expect(trialMails[0]?.subject).toContain('Tu prueba de Ventea termina en 3 días');
      const [pd] = await outbox(pastDue.id, 'past_due');
      expect(pd?.language).toBe('en');
      expect(pd?.subject).toContain('Payment pending for your Ventea plan');
      const [exp] = await outbox(expired.id, 'past_due');
      expect(exp?.subject).toContain('Tu prueba de Ventea terminó');

      const sentPd = fake.sent.find((m) => m.to === pastDue.staffEmail);
      expect(sentPd?.html).toContain('<html lang="en">');
      expect(sentPd?.text).toContain(`https://${pastDue.slug}.ventea.tech/admin/facturacion`);
      expect(sentPd?.text).toContain('not charged automatically');

      // Otra vuelta en el mismo momento, y dos réplicas a la vez: nada nuevo.
      const before = fake.sent.length;
      const runs = await Promise.all([mailer.runLifecycle(now), mailer.runLifecycle(now)]);
      expect(runs.every((run) => !run.locked || run.enqueued === 0)).toBe(true);
      await mail.drain();
      expect(fake.sent).toHaveLength(before);
      for (const tenant of [trial, pastDue, expired]) {
        expect((await outbox(tenant.id)).length).toBe(1);
      }
    });

    it('a 1 día del fin de la prueba sale el segundo aviso; a mitad de la gracia, el recordatorio', async () => {
      await mailer.runLifecycle(at(2));
      await mail.drain();
      const trialMails = await outbox(trial.id, 'trial_ending');
      expect(trialMails).toHaveLength(2);
      expect(trialMails[1]?.subject).toContain('termina mañana');
      // El past_due sigue en la primera mitad (3 días): sin correo nuevo.
      expect(await outbox(pastDue.id)).toHaveLength(1);

      await mailer.runLifecycle(at(3));
      await mailer.runLifecycle(at(4));
      await mail.drain();
      const reminders = await outbox(pastDue.id, 'past_due_reminder');
      expect(reminders).toHaveLength(1);
      expect(reminders[0]?.subject).toBe(`Reminder: payment pending for Tenant mail-pd`);
      expect(await outbox(trial.id)).toHaveLength(2);
      // La prueba vencida tuvo un solo aviso.
      expect(await outbox(expired.id)).toHaveLength(1);
    });

    it('no toca marcas activas ni datos de pedidos', async () => {
      const active = await seedTenant(prisma, 'mail-active');
      await mailer.runLifecycle(now);
      await mail.drain();
      expect(await outbox(active.id)).toHaveLength(0);
      const payloads = (await outbox(pastDue.id)).map((row) => JSON.stringify(row.payload));
      expect(payloads.join()).not.toMatch(/order|pedido|customer/i);
    });
  });

  describe('reintentos, registro de plataforma y reenvío', () => {
    let tenant: TestTenant;

    const enqueueWelcome = (dedupeKey: string) =>
      mail.enqueue({
        kind: 'welcome',
        to: tenant.staffEmail,
        language: 'es',
        tenantId: tenant.id,
        dedupeKey,
        payload: {
          tenantName: 'Pollos Reintento',
          ownerName: 'Ana',
          panelUrl: `https://${tenant.slug}.ventea.tech/admin`,
          menuUrl: `https://${tenant.slug}.ventea.tech`,
          trialEndsAt: null,
          supportEmail: 'hola@ventea.tech',
        },
      });
    const listEmails = (query = '') =>
      request(app.getHttpServer())
        .get(`/api/platform/emails${query}`)
        .set('Authorization', `Bearer ${platform}`);

    beforeAll(async () => {
      tenant = await seedTenant(prisma, 'mail-retry');
    });

    it('un fallo transitorio se reintenta después de la espera', async () => {
      fake.failNext = 1;
      expect(await enqueueWelcome(`test:retry:${tenant.id}`)).toBe(true);
      await mail.drain();
      let [row] = await outbox(tenant.id);
      expect(row).toMatchObject({ status: 'pending', attempts: 1 });
      expect(row?.error).toContain('fallo simulado');

      // Antes de la espera no se reintenta; después, sí.
      expect(await mail.dispatchPending(new Date())).toBe(0);
      await mail.dispatchPending(new Date(Date.now() + 2 * 60_000));
      [row] = await outbox(tenant.id);
      expect(row).toMatchObject({ status: 'sent', attempts: 2, error: null });
      expect(fake.sent).toHaveLength(1);
    });

    it('agotados los intentos queda failed; la plataforma lo ve sin cuerpo y lo reenvía una vez', async () => {
      fake.failNext = MAX_ATTEMPTS;
      await enqueueWelcome(`test:failed:${tenant.id}`);
      await mail.drain();
      let clock = Date.now();
      for (let i = 1; i < MAX_ATTEMPTS; i++) {
        clock += 3 * 60 * 60_000;
        await mail.dispatchPending(new Date(clock));
      }
      const failed = (await outbox(tenant.id)).find((row) =>
        row.dedupeKey.startsWith('test:failed'),
      );
      expect(failed).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });

      const list = await listEmails('?status=failed&limit=200').expect(200);
      const body = list.body as PlatformEmailList;
      expect(body.transport).toBe('smtp');
      const item = body.items.find((email) => email.id === failed?.id);
      expect(item).toMatchObject({ kind: 'welcome', status: 'failed', to: tenant.staffEmail });
      expect(item?.tenant).toEqual({ slug: tenant.slug, name: 'Tenant mail-retry' });
      expect(Object.keys(item ?? {})).not.toEqual(
        expect.arrayContaining(['html', 'text', 'payload']),
      );
      expect(JSON.stringify(body)).not.toContain('<html');

      const resent = await request(app.getHttpServer())
        .post(`/api/platform/emails/${failed?.id}/resend`)
        .set('Authorization', `Bearer ${platform}`)
        .expect(200);
      expect((resent.body as PlatformEmail).status).toBe('pending');
      await mail.drain();
      expect(await prisma.emailMessage.findUnique({ where: { id: failed?.id } })).toMatchObject({
        status: 'sent',
        attempts: 1,
      });

      await request(app.getHttpServer())
        .post(`/api/platform/emails/${failed?.id}/resend`)
        .set('Authorization', `Bearer ${platform}`)
        .expect(409);
      await request(app.getHttpServer())
        .post(`/api/platform/emails/${randomUUID()}/resend`)
        .set('Authorization', `Bearer ${platform}`)
        .expect(404);
    });

    it('solo la plataforma ve el registro', async () => {
      await request(app.getHttpServer()).get('/api/platform/emails').expect(401);
      const owner = (await loginStaff(app, tenant)).accessToken;
      await request(app.getHttpServer())
        .get('/api/platform/emails')
        .set('Authorization', `Bearer ${owner}`)
        .expect(401);
      await listEmails('?status=nope').expect(400);
    });

    it('rechaza destinatarios con CR/LF o inválidos sin escribir nada', async () => {
      await expect(
        mail.enqueue({
          kind: 'welcome',
          to: 'ana@example.com\r\nBcc: x@evil.com',
          language: 'es',
          tenantId: tenant.id,
          dedupeKey: `test:inject:${tenant.id}`,
          payload: {
            tenantName: 'X',
            ownerName: 'Y',
            panelUrl: 'https://x.ventea.tech/admin',
            menuUrl: 'https://x.ventea.tech',
            trialEndsAt: null,
            supportEmail: 'hola@ventea.tech',
          },
        }),
      ).rejects.toThrow('Destinatario inválido');
      expect(
        await prisma.emailMessage.count({ where: { dedupeKey: `test:inject:${tenant.id}` } }),
      ).toBe(0);
    });
  });
});

describe('Tope de envío por minuto (TASK-021)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const fake = new FakeMailTransport();

  beforeAll(async () => {
    process.env.MAIL_RATE_LIMIT_PER_MINUTE = '2';
    app = await createApp({ mail: fake });
    prisma = createRawPrisma();
  });

  afterAll(async () => {
    delete process.env.MAIL_RATE_LIMIT_PER_MINUTE;
    await app.get(MailService).drain();
    await prisma.$disconnect();
    await app.close();
  });

  it('con tope 2 salen 2 y el resto espera en la cola', async () => {
    const tenant = await seedTenant(prisma, 'mail-rate');
    const mail = app.get(MailService);
    for (let i = 0; i < 3; i++) {
      await mail.enqueue({
        kind: 'welcome',
        to: `dueno${i}@example.com`,
        language: 'es',
        tenantId: tenant.id,
        dedupeKey: `test:rate:${tenant.id}:${i}`,
        payload: {
          tenantName: 'Pollos',
          ownerName: 'Ana',
          panelUrl: 'https://x.ventea.tech/admin',
          menuUrl: 'https://x.ventea.tech',
          trialEndsAt: null,
          supportEmail: 'hola@ventea.tech',
        },
      });
    }
    await mail.drain();
    expect(fake.sent).toHaveLength(2);
    const statuses = (await prisma.emailMessage.findMany({ where: { tenantId: tenant.id } })).map(
      (row) => row.status,
    );
    expect(statuses.sort()).toEqual(['pending', 'sent', 'sent']);
  });
});

describe('Correos sin SMTP configurado (TASK-021)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    // Sin transporte inyectado: rige SMTP_URL vacía (env.cjs) → no-op.
    app = await createApp();
    prisma = createRawPrisma();
  });

  afterAll(async () => {
    await app.get(MailService).drain();
    await prisma.$disconnect();
    await app.close();
  });

  it('la API arranca, el evento responde igual y el correo queda skipped', async () => {
    const tenant = await seedTenant(prisma, 'mail-noop');
    const owner = (await loginStaff(app, tenant)).accessToken;
    await request(app.getHttpServer())
      .post('/api/staff/brand/app-request')
      .set('X-Tenant-Slug', tenant.slug)
      .set('Authorization', `Bearer ${owner}`)
      .expect(201);
    await app.get(MailService).drain();

    const rows = await prisma.emailMessage.findMany({ where: { tenantId: tenant.id } });
    // Sin PLATFORM_ALERT_EMAILS va a los admins de plataforma (hay al menos uno: el de arriba).
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.status === 'skipped' && row.sentAt === null)).toBe(true);

    const token = await platformAdminToken(app, prisma);
    const list = await request(app.getHttpServer())
      .get('/api/platform/emails?status=skipped')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((list.body as PlatformEmailList).transport).toBe('none');
  });
});
