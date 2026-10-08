import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import {
  planSchema,
  signupResponseSchema,
  slugAvailabilitySchema,
  TERMS_VERSION,
} from '@ventea/shared';
import request from 'supertest';

import { dayIn } from '@/modules/platform/funnel-report';

import { createApp, createRawPrisma, seedTenant, type TestTenant } from './helpers';

const OWNER_PASSWORD = 'dueno-password-123';
const DAY_MS = 24 * 60 * 60 * 1000;

/** `signup_complete` de hoy en el embudo (lo suma la API al crear la marca). */
async function signupsCountedToday(prisma: PrismaClient): Promise<number> {
  const row = await prisma.funnelDailyCount.findUnique({
    where: {
      day_event: { day: new Date(`${dayIn(new Date())}T00:00:00Z`), event: 'signup_complete' },
    },
  });
  return row?.count ?? 0;
}

function signupBody(overrides: Record<string, unknown> = {}) {
  return {
    restaurantName: 'Pollos Juan',
    slug: `pollos-${randomUUID().slice(0, 8)}`,
    ownerName: 'Juan Pérez',
    ownerEmail: 'Juan@PollosJuan.com',
    ownerPassword: OWNER_PASSWORD,
    planCode: 'pro',
    interval: 'month',
    acceptedTermsVersion: TERMS_VERSION,
    ...overrides,
  };
}

describe('Plataforma: planes y registro self-service (AC3)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let existing: TestTenant;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    // Cupo amplio: este bloque prueba el registro, no el rate limit (va abajo, con el de verdad).
    process.env.SIGNUP_RATE_LIMIT_PER_HOUR = '100';
    process.env.SIGNUP_DAILY_LIMIT = '1000';
    process.env.SIGNUP_WEEKLY_LIMIT = '1000';
    process.env.REGIONS = JSON.stringify([
      { code: 'hn-1', countries: ['*'], currency: 'HNL', timezone: 'America/Tegucigalpa' },
      { code: 'cl-1', countries: ['CL'], currency: 'CLP', timezone: 'America/Santiago' },
    ]);
    prisma = createRawPrisma();
    existing = await seedTenant(prisma, 'existente');
    app = await createApp();
  });

  afterAll(async () => {
    delete process.env.SIGNUP_RATE_LIMIT_PER_HOUR;
    delete process.env.SIGNUP_DAILY_LIMIT;
    delete process.env.SIGNUP_WEEKLY_LIMIT;
    delete process.env.REGIONS;
    await app.close();
    await prisma.$disconnect();
  });

  it('GET /api/platform/plans lista los tres planes sembrados por la migración', async () => {
    const response = await http().get('/api/platform/plans').expect(200);
    const plans = planSchema.array().parse(response.body);
    expect(plans).toEqual([
      {
        code: 'basic',
        name: 'Básico',
        priceMonthlyCents: 2500,
        priceYearlyCents: 25000,
        currency: 'USD',
        maxLocations: 1,
        features: {
          brandedApp: false,
          customDomain: false,
          reports: false,
          prioritySupport: false,
        },
      },
      {
        code: 'pro',
        name: 'Pro',
        priceMonthlyCents: 5900,
        priceYearlyCents: 59000,
        currency: 'USD',
        maxLocations: 3,
        features: { brandedApp: true, customDomain: true, reports: false, prioritySupport: false },
      },
      {
        code: 'chain',
        name: 'Cadena',
        priceMonthlyCents: 12900,
        priceYearlyCents: 129000,
        currency: 'USD',
        maxLocations: null,
        features: { brandedApp: true, customDomain: true, reports: true, prioritySupport: true },
      },
    ]);
  });

  it('el registro crea la marca completa en prueba de 14 días, sin header de tenant', async () => {
    const body = signupBody();
    const before = Date.now();
    const completedBefore = await signupsCountedToday(prisma);
    const response = await http().post('/api/platform/signup').send(body).expect(201);

    const result = signupResponseSchema.parse(response.body);
    expect(result.tenant).toEqual({
      slug: body.slug,
      url: `https://${body.slug}.ventea.tech`,
      adminUrl: `https://${body.slug}.ventea.tech/admin`,
      region: 'hn-1',
    });
    const trialMs = result.trialEndsAt.getTime() - before;
    expect(trialMs).toBeGreaterThan(14 * DAY_MS - 60_000);
    expect(trialMs).toBeLessThan(14 * DAY_MS + 60_000);

    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { slug: body.slug },
      include: {
        branding: true,
        rewardProgram: true,
        locations: true,
        staff: true,
        subscription: { include: { plan: true } },
        billingEvents: true,
      },
    });
    expect(tenant).toMatchObject({
      name: 'Pollos Juan',
      region: 'hn-1',
      createdVia: 'signup',
      currency: 'HNL',
      timezone: 'America/Tegucigalpa',
      isActive: true,
    });
    expect(tenant.branding?.appDisplayName).toBe('Pollos Juan');
    expect(tenant.rewardProgram).toMatchObject({ isEnabled: true, signupBonusPoints: 50 });
    expect(tenant.locations).toEqual([
      expect.objectContaining({ name: 'Sucursal principal', isActive: true }),
    ]);
    expect(tenant.staff).toEqual([
      expect.objectContaining({ email: 'juan@pollosjuan.com', name: 'Juan Pérez', role: 'owner' }),
    ]);
    expect(tenant.subscription).toMatchObject({
      status: 'trialing',
      interval: 'month',
      plan: expect.objectContaining({ code: 'pro' }),
    });
    expect(tenant.subscription?.trialEndsAt?.getTime()).toBe(result.trialEndsAt.getTime());
    expect(tenant.billingEvents).toEqual([expect.objectContaining({ type: 'trial_started' })]);
    // TASK-007: el embudo cuenta el registro completo desde la API.
    expect(await signupsCountedToday(prisma)).toBe(completedBefore + 1);
    // TASK-007: queda registrada la versión de términos aceptada y cuándo.
    expect(tenant.termsVersion).toBe(TERMS_VERSION);
    expect(tenant.termsAcceptedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(tenant.termsAcceptedAt?.getTime()).toBeLessThanOrEqual(Date.now());

    // El dueño entra al panel con la contraseña que eligió, y la API pública atiende.
    await http()
      .post('/api/staff/auth/login')
      .set('X-Tenant-Slug', body.slug)
      .send({ email: 'juan@pollosjuan.com', password: OWNER_PASSWORD })
      .expect(200);
    await http().get('/api/locations').set('X-Tenant-Slug', body.slug).expect(200);
    await http().get('/api/menu').set('X-Tenant-Slug', body.slug).expect(200);
  });

  it('la región sale del país: body primero, si no el header del proxy', async () => {
    const fromHeader = signupBody();
    const byHeader = await http()
      .post('/api/platform/signup')
      .set('CF-IPCountry', 'CL')
      .send(fromHeader)
      .expect(201);
    expect(byHeader.body.tenant.region).toBe('cl-1');
    const chilean = await prisma.tenant.findUniqueOrThrow({ where: { slug: fromHeader.slug } });
    expect(chilean).toMatchObject({ region: 'cl-1', currency: 'CLP' });

    const byBody = await http()
      .post('/api/platform/signup')
      .set('CF-IPCountry', 'CL')
      .send(signupBody({ country: 'hn', currency: 'usd' }))
      .expect(201);
    expect(byBody.body.tenant.region).toBe('hn-1');
  });

  it('slug repetido → 409; reservado o inválido → 400', async () => {
    await http()
      .post('/api/platform/signup')
      .send(signupBody({ slug: existing.slug }))
      .expect(409);

    const reserved = await http()
      .post('/api/platform/signup')
      .send(signupBody({ slug: 'admin' }))
      .expect(400);
    expect(reserved.body.message).toContain('reservado');
    // Suplantación: login/pagos y cualquier slug con "ventea" o que empiece con "admin".
    // `app` (TASK-007): app.ventea.tech es la landing y el panel de plataforma.
    for (const slug of ['app', 'login', 'pagos', 'secure', 'soporte-ventea', 'administracion']) {
      await http().post('/api/platform/signup').send(signupBody({ slug })).expect(400);
    }

    await http()
      .post('/api/platform/signup')
      .send(signupBody({ slug: 'Mi Restaurante' }))
      .expect(400);
  });

  it('valida el resto del body: contraseña ≥ 10, plan e intervalo conocidos', async () => {
    for (const overrides of [
      { ownerPassword: 'corta-123' },
      { planCode: 'gold' },
      { interval: 'week' },
      { ownerEmail: 'no-es-email' },
      { country: 'Honduras' },
    ]) {
      await http().post('/api/platform/signup').send(signupBody(overrides)).expect(400);
    }
  });

  it('sin aceptar los términos (o con una versión que no existe) → 400 y no crea nada', async () => {
    const { acceptedTermsVersion: _omit, ...withoutTerms } = signupBody();
    const missing = await http().post('/api/platform/signup').send(withoutTerms).expect(400);
    expect(missing.body.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'acceptedTermsVersion' })]),
    );
    expect(await prisma.tenant.findUnique({ where: { slug: withoutTerms.slug } })).toBeNull();

    const unknown = signupBody({ acceptedTermsVersion: '1999-01-01' });
    await http().post('/api/platform/signup').send(unknown).expect(400);
    expect(await prisma.tenant.findUnique({ where: { slug: unknown.slug } })).toBeNull();
  });

  it('GET /api/platform/tenant-ready: 404 si la marca no existe, 400 si el slug no es válido', async () => {
    await http()
      .get('/api/platform/tenant-ready')
      .query({ slug: `nadie-${randomUUID().slice(0, 8)}` })
      .expect(404);
    await http().get('/api/platform/tenant-ready').query({ slug: 'No Vale' }).expect(400);
    await http().get('/api/platform/tenant-ready').expect(400);
  });

  it('honeypot lleno → 400 y no crea nada', async () => {
    const body = signupBody({ website: 'http://spam.example' });
    await http().post('/api/platform/signup').send(body).expect(400);
    expect(await prisma.tenant.findUnique({ where: { slug: body.slug } })).toBeNull();
  });

  it('GET /api/platform/slug-available', async () => {
    const check = async (slug: string) =>
      slugAvailabilitySchema.parse(
        (await http().get('/api/platform/slug-available').query({ slug }).expect(200)).body,
      );

    expect(await check(`libre-${randomUUID().slice(0, 8)}`)).toEqual({ available: true });
    expect(await check(existing.slug)).toEqual({ available: false, reason: 'taken' });
    expect(await check('www')).toEqual({ available: false, reason: 'reserved' });
    expect(await check('No Vale')).toEqual({ available: false, reason: 'invalid' });
    await http().get('/api/platform/slug-available').expect(400);
  });
});

describe('Plataforma: rate limit del registro (AC3)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    delete process.env.SIGNUP_RATE_LIMIT_PER_HOUR; // el default de producción: 5 por hora
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('5 intentos por IP y hora; el sexto da 429 con Retry-After, y no gasta el cupo del login', async () => {
    const http = () => request(app.getHttpServer());
    // Cuentan los intentos, no solo los registros exitosos: un body inválido también gasta.
    for (let i = 0; i < 5; i++) {
      await http().post('/api/platform/signup').send({}).expect(400);
    }
    const blocked = await http().post('/api/platform/signup').send(signupBody()).expect(429);
    expect(blocked.body).toMatchObject({ statusCode: 429 });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    // Bucket aparte: el login de plataforma sigue respondiendo (401, credenciales malas).
    await http()
      .post('/api/platform/auth/login')
      .send({ email: 'nadie@ventea.tech', password: 'x' })
      .expect(401);
  });
});

describe('Plataforma: cupo global de altas self-service (review TASK-004)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const http = () => request(app.getHttpServer());
  const recentSignups = (days: number) =>
    prisma.tenant.count({
      where: { createdVia: 'signup', createdAt: { gte: new Date(Date.now() - days * DAY_MS) } },
    });

  beforeAll(async () => {
    process.env.SIGNUP_RATE_LIMIT_PER_HOUR = '100'; // el tope por IP no es lo que se prueba
    prisma = createRawPrisma();
    app = await createApp();
  });

  afterAll(async () => {
    delete process.env.SIGNUP_RATE_LIMIT_PER_HOUR;
    delete process.env.SIGNUP_DAILY_LIMIT;
    delete process.env.SIGNUP_WEEKLY_LIMIT;
    await app.close();
    await prisma.$disconnect();
  });

  it('cupo diario: contado en la base, al llenarse da 429 y no crea nada', async () => {
    // El cupo cuenta TODAS las altas por registro de la base (también las de otros tests).
    process.env.SIGNUP_DAILY_LIMIT = String((await recentSignups(1)) + 1);
    process.env.SIGNUP_WEEKLY_LIMIT = '1000';

    await http().post('/api/platform/signup').send(signupBody()).expect(201);
    const body = signupBody();
    const closed = await http().post('/api/platform/signup').send(body).expect(429);
    expect(closed.body).toMatchObject({
      statusCode: 429,
      message: 'Registro temporalmente cerrado, escríbenos',
    });
    expect(await prisma.tenant.findUnique({ where: { slug: body.slug } })).toBeNull();
  });

  it('cupo semanal: también cierra el registro', async () => {
    process.env.SIGNUP_DAILY_LIMIT = '1000';
    process.env.SIGNUP_WEEKLY_LIMIT = String(await recentSignups(7));
    await http().post('/api/platform/signup').send(signupBody()).expect(429);

    // Abrir el cupo reabre el registro.
    process.env.SIGNUP_WEEKLY_LIMIT = String((await recentSignups(7)) + 1);
    await http().post('/api/platform/signup').send(signupBody()).expect(201);
  });
});
