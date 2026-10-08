import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { productionOrigins } from '@/cors-origins';

/**
 * CORS de producción (TASK-006, TASK-007): la landing vive en `https://app.ventea.tech`
 * (antes en el apex, que ahora redirige) y puede llamar a `api.ventea.tech`. Se arma la app
 * como main.ts en producción (la config de e2e trae TENANT_BASE_DOMAIN=ventea.tech) y se
 * mira el header que devuelve el middleware `cors` real.
 */
describe('CORS de producción (TASK-006 AC4)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableCors({ origin: productionOrigins(app.get(ConfigService)), credentials: true });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const preflight = (origin: string) =>
    request(app.getHttpServer())
      .options('/api/platform/signup')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

  it.each([
    'https://app.ventea.tech', // TASK-007: landing y panel de plataforma
    'https://ventea.tech',
    'https://pollos-juan.ventea.tech',
    'https://api.ventea.tech',
  ])('permite %s (preflight y GET)', async (origin) => {
    const pre = await preflight(origin).expect(204);
    expect(pre.headers['access-control-allow-origin']).toBe(origin);

    const get = await request(app.getHttpServer())
      .get('/api/platform/plans')
      .set('Origin', origin)
      .expect(200);
    expect(get.headers['access-control-allow-origin']).toBe(origin);
  });

  it.each([
    'https://evil.com',
    'https://ventea.tech.evil.com',
    'https://eventea.tech',
    'http://ventea.tech',
    'https://a.b.ventea.tech',
  ])('bloquea %s', async (origin) => {
    const pre = await preflight(origin);
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();

    const get = await request(app.getHttpServer())
      .get('/api/platform/plans')
      .set('Origin', origin)
      .expect(200);
    expect(get.headers['access-control-allow-origin']).toBeUndefined();
  });
});
