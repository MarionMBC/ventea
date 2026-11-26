import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';

import {
  createApp,
  createRawPrisma,
  CUSTOMER_PASSWORD,
  registerCustomer,
  seedTenant,
  type TestTenant,
} from './helpers';

/** Borrado de cuenta desde la app (App Store 5.1.1(v)). */
describe('DELETE /api/me', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenant: TestTenant;
  let other: TestTenant;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    prisma = createRawPrisma();
    tenant = await seedTenant(prisma, 'delete-me');
    other = await seedTenant(prisma, 'delete-me-other');
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  function addOrder(customerId: string, status: 'completed' | 'preparing', code: string) {
    return prisma.order.create({
      data: {
        tenantId: tenant.id,
        locationId: tenant.locationId,
        customerId,
        code,
        status,
        fulfillmentType: 'pickup',
        totalCents: 1000,
      },
    });
  }

  it('borra la cuenta, sus puntos y dispositivos; el pedido queda sin cliente', async () => {
    const email = 'borrar@example.com';
    const auth = await registerCustomer(app, tenant.slug, { email });
    const customerId = auth.customer.id;
    const order = await addOrder(customerId, 'completed', 'DEL-1');
    await prisma.device.create({
      data: { tenantId: tenant.id, customerId, platform: 'ios', pushToken: 'token-borrar' },
    });
    const twin = await registerCustomer(app, other.slug, { email });

    await http()
      .delete('/api/me')
      .set('X-Tenant-Slug', tenant.slug)
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .expect(204);

    expect(await prisma.customer.count({ where: { id: customerId } })).toBe(0);
    expect(await prisma.device.count({ where: { customerId } })).toBe(0);
    expect(await prisma.rewardLedgerEntry.count({ where: { customerId } })).toBe(0);
    const kept = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(kept.customerId).toBeNull();
    // La cuenta con el mismo email en otra marca no se toca.
    expect(await prisma.customer.count({ where: { id: twin.customer.id } })).toBe(1);

    // La sesión deja de servir y el email queda libre para registrarse de nuevo.
    await http()
      .post('/api/auth/refresh')
      .set('X-Tenant-Slug', tenant.slug)
      .send({ refreshToken: auth.refreshToken })
      .expect(401);
    await http()
      .post('/api/auth/login')
      .set('X-Tenant-Slug', tenant.slug)
      .send({ email, password: CUSTOMER_PASSWORD })
      .expect(401);
    await registerCustomer(app, tenant.slug, { email });
  });

  it('con un pedido en curso responde 409 y no borra nada', async () => {
    const auth = await registerCustomer(app, tenant.slug);
    await addOrder(auth.customer.id, 'preparing', 'DEL-2');

    await http()
      .delete('/api/me')
      .set('X-Tenant-Slug', tenant.slug)
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .expect(409);

    expect(await prisma.customer.count({ where: { id: auth.customer.id } })).toBe(1);
  });

  it('sin sesión responde 401', async () => {
    await http().delete('/api/me').set('X-Tenant-Slug', tenant.slug).expect(401);
  });
});
