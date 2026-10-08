import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import request from 'supertest';

import { createApp, createRawPrisma } from './helpers';

const DATA_MIGRATION = fileURLToPath(
  new URL(
    '../../prisma/migrations/20261008160100_seed_plans_and_backfill_subscriptions/migration.sql',
    import.meta.url,
  ),
);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * AC2: los tenants que existían antes de la migración (en producción:
 * carolina-hot-chicken, demo-burgers, pollos-prueba, taqueria-demo) quedan con
 * suscripción `active` y nada se suspende. Global-setup ya aplicó todas las migraciones
 * sobre una base vacía; acá se simula un tenant previo (sin suscripción) y se vuelve a
 * correr la migración de datos real, que además tiene que ser idempotente.
 */
describe('Migración de suscripciones (AC2)', () => {
  let prisma: PrismaClient;
  let pg: Client;
  let app: INestApplication;
  let legacyId: string;
  const slug = 'taqueria-legada';

  beforeAll(async () => {
    prisma = createRawPrisma();
    pg = new Client({ connectionString: process.env.DATABASE_URL });
    await pg.connect();

    // Tenant "de antes": sin suscripción, como estaban en producción.
    const legacy = await prisma.tenant.create({
      data: {
        slug,
        name: 'Taquería Legada',
        currency: 'HNL',
        locations: {
          create: { name: 'Centro', address: 'x', latitude: 0, longitude: 0 },
        },
      },
    });
    legacyId = legacy.id;

    const sql = await readFile(DATA_MIGRATION, 'utf8');
    await pg.query(sql);
    await pg.query(sql); // idempotente

    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
    await pg.end();
    await prisma.$disconnect();
  });

  it('el tenant previo queda en Cadena anual, active, con un año de período', async () => {
    const subscriptions = await prisma.subscription.findMany({
      where: { tenantId: legacyId },
      include: { plan: true },
    });
    expect(subscriptions).toHaveLength(1);
    const [subscription] = subscriptions;
    expect(subscription).toMatchObject({
      status: 'active',
      interval: 'year',
      cancelAtPeriodEnd: false,
      trialEndsAt: null,
      plan: expect.objectContaining({ code: 'chain' }),
    });
    const periodMs =
      subscription!.currentPeriodEnd.getTime() - subscription!.currentPeriodStart.getTime();
    expect(periodMs).toBeGreaterThanOrEqual(365 * DAY_MS);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: legacyId } });
    expect(tenant).toMatchObject({ region: 'hn-1', createdVia: 'script', isActive: true });
  });

  it('volver a correrla no duplica planes ni suscripciones', async () => {
    expect(await prisma.plan.count()).toBe(3);
    const withoutSubscription = await prisma.tenant.count({ where: { subscription: null } });
    expect(withoutSubscription).toBe(0);
  });

  it('nada se suspende: la API pública del tenant previo atiende', async () => {
    const http = () => request(app.getHttpServer());
    await http().get('/api/locations').set('X-Tenant-Slug', slug).expect(200);
    await http().get('/api/menu').set('X-Tenant-Slug', slug).expect(200);
  });
});
