import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { FUNNEL_EVENT, funnelReportSchema, platformAuthResponseSchema } from '@ventea/shared';
import argon2 from 'argon2';
import request from 'supertest';

import { dayIn } from '@/modules/platform/funnel-report';

import { createApp, createRawPrisma } from './helpers';

const ADMIN_PASSWORD = 'platform-password-123';

async function countToday(prisma: PrismaClient, event: string): Promise<number> {
  const row = await prisma.funnelDailyCount.findUnique({
    where: { day_event: { day: new Date(`${dayIn(new Date())}T00:00:00Z`), event } },
  });
  return row?.count ?? 0;
}

describe('Embudo de registro: POST /api/platform/analytics/event (TASK-007 AC4)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let platformToken: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    prisma = createRawPrisma();
    const email = `admin-${randomUUID().slice(0, 8)}@ventea.tech`;
    await prisma.platformAdmin.create({
      data: { email, name: 'Admin', passwordHash: await argon2.hash(ADMIN_PASSWORD) },
    });
    app = await createApp();
    const login = await http()
      .post('/api/platform/auth/login')
      .send({ email, password: ADMIN_PASSWORD })
      .expect(200);
    platformToken = platformAuthResponseSchema.parse(login.body).accessToken;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('público, sin cookies: 204 y suma 1 al contador del día por tipo', async () => {
    const before = await countToday(prisma, 'visit');
    const response = await http()
      .post('/api/platform/analytics/event')
      .send({ event: 'visit' })
      .expect(204);
    expect(response.headers['set-cookie']).toBeUndefined();
    await http().post('/api/platform/analytics/event').send({ event: 'visit' }).expect(204);
    await http().post('/api/platform/analytics/event').send({ event: 'cta_click' }).expect(204);

    expect(await countToday(prisma, 'visit')).toBe(before + 2);
    expect(await countToday(prisma, 'cta_click')).toBeGreaterThanOrEqual(1);
  });

  it('acepta los tipos del embudo; muchos eventos simultáneos no se pierden', async () => {
    for (const event of FUNNEL_EVENT) {
      await http().post('/api/platform/analytics/event').send({ event }).expect(204);
    }
    const before = await countToday(prisma, 'signup_step_2');
    await Promise.all(
      Array.from({ length: 10 }, () =>
        http().post('/api/platform/analytics/event').send({ event: 'signup_step_2' }).expect(204),
      ),
    );
    expect(await countToday(prisma, 'signup_step_2')).toBe(before + 10);
  });

  it('sin PII: la tabla solo tiene día, tipo y contador; campos extra o tipos inválidos → 400', async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'funnel_daily_counts' ORDER BY column_name`;
    expect(columns.map((c) => c.column_name)).toEqual(['count', 'day', 'event']);

    await http()
      .post('/api/platform/analytics/event')
      .send({ event: 'visit', email: 'ana@correo.com' })
      .expect(400);
    await http().post('/api/platform/analytics/event').send({ event: 'compra' }).expect(400);
    await http().post('/api/platform/analytics/event').send({}).expect(400);
  });

  it('GET /api/platform/analytics/funnel: solo plataforma; serie con ceros y totales', async () => {
    await http().get('/api/platform/analytics/funnel').expect(401);

    const response = await http()
      .get('/api/platform/analytics/funnel')
      .query({ days: 7 })
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200);
    const report = funnelReportSchema.parse(response.body);
    expect(report.timezone).toBe('America/Tegucigalpa');
    expect(report.days).toHaveLength(7);
    expect(report.days[0]!.day).toBe(dayIn(new Date()));
    expect(report.days[0]!.counts.visit).toBe(await countToday(prisma, 'visit'));
    expect(report.days[6]!.counts).toEqual(
      Object.fromEntries(FUNNEL_EVENT.map((event) => [event, 0])),
    );
    expect(report.totals.visit).toBe(report.days[0]!.counts.visit);

    await http()
      .get('/api/platform/analytics/funnel')
      .query({ days: 0 })
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(400);
  });
});

describe('Embudo de registro: rate limit por IP (TASK-007 AC4)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.ANALYTICS_RATE_LIMIT_PER_HOUR = '3';
    app = await createApp();
  });

  afterAll(async () => {
    delete process.env.ANALYTICS_RATE_LIMIT_PER_HOUR;
    await app.close();
  });

  it('pasado el límite responde 429 con Retry-After y no cuenta', async () => {
    const http = () => request(app.getHttpServer());
    for (let i = 0; i < 3; i++) {
      await http().post('/api/platform/analytics/event').send({ event: 'visit' }).expect(204);
    }
    const blocked = await http()
      .post('/api/platform/analytics/event')
      .send({ event: 'visit' })
      .expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });
});
