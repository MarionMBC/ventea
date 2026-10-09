import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { CustomerAuthResponse, Device, Order } from '@ventea/shared';
import request from 'supertest';

import { FakePushTransport } from '@/modules/push/fake.transport';
import { PushService } from '@/modules/push/push.service';

import {
  createApp,
  createRawPrisma,
  importCarolinaMenu,
  loginStaff,
  platformAdminToken,
  registerCustomer,
  seedTenant,
  serviceAccount,
  type TestTenant,
} from './helpers';

describe('Push: dispositivos y avisos de estado del pedido (TASK-016)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let push: PushService;
  const fake = new FakePushTransport();
  let tenant: TestTenant;
  let noCreds: TestTenant;
  let staffToken: string;
  let customer: CustomerAuthResponse;
  let menuItemId: string;

  const device = (token: string, slug: string, body: object) =>
    request(app.getHttpServer())
      .post('/api/devices')
      .set('X-Tenant-Slug', slug)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  async function placeOrder(slug: string, accessToken: string, locationId: string): Promise<Order> {
    const response = await request(app.getHttpServer())
      .post('/api/orders')
      .set('X-Tenant-Slug', slug)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ locationId, fulfillmentType: 'pickup', lines: [{ menuItemId, quantity: 1 }] })
      .expect(201);
    return response.body as Order;
  }

  const setStatus = (slug: string, token: string, orderId: string, status: string) =>
    request(app.getHttpServer())
      .patch(`/api/staff/orders/${orderId}/status`)
      .set('X-Tenant-Slug', slug)
      .set('Authorization', `Bearer ${token}`)
      .send({ status });

  beforeAll(async () => {
    app = await createApp({ push: fake });
    push = app.get(PushService);
    prisma = createRawPrisma();
    tenant = await seedTenant(prisma, 'push');
    noCreds = await seedTenant(prisma, 'push-sin');
    // Un ítem simple, sin modificadores obligatorios.
    const category = await prisma.menuCategory.create({ data: { tenantId: tenant.id, name: 'C' } });
    menuItemId = (
      await prisma.menuItem.create({
        data: {
          tenantId: tenant.id,
          categoryId: category.id,
          name: 'Tenders',
          basePriceCents: 1000,
        },
      })
    ).id;
    staffToken = (await loginStaff(app, tenant)).accessToken;
    customer = await registerCustomer(app, tenant.slug);

    const platform = await platformAdminToken(app, prisma);
    await request(app.getHttpServer())
      .put(`/api/platform/tenants/${tenant.slug}/push-credentials`)
      .set('Authorization', `Bearer ${platform}`)
      .send(serviceAccount('ventea-push-e2e'))
      .expect(200);
  });

  beforeEach(() => fake.reset());

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('dispositivos', () => {
    it('sin sesión 401; datos inválidos 400; token de staff 401', async () => {
      await request(app.getHttpServer())
        .post('/api/devices')
        .set('X-Tenant-Slug', tenant.slug)
        .send({ platform: 'android', pushToken: 't' })
        .expect(401);
      await device(customer.accessToken, tenant.slug, {
        platform: 'windows',
        pushToken: 't',
      }).expect(400);
      await device(customer.accessToken, tenant.slug, {
        platform: 'android',
        pushToken: '',
      }).expect(400);
      await device(customer.accessToken, tenant.slug, { platform: 'android' }).expect(400);
      await device(staffToken, tenant.slug, { platform: 'android', pushToken: 't' }).expect(401);
    });

    it('alta 201; mismo token del mismo cliente 200 con el mismo id; otro cliente lo toma (201)', async () => {
      const first = (
        await device(customer.accessToken, tenant.slug, {
          platform: 'android',
          pushToken: 'tok-shared',
        }).expect(201)
      ).body as Device;
      expect(first).toMatchObject({ platform: 'android' });
      const again = (
        await device(customer.accessToken, tenant.slug, {
          platform: 'android',
          pushToken: 'tok-shared',
        }).expect(200)
      ).body as Device;
      expect(again.id).toBe(first.id);

      const second = await registerCustomer(app, tenant.slug);
      const moved = (
        await device(second.accessToken, tenant.slug, {
          platform: 'ios',
          pushToken: 'tok-shared',
        }).expect(201)
      ).body as Device;
      expect(moved.id).toBe(first.id);
      const row = await prisma.device.findUniqueOrThrow({ where: { id: first.id } });
      expect(row.customerId).toBe(second.customer.id);
      expect(
        await prisma.device.count({ where: { tenantId: tenant.id, pushToken: 'tok-shared' } }),
      ).toBe(1);

      // Baja: solo el dueño del dispositivo; el anterior recibe 404.
      await request(app.getHttpServer())
        .delete(`/api/devices/${first.id}`)
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/api/devices/${first.id}`)
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${second.accessToken}`)
        .expect(204);
      expect(await prisma.device.count({ where: { id: first.id } })).toBe(0);
    });

    it('el mismo token en otra marca es otro dispositivo', async () => {
      const other = await registerCustomer(app, noCreds.slug);
      await device(customer.accessToken, tenant.slug, {
        platform: 'android',
        pushToken: 'tok-cross',
      }).expect(201);
      await device(other.accessToken, noCreds.slug, {
        platform: 'android',
        pushToken: 'tok-cross',
      }).expect(201);
      expect(await prisma.device.count({ where: { pushToken: 'tok-cross' } })).toBe(2);
    });
  });

  describe('avisos de estado', () => {
    beforeAll(async () => {
      await device(customer.accessToken, tenant.slug, {
        platform: 'android',
        pushToken: 'tok-a',
      }).expect(201);
      await device(customer.accessToken, tenant.slug, {
        platform: 'ios',
        pushToken: 'tok-b',
      }).expect(201);
    });

    it('preparing / ready / completed / cancelled → push al cliente, en el idioma de la marca', async () => {
      const order = await placeOrder(tenant.slug, customer.accessToken, tenant.locationId);
      await setStatus(tenant.slug, staffToken, order.id, 'preparing').expect(200);
      await push.drain();
      const tokens = fake.sent.map((s) => s.message.token).sort();
      expect(tokens).toEqual(expect.arrayContaining(['tok-a', 'tok-b']));
      const message = fake.sent.find((s) => s.message.token === 'tok-a')!;
      expect(message.projectId).toBe('ventea-push-e2e');
      expect(message.message).toMatchObject({
        title: 'App push',
        body: `Estamos preparando tu pedido ${order.code}.`,
        data: { type: 'order_status', orderId: order.id, status: 'preparing', code: order.code },
      });

      await prisma.tenantBranding.update({
        where: { tenantId: tenant.id },
        data: { language: 'en' },
      });
      fake.reset();
      await setStatus(tenant.slug, staffToken, order.id, 'ready').expect(200);
      await push.drain();
      expect(fake.sent[0]!.message.body).toBe(`Your order ${order.code} is ready for pickup!`);
      await prisma.tenantBranding.update({
        where: { tenantId: tenant.id },
        data: { language: 'es' },
      });

      fake.reset();
      await setStatus(tenant.slug, staffToken, order.id, 'completed').expect(200);
      await push.drain();
      expect(new Set(fake.sent.map((s) => s.message.data.status))).toEqual(new Set(['completed']));

      const other = await placeOrder(tenant.slug, customer.accessToken, tenant.locationId);
      fake.reset();
      await setStatus(tenant.slug, staffToken, other.id, 'cancelled').expect(200);
      await push.drain();
      expect(fake.sent.map((s) => s.message.data.status)).toContain('cancelled');
    });

    it('la cancelación del propio cliente no le avisa a él mismo', async () => {
      const order = await placeOrder(tenant.slug, customer.accessToken, tenant.locationId);
      await request(app.getHttpServer())
        .post(`/api/orders/${order.id}/cancel`)
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .expect(200);
      await push.drain();
      expect(fake.sent).toHaveLength(0);
    });

    it('si el transporte revienta, el cambio de estado responde igual', async () => {
      const order = await placeOrder(tenant.slug, customer.accessToken, tenant.locationId);
      fake.fail = true;
      const response = await setStatus(tenant.slug, staffToken, order.id, 'preparing').expect(200);
      expect(response.body).toMatchObject({ id: order.id, status: 'preparing' });
      await expect(push.drain()).resolves.toBeUndefined();
    });

    it('el envío no bloquea la respuesta: un transporte lento no la demora', async () => {
      const order = await placeOrder(tenant.slug, customer.accessToken, tenant.locationId);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const original = fake.send.bind(fake);
      fake.send = async (credentials, message) => {
        await gate;
        return original(credentials, message);
      };
      try {
        const started = Date.now();
        await setStatus(tenant.slug, staffToken, order.id, 'preparing').expect(200);
        expect(Date.now() - started).toBeLessThan(5_000);
        expect(fake.sent).toHaveLength(0); // todavía esperando
      } finally {
        release();
        await push.drain();
        fake.send = original;
      }
      expect(fake.sent.length).toBeGreaterThan(0);
    });

    it('token inválido → se limpia del dispositivo', async () => {
      const order = await placeOrder(tenant.slug, customer.accessToken, tenant.locationId);
      fake.results.set('tok-b', 'invalid_token');
      await setStatus(tenant.slug, staffToken, order.id, 'preparing').expect(200);
      await push.drain();
      expect(
        await prisma.device.count({ where: { tenantId: tenant.id, pushToken: 'tok-b' } }),
      ).toBe(0);
      expect(
        await prisma.device.count({ where: { tenantId: tenant.id, pushToken: 'tok-a' } }),
      ).toBe(1);
    });

    it('marca sin credenciales → no-op, el pedido avanza', async () => {
      const otherCustomer = await registerCustomer(app, noCreds.slug);
      const category = await prisma.menuCategory.create({
        data: { tenantId: noCreds.id, name: 'C' },
      });
      const item = await prisma.menuItem.create({
        data: { tenantId: noCreds.id, categoryId: category.id, name: 'X', basePriceCents: 500 },
      });
      await device(otherCustomer.accessToken, noCreds.slug, {
        platform: 'android',
        pushToken: 'tok-nc',
      }).expect(201);
      const order = (
        await request(app.getHttpServer())
          .post('/api/orders')
          .set('X-Tenant-Slug', noCreds.slug)
          .set('Authorization', `Bearer ${otherCustomer.accessToken}`)
          .send({
            locationId: noCreds.locationId,
            fulfillmentType: 'pickup',
            lines: [{ menuItemId: item.id, quantity: 1 }],
          })
          .expect(201)
      ).body as Order;
      const owner = (await loginStaff(app, noCreds)).accessToken;
      await setStatus(noCreds.slug, owner, order.id, 'preparing').expect(200);
      await push.drain();
      expect(fake.sent).toHaveLength(0);
    });

    it('credenciales cifradas con la marca: copiadas a otra marca no descifran', async () => {
      const source = await prisma.appConfig.findUniqueOrThrow({ where: { tenantId: tenant.id } });
      await prisma.appConfig.create({
        data: {
          tenantId: noCreds.id,
          bundleId: `app.ventea.copia${noCreds.id.slice(0, 4).replace(/[^a-z]/g, 'x')}`,
          publisher: 'ventea',
          pushCredentialsEnc: source.pushCredentialsEnc,
        },
      });
      const otherCustomer = await registerCustomer(app, noCreds.slug);
      await device(otherCustomer.accessToken, noCreds.slug, {
        platform: 'android',
        pushToken: 'tok-copy',
      }).expect(201);
      const item = await prisma.menuItem.findFirstOrThrow({ where: { tenantId: noCreds.id } });
      const order = (
        await request(app.getHttpServer())
          .post('/api/orders')
          .set('X-Tenant-Slug', noCreds.slug)
          .set('Authorization', `Bearer ${otherCustomer.accessToken}`)
          .send({
            locationId: noCreds.locationId,
            fulfillmentType: 'pickup',
            lines: [{ menuItemId: item.id, quantity: 1 }],
          })
          .expect(201)
      ).body as Order;
      const owner = (await loginStaff(app, noCreds)).accessToken;
      await setStatus(noCreds.slug, owner, order.id, 'preparing').expect(200);
      await push.drain();
      expect(fake.sent).toHaveLength(0);
    });
  });

  it('el menú real de Carolina sigue importando con las columnas nuevas', async () => {
    const fresh = await seedTenant(prisma, 'push-import');
    await importCarolinaMenu(prisma, fresh.slug);
    expect(
      await prisma.menuItem.count({ where: { tenantId: fresh.id, deletedAt: null } }),
    ).toBeGreaterThan(0);
  });
});
