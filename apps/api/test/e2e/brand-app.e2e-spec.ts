import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type {
  AppRequestQueueItem,
  Brand,
  BuildConfig,
  MediaUploadResponse,
  PlatformApp,
  PublicTenant,
  PushStatus,
} from '@ventea/shared';
import sharp from 'sharp';
import request from 'supertest';

import {
  createApp,
  createRawPrisma,
  createStaffMember,
  loginStaff,
  loginStaffAs,
  platformAdminToken,
  seedTenant,
  serviceAccount,
  type TestTenant,
} from './helpers';

async function setPlan(prisma: PrismaClient, tenant: TestTenant, code: 'basic' | 'pro' | 'chain') {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { code } });
  await prisma.subscription.update({ where: { tenantId: tenant.id }, data: { planId: plan.id } });
}

describe('Mi marca, app por marca y credenciales push (TASK-016)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let chain: TestTenant;
  let pro: TestTenant;
  let basic: TestTenant;
  let owner: string;
  let platform: string;

  const ownerOf = (token: string, slug: string) => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('X-Tenant-Slug', slug)
        .set('Authorization', `Bearer ${token}`),
    patch: (url: string, body: object) =>
      request(app.getHttpServer())
        .patch(url)
        .set('X-Tenant-Slug', slug)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
    post: (url: string) =>
      request(app.getHttpServer())
        .post(url)
        .set('X-Tenant-Slug', slug)
        .set('Authorization', `Bearer ${token}`),
  });
  const plat = {
    get: (url: string) =>
      request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${platform}`),
    patch: (url: string, body: object) =>
      request(app.getHttpServer()).patch(url).set('Authorization', `Bearer ${platform}`).send(body),
    put: (url: string, body: object) =>
      request(app.getHttpServer()).put(url).set('Authorization', `Bearer ${platform}`).send(body),
    delete: (url: string) =>
      request(app.getHttpServer()).delete(url).set('Authorization', `Bearer ${platform}`),
  };

  async function upload(token: string, slug: string, color: string): Promise<string> {
    const png = await sharp({ create: { width: 512, height: 512, channels: 3, background: color } })
      .png()
      .toBuffer();
    const response = await request(app.getHttpServer())
      .post('/api/staff/media')
      .set('X-Tenant-Slug', slug)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', png, { filename: 'logo.png', contentType: 'image/png' })
      .expect(201);
    return (response.body as MediaUploadResponse).url;
  }

  beforeAll(async () => {
    app = await createApp();
    prisma = createRawPrisma();
    chain = await seedTenant(prisma, 'marca-cadena');
    pro = await seedTenant(prisma, 'marca-pro');
    basic = await seedTenant(prisma, 'marca-basica');
    await setPlan(prisma, pro, 'pro');
    await setPlan(prisma, basic, 'basic');
    owner = (await loginStaff(app, chain)).accessToken;
    platform = await platformAdminToken(app, prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('Mi marca (dueño)', () => {
    it('solo el dueño: manager 403, sin sesión 401', async () => {
      const manager = await loginStaffAs(
        app,
        chain,
        await createStaffMember(prisma, chain, 'manager'),
      );
      await ownerOf(manager, chain.slug).get('/api/staff/brand').expect(403);
      await request(app.getHttpServer())
        .get('/api/staff/brand')
        .set('X-Tenant-Slug', chain.slug)
        .expect(401);
    });

    it('GET con defaults y advertencia AA del rojo de fábrica, sin bloquear', async () => {
      const brand = (await ownerOf(owner, chain.slug).get('/api/staff/brand').expect(200))
        .body as Brand;
      expect(brand).toMatchObject({
        appDisplayName: 'App marca-cadena',
        primaryColor: '#E23B2E',
        language: 'es',
        app: { status: 'not_requested', brandedAppAvailable: true, bundleId: null },
      });
      expect(brand.warnings.map((w) => w.field)).toEqual(['primaryColor']);
      expect(brand.warnings[0]!.whiteRatio).toBeLessThan(4.5);
    });

    it('PATCH: colores, logo e ícono propios, datos de tienda; /api/tenant los expone absolutos', async () => {
      const logo = await upload(owner, chain.slug, '#ffffff');
      const icon = await upload(owner, chain.slug, '#000000');
      const brand = (
        await ownerOf(owner, chain.slug)
          .patch('/api/staff/brand', {
            appDisplayName: 'Carolina',
            primaryColor: '#D4372B',
            secondaryColor: '#1f1d1b',
            accentColor: '#ffcc00',
            logoUrl: logo,
            iconUrl: icon,
            storeShortDescription: 'Pollo picante de Nashville',
            supportEmail: 'Soporte@Carolina.test',
            websiteUrl: 'https://carolina.test',
            language: 'en',
          })
          .expect(200)
      ).body as Brand;
      expect(brand).toMatchObject({
        primaryColor: '#d4372b',
        accentColor: '#ffcc00',
        supportEmail: 'soporte@carolina.test',
        language: 'en',
      });
      // #d4372b ya llega con texto blanco; el amarillo de acento no (se recomienda negro).
      expect(brand.warnings).toEqual([
        expect.objectContaining({ field: 'accentColor', recommendedTextColor: 'black' }),
      ]);
      expect(new URL(brand.logoUrl!).pathname).toBe(new URL(logo).pathname);

      const tenant = (
        await request(app.getHttpServer())
          .get('/api/tenant')
          .set('X-Tenant-Slug', chain.slug)
          .expect(200)
      ).body as PublicTenant;
      expect(tenant.branding).toMatchObject({
        appDisplayName: 'Carolina',
        primaryColor: '#d4372b',
        accentColor: '#ffcc00',
      });
      expect(tenant.branding.logoUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api\/media\/.+\.webp$/);
      expect(new URL(tenant.branding.iconUrl!).pathname).toBe(new URL(icon).pathname);
      // Con base fija (CDN o dominio canónico) manda la variable.
      process.env.MEDIA_PUBLIC_BASE_URL = 'https://cdn.ventea.tech/';
      try {
        const fixed = (
          await request(app.getHttpServer())
            .get('/api/tenant')
            .set('X-Tenant-Slug', chain.slug)
            .expect(200)
        ).body as PublicTenant;
        expect(fixed.branding.logoUrl).toBe(`https://cdn.ventea.tech${new URL(logo).pathname}`);
      } finally {
        process.env.MEDIA_PUBLIC_BASE_URL = '';
      }

      // La imagen en uso no se puede borrar.
      const hash = /([0-9a-f]{64})\.webp$/.exec(logo)![1]!;
      await request(app.getHttpServer())
        .delete(`/api/staff/media/${hash}`)
        .set('X-Tenant-Slug', chain.slug)
        .set('Authorization', `Bearer ${owner}`)
        .expect(409);
    });

    it.each([
      [{ primaryColor: 'red' }, 'color no hex'],
      [{ bundleId: 'app.robado.x' }, 'bundleId (solo plataforma)'],
      [{ websiteUrl: 'http://inseguro.test' }, 'sitio sin https'],
      [{ websiteUrl: 'javascript:alert(1)' }, 'esquema peligroso'],
      [{ supportEmail: 'no-es-email' }, 'email inválido'],
      [{ logoUrl: 'https://evil.example/logo.png' }, 'logo externo'],
      [{ appDisplayName: 'x'.repeat(31) }, 'nombre largo'],
      [{}, 'vacío'],
    ])('PATCH inválido → 400 (%s)', async (body: object, _label: string) => {
      await ownerOf(owner, chain.slug).patch('/api/staff/brand', body).expect(400);
    });

    it('logo de otra marca → 400', async () => {
      const proOwner = (await loginStaff(app, pro)).accessToken;
      const foreign = await upload(proOwner, pro.slug, '#00ff00');
      await ownerOf(owner, chain.slug).patch('/api/staff/brand', { logoUrl: foreign }).expect(400);
    });
  });

  describe('solicitud de app', () => {
    it('plan Básico → 403 con el motivo', async () => {
      const basicOwner = (await loginStaff(app, basic)).accessToken;
      const response = await ownerOf(basicOwner, basic.slug)
        .post('/api/staff/brand/app-request')
        .expect(403);
      expect((response.body as { message: string }).message).toMatch(/Pro y Cadena/);
      expect(
        (await ownerOf(basicOwner, basic.slug).get('/api/staff/brand').expect(200)).body,
      ).toMatchObject({
        app: { brandedAppAvailable: false, status: 'not_requested' },
      });
    });

    it('Cadena → requested, publica el cliente; repetir → 409', async () => {
      const brand = (
        await ownerOf(owner, chain.slug).post('/api/staff/brand/app-request').expect(201)
      ).body as Brand;
      expect(brand.app).toMatchObject({
        status: 'requested',
        publisher: 'client',
        bundleId: `app.ventea.${chain.slug.replace(/-/g, '')}`,
      });
      expect(brand.app.requestedAt).not.toBeNull();
      await ownerOf(owner, chain.slug).post('/api/staff/brand/app-request').expect(409);
    });

    it('Pro → publica Ventea', async () => {
      const proOwner = (await loginStaff(app, pro)).accessToken;
      const brand = (
        await ownerOf(proOwner, pro.slug).post('/api/staff/brand/app-request').expect(201)
      ).body as Brand;
      expect(brand.app.publisher).toBe('ventea');
    });
  });

  describe('plataforma', () => {
    it('token de marca → 401', async () => {
      await request(app.getHttpServer())
        .get('/api/platform/app-requests')
        .set('Authorization', `Bearer ${owner}`)
        .expect(401);
      await request(app.getHttpServer())
        .get(`/api/platform/tenants/${chain.slug}/app/build-config`)
        .expect(401);
    });

    it('cola de solicitudes', async () => {
      const queue = (await plat.get('/api/platform/app-requests').expect(200))
        .body as AppRequestQueueItem[];
      const slugs = queue.map((item) => item.slug);
      expect(slugs).toEqual(expect.arrayContaining([chain.slug, pro.slug]));
      expect(slugs).not.toContain(basic.slug);
      expect(queue.find((i) => i.slug === chain.slug)).toMatchObject({
        status: 'requested',
        planCode: 'chain',
      });
    });

    it('detalle de una marca sin fila: valores por defecto', async () => {
      const detail = (await plat.get(`/api/platform/tenants/${basic.slug}/app`).expect(200))
        .body as PlatformApp;
      expect(detail).toMatchObject({
        exists: false,
        status: 'not_requested',
        publisher: 'ventea',
        push: { configured: false },
      });
      await plat.get('/api/platform/tenants/no-existe-xyz/app').expect(404);
    });

    it('PATCH: estado, versión, links; bundleId repetido → 409; inválido → 400', async () => {
      const updated = (
        await plat
          .patch(`/api/platform/tenants/${chain.slug}/app`, {
            status: 'in_review',
            publisher: 'ventea',
            version: '1.2.0',
            buildNumber: 7,
            bundleId: 'app.ventea.carolina',
            storeUrls: {
              android: 'https://play.google.com/store/apps/details?id=app.ventea.carolina',
            },
          })
          .expect(200)
      ).body as PlatformApp;
      expect(updated).toMatchObject({
        status: 'in_review',
        publisher: 'ventea',
        version: '1.2.0',
        buildNumber: 7,
        bundleId: 'app.ventea.carolina',
        storeUrls: {
          android: 'https://play.google.com/store/apps/details?id=app.ventea.carolina',
          ios: null,
        },
      });
      expect(updated.events.map((e) => e.type)).toEqual(['updated', 'requested']);

      await plat
        .patch(`/api/platform/tenants/${pro.slug}/app`, { bundleId: 'app.ventea.carolina' })
        .expect(409);
      await plat.patch(`/api/platform/tenants/${pro.slug}/app`, { bundleId: '1app.x' }).expect(400);
      await plat.patch(`/api/platform/tenants/${pro.slug}/app`, { version: '1.2' }).expect(400);
      await plat.patch(`/api/platform/tenants/${pro.slug}/app`, { status: 'shipped' }).expect(400);

      // El dueño ve el estado, sin poder cambiarlo.
      const brand = (await ownerOf(owner, chain.slug).get('/api/staff/brand').expect(200))
        .body as Brand;
      expect(brand.app).toMatchObject({ status: 'in_review', version: '1.2.0' });
    });

    it('credenciales push: se cifran, nunca vuelven y se pueden quitar', async () => {
      const account = serviceAccount();
      await plat
        .put(`/api/platform/tenants/${chain.slug}/push-credentials`, {
          ...account,
          private_key: 'nope',
        })
        .expect(400);
      await plat
        .put(`/api/platform/tenants/${chain.slug}/push-credentials`, { ...account, type: 'user' })
        .expect(400);

      const set = await plat
        .put(`/api/platform/tenants/${chain.slug}/push-credentials`, account)
        .expect(200);
      expect(set.body).toMatchObject({
        configured: true,
        projectId: 'ventea-push-test',
      } satisfies Partial<PushStatus>);
      expect(JSON.stringify(set.body)).not.toMatch(/PRIVATE KEY|client_email|iam\.gserviceaccount/);

      const row = await prisma.appConfig.findUniqueOrThrow({ where: { tenantId: chain.id } });
      expect(row.pushCredentialsEnc).toMatch(/^v1\./);
      expect(row.pushCredentialsEnc).not.toContain('PRIVATE KEY');
      expect(row.pushCredentialsEnc).not.toContain(account.client_email);

      const detail = await plat.get(`/api/platform/tenants/${chain.slug}/app`).expect(200);
      const build = await plat
        .get(`/api/platform/tenants/${chain.slug}/app/build-config`)
        .expect(200);
      for (const body of [detail.body, build.body]) {
        expect(JSON.stringify(body)).not.toMatch(/PRIVATE KEY|v1\.|iam\.gserviceaccount/);
      }
      expect((detail.body as PlatformApp).push.configured).toBe(true);
      expect((detail.body as PlatformApp).events[0]!.type).toBe('push_credentials_set');

      const cleared = await plat
        .delete(`/api/platform/tenants/${chain.slug}/push-credentials`)
        .expect(200);
      expect(cleared.body).toMatchObject({ configured: false, projectId: null });
    });

    it('build-config: branding + AppConfig + URLs absolutas', async () => {
      const config = (
        await plat.get(`/api/platform/tenants/${chain.slug}/app/build-config`).expect(200)
      ).body as BuildConfig;
      expect(config).toMatchObject({
        tenant: { slug: chain.slug, currency: 'CLP' },
        branding: { appDisplayName: 'Carolina', primaryColor: '#d4372b', language: 'en' },
        app: {
          bundleId: 'app.ventea.carolina',
          status: 'in_review',
          version: '1.2.0',
          buildNumber: 7,
        },
        push: { configured: false },
      });
      expect(config.apiBaseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api$/);
      expect(config.branding.logoUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api\/media\//);
      expect(config.branding.iconUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api\/media\//);
      // Los medios se sirven desde cualquier host (la ruta lleva la marca).
      await request(app.getHttpServer())
        .get(new URL(config.branding.iconUrl!).pathname)
        .expect(200);
    });
  });
});
