import { randomUUID } from 'node:crypto';

import { ForbiddenException, type INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import {
  platformAuthResponseSchema,
  platformTenantDetailSchema,
  platformTenantPageSchema,
} from '@ventea/shared';
import argon2 from 'argon2';
import request from 'supertest';

import { PlanLimitsService } from '@/modules/subscriptions/plan-limits.service';

import {
  createApp,
  createRawPrisma,
  CUSTOMER_PASSWORD,
  loginStaff,
  registerCustomer,
  seedTenant,
  type TestTenant,
} from './helpers';

const ADMIN_PASSWORD = 'platform-password-123';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('API de plataforma y suspensión (AC5, AC6)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenant: TestTenant;
  let adminEmail: string;
  let platformToken: string;

  const http = () => request(app.getHttpServer());
  const asPlatform = (req: request.Test, token = platformToken) =>
    req.set('Authorization', `Bearer ${token}`);

  async function createAdmin(): Promise<string> {
    const email = `admin-${randomUUID().slice(0, 8)}@ventea.tech`;
    await prisma.platformAdmin.create({
      data: { email, name: 'Admin', passwordHash: await argon2.hash(ADMIN_PASSWORD) },
    });
    return email;
  }

  async function platformLogin(email: string): Promise<string> {
    const response = await http()
      .post('/api/platform/auth/login')
      .send({ email, password: ADMIN_PASSWORD })
      .expect(200);
    return platformAuthResponseSchema.parse(response.body).accessToken;
  }

  beforeAll(async () => {
    prisma = createRawPrisma();
    tenant = await seedTenant(prisma, 'plataforma');
    adminEmail = await createAdmin();
    app = await createApp();
    platformToken = await platformLogin(adminEmail);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('auth de plataforma (AC6)', () => {
    it('login: clave incorrecta y email inexistente dan el mismo 401', async () => {
      const wrong = await http()
        .post('/api/platform/auth/login')
        .send({ email: adminEmail, password: 'incorrecta-123' }) // gitleaks:allow — clave de prueba
        .expect(401);
      const missing = await http()
        .post('/api/platform/auth/login')
        .send({ email: 'nadie@ventea.tech', password: ADMIN_PASSWORD })
        .expect(401);
      expect(wrong.body.message).toBe(missing.body.message);
    });

    it('el token de plataforma lleva kind "platform" y no lleva tid', () => {
      const payload = JSON.parse(
        Buffer.from(platformToken.split('.')[1]!, 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      expect(payload).toMatchObject({ kind: 'platform', typ: 'access' });
      expect(payload).not.toHaveProperty('tid');
    });

    it('las rutas de plataforma rechazan sin token y con tokens de staff o de cliente', async () => {
      const staff = await loginStaff(app, tenant);
      const customer = await registerCustomer(app, tenant.slug);

      await http().get('/api/platform/tenants').expect(401);
      await asPlatform(http().get('/api/platform/tenants'), staff.accessToken).expect(401);
      await asPlatform(http().get('/api/platform/tenants'), customer.accessToken).expect(401);
      await asPlatform(http().get('/api/platform/tenants'), staff.refreshToken).expect(401);
      await asPlatform(
        http().post(`/api/platform/tenants/${tenant.slug}/suspend`),
        staff.accessToken,
      ).expect(401);
      await asPlatform(http().get('/api/platform/tenants')).expect(200);
    });

    it('las rutas de staff y de cliente rechazan el token de plataforma', async () => {
      await http()
        .get('/api/staff/orders')
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${platformToken}`)
        .expect(401);
      await http()
        .get('/api/me')
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${platformToken}`)
        .expect(401);
      await http()
        .post('/api/auth/refresh')
        .set('X-Tenant-Slug', tenant.slug)
        .send({ refreshToken: platformToken })
        .expect(401);
    });

    it('borrar al admin corta su sesión aunque el token no haya expirado', async () => {
      const email = await createAdmin();
      const token = await platformLogin(email);
      await asPlatform(http().get('/api/platform/tenants'), token).expect(200);
      await prisma.platformAdmin.delete({ where: { email } });
      await asPlatform(http().get('/api/platform/tenants'), token).expect(401);
    });

    it('subir tokenVersion (reset de clave) invalida los tokens vivos; el login nuevo sirve', async () => {
      const email = await createAdmin();
      const token = await platformLogin(email);
      await asPlatform(http().get('/api/platform/tenants'), token).expect(200);
      await prisma.platformAdmin.update({
        where: { email },
        data: { tokenVersion: { increment: 1 } },
      });
      await asPlatform(http().get('/api/platform/tenants'), token).expect(401);
      const fresh = await platformLogin(email);
      await asPlatform(http().get('/api/platform/tenants'), fresh).expect(200);
    });
  });

  describe('listado y detalle', () => {
    it('lista marcas con plan, estado, región, alta y pedidos de los últimos 30 días', async () => {
      await prisma.order.create({
        data: {
          tenantId: tenant.id,
          locationId: tenant.locationId,
          code: `T-${randomUUID().slice(0, 4)}`,
          fulfillmentType: 'pickup',
          status: 'confirmed',
          placedAt: new Date(),
        },
      });
      await prisma.order.create({
        data: {
          tenantId: tenant.id,
          locationId: tenant.locationId,
          code: `V-${randomUUID().slice(0, 4)}`,
          fulfillmentType: 'pickup',
          status: 'completed',
          createdAt: new Date(Date.now() - 40 * DAY_MS),
        },
      });

      const response = await asPlatform(
        http().get('/api/platform/tenants').query({ pageSize: 100 }),
      ).expect(200);
      const tenants = platformTenantPageSchema.parse(response.body).items;
      expect(tenants.find((t) => t.slug === tenant.slug)).toMatchObject({
        region: 'hn-1',
        createdVia: 'script',
        isActive: true,
        subscription: { status: 'active', planCode: 'chain', interval: 'year' },
        ordersLast30Days: 1,
      });
    });

    it('pagina con total: page y pageSize (máx 100), sin repetir marcas entre páginas', async () => {
      await seedTenant(prisma, 'pagina-a');
      await seedTenant(prisma, 'pagina-b');
      const total = await prisma.tenant.count();

      const first = platformTenantPageSchema.parse(
        (await asPlatform(http().get('/api/platform/tenants').query({ pageSize: 2 })).expect(200))
          .body,
      );
      const second = platformTenantPageSchema.parse(
        (
          await asPlatform(
            http().get('/api/platform/tenants').query({ page: 2, pageSize: 2 }),
          ).expect(200)
        ).body,
      );
      expect(first).toMatchObject({ total, page: 1, pageSize: 2 });
      expect(first.items).toHaveLength(2);
      expect(second.items).toHaveLength(Math.min(2, total - 2));
      const ids = [...first.items, ...second.items].map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);

      const defaults = platformTenantPageSchema.parse(
        (await asPlatform(http().get('/api/platform/tenants')).expect(200)).body,
      );
      expect(defaults).toMatchObject({ page: 1, pageSize: 50 });

      await asPlatform(http().get('/api/platform/tenants').query({ pageSize: 101 })).expect(400);
      await asPlatform(http().get('/api/platform/tenants').query({ page: 0 })).expect(400);
    });

    it('detalle con sucursales activas y eventos; 404 si no existe', async () => {
      const response = await asPlatform(http().get(`/api/platform/tenants/${tenant.slug}`)).expect(
        200,
      );
      const detail = platformTenantDetailSchema.parse(response.body);
      expect(detail).toMatchObject({ slug: tenant.slug, activeLocations: 1 });
      await asPlatform(http().get('/api/platform/tenants/no-existe-xyz')).expect(404);
    });
  });

  describe('suspender y reactivar (AC5)', () => {
    it('suspendida: la API pública da 402, el staff entra; reactivar la restaura', async () => {
      const slug = tenant.slug;
      const customer = await registerCustomer(app, slug);
      // Un pedido en curso del cliente, hecho antes de la suspensión.
      const inFlight = await prisma.order.create({
        data: {
          tenantId: tenant.id,
          locationId: tenant.locationId,
          customerId: customer.customer.id,
          code: `E-${randomUUID().slice(0, 4)}`,
          fulfillmentType: 'pickup',
          status: 'preparing',
          placedAt: new Date(),
        },
      });

      const suspended = await asPlatform(
        http().post(`/api/platform/tenants/${slug}/suspend`).send({ reason: 'sin pago' }),
      ).expect(200);
      expect(platformTenantDetailSchema.parse(suspended.body).subscription?.status).toBe(
        'suspended',
      );

      // API pública de la marca: 402 con el formato de error de siempre.
      const menu = await http().get('/api/menu').set('X-Tenant-Slug', slug).expect(402);
      expect(menu.body).toEqual({
        statusCode: 402,
        message: 'Servicio suspendido',
        error: 'Payment Required',
      });
      await http().get('/api/locations').set('X-Tenant-Slug', slug).expect(402);
      await http()
        .post('/api/auth/register')
        .set('X-Tenant-Slug', slug)
        .send({
          email: 'nuevo@example.com',
          password: 'cliente-123',
          firstName: 'A',
          lastName: 'B',
        })
        .expect(402);
      await http()
        .post('/api/orders')
        .set('X-Tenant-Slug', slug)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({ locationId: tenant.locationId, fulfillmentType: 'pickup', lines: [] })
        .expect(402);
      await http()
        .post('/api/auth/login')
        .set('X-Tenant-Slug', slug)
        .send({ email: customer.customer.email, password: CUSTOMER_PASSWORD })
        .expect(402);
      await http()
        .patch('/api/me')
        .set('X-Tenant-Slug', slug)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({ firstName: 'X' })
        .expect(402);
      await http()
        .post(`/api/orders/${inFlight.id}/cancel`)
        .set('X-Tenant-Slug', slug)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .expect(402);

      // El cliente final sigue viendo su cuenta y sus pedidos en curso.
      const asCustomer = (req: request.Test) =>
        req.set('X-Tenant-Slug', slug).set('Authorization', `Bearer ${customer.accessToken}`);
      await asCustomer(http().get('/api/me')).expect(200);
      const mine = await asCustomer(http().get('/api/orders')).expect(200);
      expect((mine.body as { id: string }[]).map((o) => o.id)).toContain(inFlight.id);
      const one = await asCustomer(http().get(`/api/orders/${inFlight.id}`)).expect(200);
      expect(one.body).toMatchObject({ id: inFlight.id, status: 'preparing' });

      // El dueño puede entrar al panel (a pagar): login, branding y tablero.
      const staff = await loginStaff(app, tenant);
      await http().get('/api/tenant').set('X-Tenant-Slug', slug).expect(200);
      await http()
        .get('/api/staff/orders')
        .set('X-Tenant-Slug', slug)
        .set('Authorization', `Bearer ${staff.accessToken}`)
        .expect(200);
      await http()
        .post('/api/auth/refresh')
        .set('X-Tenant-Slug', slug)
        .send({ refreshToken: staff.refreshToken })
        .expect(200);
      await http().get('/api/health').expect(200);

      // Las otras marcas no se enteran.
      const other = await seedTenant(prisma, 'vecina');
      await http().get('/api/menu').set('X-Tenant-Slug', other.slug).expect(200);

      // Suspender dos veces no tiene sentido.
      await asPlatform(http().post(`/api/platform/tenants/${slug}/suspend`)).expect(409);

      const before = Date.now();
      const reactivated = await asPlatform(
        http().post(`/api/platform/tenants/${slug}/reactivate`),
      ).expect(200);
      const detail = platformTenantDetailSchema.parse(reactivated.body);
      expect(detail.subscription?.status).toBe('active');
      // Período nuevo desde hoy, del largo del intervalo (anual).
      const periodMs = detail.subscription!.currentPeriodEnd.getTime() - before;
      expect(periodMs).toBeGreaterThan(364 * DAY_MS);
      expect(detail.billingEvents.map((e) => e.type)).toEqual(['reactivated', 'suspended']);
      expect(detail.billingEvents[1]?.message).toContain('sin pago');

      await http().get('/api/menu').set('X-Tenant-Slug', slug).expect(200);
      await asPlatform(http().post(`/api/platform/tenants/${slug}/reactivate`)).expect(409);
    });

    it('prueba vencida con solo tráfico de staff: igual pasa a past_due (el staff entra)', async () => {
      const trial = await seedTenant(prisma, 'solo-staff');
      await prisma.subscription.update({
        where: { tenantId: trial.id },
        data: { status: 'trialing', trialEndsAt: new Date(Date.now() - 1000) },
      });

      await loginStaff(app, trial);
      await http().get('/api/tenant').set('X-Tenant-Slug', trial.slug).expect(200);

      const sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: trial.id } });
      expect(sub.status).toBe('past_due');
      expect(
        await prisma.billingEvent.count({ where: { tenantId: trial.id, type: 'trial_expired' } }),
      ).toBe(1);
    });

    it('prueba vencida: pasa a past_due y 402; extender la prueba la restaura', async () => {
      const trial = await seedTenant(prisma, 'prueba');
      await prisma.subscription.update({
        where: { tenantId: trial.id },
        data: { status: 'trialing', trialEndsAt: new Date(Date.now() - 1000) },
      });

      await http().get('/api/menu').set('X-Tenant-Slug', trial.slug).expect(402);
      const expired = await prisma.subscription.findUniqueOrThrow({
        where: { tenantId: trial.id },
      });
      expect(expired.status).toBe('past_due');
      // Un segundo request no repite el asiento.
      await http().get('/api/menu').set('X-Tenant-Slug', trial.slug).expect(402);
      expect(
        await prisma.billingEvent.count({ where: { tenantId: trial.id, type: 'trial_expired' } }),
      ).toBe(1);

      await asPlatform(
        http().post(`/api/platform/tenants/${trial.slug}/extend-trial`).send({ days: 0 }),
      ).expect(400);
      const before = Date.now();
      const extended = await asPlatform(
        http().post(`/api/platform/tenants/${trial.slug}/extend-trial`).send({ days: 7 }),
      ).expect(200);
      const detail = platformTenantDetailSchema.parse(extended.body);
      expect(detail.subscription?.status).toBe('trialing');
      const trialMs = detail.subscription!.trialEndsAt!.getTime() - before;
      expect(trialMs).toBeGreaterThan(7 * DAY_MS - 60_000);
      expect(trialMs).toBeLessThan(7 * DAY_MS + 60_000);

      await http().get('/api/menu').set('X-Tenant-Slug', trial.slug).expect(200);
      // Una suscripción activa no tiene prueba que extender.
      await asPlatform(
        http().post(`/api/platform/tenants/${tenant.slug}/extend-trial`).send({ days: 7 }),
      ).expect(409);
    });
  });

  describe('cambio de plan y límites de sucursales', () => {
    it('cambia plan e intervalo; no baja a un plan donde no caben las sucursales activas', async () => {
      const chain = await seedTenant(prisma, 'cadena');
      const changePlan = (body: Record<string, unknown>) =>
        asPlatform(http().post(`/api/platform/tenants/${chain.slug}/change-plan`).send(body));

      await changePlan({ planCode: 'gold' }).expect(400);

      const toPro = await changePlan({ planCode: 'pro', interval: 'month' }).expect(200);
      expect(platformTenantDetailSchema.parse(toPro.body).subscription).toMatchObject({
        planCode: 'pro',
        interval: 'month',
        status: 'active',
      });

      // 1 activa + 3 nuevas = 4: no entra en Pro (3) ni en Básico (1).
      for (let i = 0; i < 3; i++) {
        await prisma.location.create({
          data: {
            tenantId: chain.id,
            name: `Sucursal ${i}`,
            address: 'x',
            latitude: 0,
            longitude: 0,
          },
        });
      }
      const blocked = await changePlan({ planCode: 'basic' }).expect(409);
      expect(blocked.body.message).toContain('4 sucursales activas');
      // Código estable para que el panel lo traduzca (TASK-017).
      expect(blocked.body).toMatchObject({
        code: 'plan_limit',
        limit: { resource: 'locations', plan: 'basic', planName: 'Básico', max: 1 },
      });

      const back = await changePlan({ planCode: 'chain' }).expect(200);
      const detail = platformTenantDetailSchema.parse(back.body);
      expect(detail.subscription).toMatchObject({ planCode: 'chain', interval: 'month' });
      expect(detail.billingEvents.filter((e) => e.type === 'plan_changed')).toHaveLength(2);
    });

    it('PlanLimitsService.assertCanAddLocation respeta maxLocations del plan', async () => {
      const limits = app.get(PlanLimitsService);
      const basic = await seedTenant(prisma, 'basico'); // 1 sucursal activa
      const basicPlan = await prisma.plan.findUniqueOrThrow({ where: { code: 'basic' } });
      await prisma.subscription.update({
        where: { tenantId: basic.id },
        data: { planId: basicPlan.id },
      });

      await expect(limits.assertCanAddLocation(basic.id)).rejects.toThrow(ForbiddenException);
      await expect(limits.assertCanAddLocation(basic.id)).rejects.toThrow(
        'El plan Básico permite hasta 1 sucursal activa',
      );

      // Sin sucursales activas, la primera sí entra.
      await prisma.location.updateMany({
        where: { tenantId: basic.id },
        data: { isActive: false },
      });
      await expect(limits.assertCanAddLocation(basic.id)).resolves.toBeUndefined();

      // Cadena: ilimitadas.
      await expect(limits.assertCanAddLocation(tenant.id)).resolves.toBeUndefined();
    });
  });
});
