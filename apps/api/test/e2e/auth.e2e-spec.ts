import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { authTokensSchema, customerAuthResponseSchema, customerSchema } from '@ventea/shared';
import request from 'supertest';

import {
  createApp,
  createRawPrisma,
  CUSTOMER_PASSWORD,
  loginStaff,
  registerCustomer,
  seedTenant,
  type TestTenant,
} from './helpers';

describe('Auth (AC1, AC2)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenantX: TestTenant;
  let tenantY: TestTenant;

  beforeAll(async () => {
    prisma = createRawPrisma();
    tenantX = await seedTenant(prisma, 'auth-x', { signupBonusPoints: 50 });
    tenantY = await seedTenant(prisma, 'auth-y');
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());

  describe('AC1 — registro y login', () => {
    it('registro devuelve tokens y cliente, sin passwordHash, y acredita el bono', async () => {
      const response = await http()
        .post('/api/auth/register')
        .set('X-Tenant-Slug', tenantX.slug)
        .send({
          email: '  Ana.Reg@Example.COM ',
          password: CUSTOMER_PASSWORD,
          firstName: 'Ana',
          lastName: 'Pérez',
          phone: '+56911112222',
        })
        .expect(201);

      const body = customerAuthResponseSchema.parse(response.body);
      expect(body.customer.email).toBe('ana.reg@example.com');
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');

      const balance = await http()
        .get('/api/rewards/balance')
        .set('X-Tenant-Slug', tenantX.slug)
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
      expect(balance.body).toMatchObject({ balance: 50, lifetimeEarned: 50 });

      const ledger = await http()
        .get('/api/rewards/ledger')
        .set('X-Tenant-Slug', tenantX.slug)
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
      expect(ledger.body).toEqual([
        expect.objectContaining({ points: 50, reason: 'signup_bonus', orderId: null }),
      ]);
    });

    it('email repetido en el mismo tenant da 409; en otro tenant es otra cuenta', async () => {
      const email = 'dup@example.com';
      await registerCustomer(app, tenantX.slug, { email });
      await http()
        .post('/api/auth/register')
        .set('X-Tenant-Slug', tenantX.slug)
        .send({
          email: 'DUP@example.com',
          password: CUSTOMER_PASSWORD,
          firstName: 'A',
          lastName: 'B',
        })
        .expect(409);
      await registerCustomer(app, tenantY.slug, { email });
    });

    it('registro inválido da 400 con el formato de error uniforme', async () => {
      const response = await http()
        .post('/api/auth/register')
        .set('X-Tenant-Slug', tenantX.slug)
        .send({ email: 'no-es-email', password: 'corta', firstName: '', lastName: 'B' })
        .expect(400);
      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Datos inválidos',
      });
      expect(response.body.issues.map((issue: { path: string }) => issue.path)).toEqual(
        expect.arrayContaining(['email', 'password', 'firstName']),
      );
    });

    it('login correcto devuelve tokens; clave mala y email inexistente dan el mismo 401', async () => {
      const email = 'login@example.com';
      await registerCustomer(app, tenantX.slug, { email });

      const ok = await http()
        .post('/api/auth/login')
        .set('X-Tenant-Slug', tenantX.slug)
        .send({ email: 'LOGIN@example.com', password: CUSTOMER_PASSWORD })
        .expect(200);
      expect(customerAuthResponseSchema.parse(ok.body).customer.email).toBe(email);

      const wrongPassword = await http()
        .post('/api/auth/login')
        .set('X-Tenant-Slug', tenantX.slug)
        .send({ email, password: 'otra-clave-123' })
        .expect(401);
      const unknownEmail = await http()
        .post('/api/auth/login')
        .set('X-Tenant-Slug', tenantX.slug)
        .send({ email: 'nadie@example.com', password: CUSTOMER_PASSWORD })
        .expect(401);

      expect(wrongPassword.body).toEqual({
        statusCode: 401,
        message: 'Email o contraseña incorrectos',
        error: 'Unauthorized',
      });
      expect(unknownEmail.body).toEqual(wrongPassword.body);
    });

    it('la cuenta de un tenant no inicia sesión en otro', async () => {
      const email = 'solo-x@example.com';
      await registerCustomer(app, tenantX.slug, { email });
      await http()
        .post('/api/auth/login')
        .set('X-Tenant-Slug', tenantY.slug)
        .send({ email, password: CUSTOMER_PASSWORD })
        .expect(401);
    });

    it('refresh emite un par nuevo; un access token no sirve como refresh', async () => {
      const session = await registerCustomer(app, tenantX.slug);

      const refreshed = await http()
        .post('/api/auth/refresh')
        .set('X-Tenant-Slug', tenantX.slug)
        .send({ refreshToken: session.refreshToken })
        .expect(200);
      const tokens = authTokensSchema.parse(refreshed.body);

      await http()
        .get('/api/me')
        .set('X-Tenant-Slug', tenantX.slug)
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);

      await http()
        .post('/api/auth/refresh')
        .set('X-Tenant-Slug', tenantX.slug)
        .send({ refreshToken: session.accessToken })
        .expect(401);
    });

    it('GET y PATCH /api/me', async () => {
      const session = await registerCustomer(app, tenantX.slug);
      const auth = `Bearer ${session.accessToken}`;

      const me = await http()
        .get('/api/me')
        .set('X-Tenant-Slug', tenantX.slug)
        .set('Authorization', auth)
        .expect(200);
      expect(customerSchema.parse(me.body)).toEqual(session.customer);

      const updated = await http()
        .patch('/api/me')
        .set('X-Tenant-Slug', tenantX.slug)
        .set('Authorization', auth)
        .send({ firstName: 'Ana María', phone: '+56999998888' })
        .expect(200);
      expect(updated.body).toMatchObject({
        firstName: 'Ana María',
        lastName: 'Pérez',
        phone: '+56999998888',
      });
      expect(updated.body).not.toHaveProperty('passwordHash');
    });

    it('sin token, o con un refresh como access, da 401', async () => {
      const session = await registerCustomer(app, tenantX.slug);
      await http().get('/api/me').set('X-Tenant-Slug', tenantX.slug).expect(401);
      await http()
        .get('/api/me')
        .set('X-Tenant-Slug', tenantX.slug)
        .set('Authorization', `Bearer ${session.refreshToken}`)
        .expect(401);
    });
  });

  describe('AC2 — un token del tenant X no sirve en el tenant Y', () => {
    it('access token de cliente de X da 401 en Y', async () => {
      const session = await registerCustomer(app, tenantX.slug);
      const auth = `Bearer ${session.accessToken}`;

      await http()
        .get('/api/me')
        .set('X-Tenant-Slug', tenantX.slug)
        .set('Authorization', auth)
        .expect(200);
      for (const path of ['/api/me', '/api/orders', '/api/rewards/balance']) {
        await http()
          .get(path)
          .set('X-Tenant-Slug', tenantY.slug)
          .set('Authorization', auth)
          .expect(401);
      }
    });

    it('refresh token de X da 401 en Y', async () => {
      const session = await registerCustomer(app, tenantX.slug);
      await http()
        .post('/api/auth/refresh')
        .set('X-Tenant-Slug', tenantY.slug)
        .send({ refreshToken: session.refreshToken })
        .expect(401);
    });

    it('token de staff de X da 401 en las rutas de staff de Y, y un token de cliente no abre rutas de staff', async () => {
      const staff = await loginStaff(app, tenantX);
      expect(staff.staff).toMatchObject({ email: tenantX.staffEmail, role: 'owner' });

      await http()
        .get('/api/staff/orders')
        .set('X-Tenant-Slug', tenantX.slug)
        .set('Authorization', `Bearer ${staff.accessToken}`)
        .expect(200);
      await http()
        .get('/api/staff/orders')
        .set('X-Tenant-Slug', tenantY.slug)
        .set('Authorization', `Bearer ${staff.accessToken}`)
        .expect(401);

      const customer = await registerCustomer(app, tenantX.slug);
      await http()
        .get('/api/staff/orders')
        .set('X-Tenant-Slug', tenantX.slug)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .expect(401);
      // …ni un token de staff abre rutas de cliente
      await http()
        .get('/api/me')
        .set('X-Tenant-Slug', tenantX.slug)
        .set('Authorization', `Bearer ${staff.accessToken}`)
        .expect(401);
    });
  });
});
