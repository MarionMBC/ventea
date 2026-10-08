import { readFile } from 'node:fs/promises';

import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { locationSchema, publicMenuSchema, publicTenantSchema } from '@ventea/shared';
import request from 'supertest';

import {
  CAROLINA_MENU_FILE,
  createApp,
  createRawPrisma,
  importCarolinaMenu,
  seedTenant,
  type TestTenant,
} from './helpers';

interface MenuFileItem {
  name: string;
  basePriceCents: number;
  compareAtPriceCents: number | null;
  tags: string[];
  isAvailable: boolean;
}
interface MenuFile {
  currency: string;
  rewardProgram: Record<string, unknown>;
  categories: { name: string; items: MenuFileItem[] }[];
}

describe('Catálogo público (AC3)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let carolina: TestTenant;
  let other: TestTenant;
  let file: MenuFile;

  beforeAll(async () => {
    prisma = createRawPrisma();
    carolina = await seedTenant(prisma, 'carolina');
    other = await seedTenant(prisma, 'otro');
    await importCarolinaMenu(prisma, carolina.slug);
    file = JSON.parse(await readFile(CAROLINA_MENU_FILE, 'utf8')) as MenuFile;
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());

  it('GET /api/menu devuelve el menú importado de Carolina, validable con publicMenuSchema', async () => {
    const response = await http().get('/api/menu').set('X-Tenant-Slug', carolina.slug).expect(200);
    const menu = publicMenuSchema.parse(response.body);

    expect(menu.currency).toBe('USD');
    expect(menu.locationId).toBe(carolina.locationId);
    expect(menu.categories.map((c) => c.name)).toEqual(file.categories.map((c) => c.name));

    const items = menu.categories.flatMap((c) => c.items);
    const expected = file.categories.flatMap((c) => c.items);
    expect(items).toHaveLength(expected.length);
    for (const item of expected) {
      expect(items.find((i) => i.name === item.name)).toMatchObject({
        basePriceCents: item.basePriceCents,
        compareAtPriceCents: item.compareAtPriceCents,
        tags: item.tags,
        isAvailable: item.isAvailable,
        imageUrl: null,
      });
    }
  });

  it('cada ítem trae "Heat level" (1..1, su nivel primero) y "Extras" con la opción agotada marcada', async () => {
    const response = await http().get('/api/menu').set('X-Tenant-Slug', carolina.slug).expect(200);
    const menu = publicMenuSchema.parse(response.body);
    const items = menu.categories.flatMap((c) => c.items);

    const sandwich = items.find((i) => i.name === 'Reaper Tender Sandwich');
    expect(sandwich).toMatchObject({
      basePriceCents: 1290,
      compareAtPriceCents: 1650,
      tags: ['popular', 'hot'],
    });
    const [heat, extras] = sandwich!.modifierGroups;
    expect(heat).toMatchObject({ name: 'Heat level', minSelect: 1, maxSelect: 1 });
    expect(heat!.options.map((o) => o.name)).toEqual(['Hot', 'Mild', 'Medium', 'Reaper']);
    expect(extras).toMatchObject({ name: 'Extras', minSelect: 0, maxSelect: 4 });
    expect(extras!.options.find((o) => o.name === 'Coleslaw')).toMatchObject({
      priceDeltaCents: 120,
      isAvailable: false,
    });

    const box = items.find((i) => i.name === 'Reaper Box');
    expect(box!.modifierGroups[0]!.options[0]!.name).toBe('Reaper');
  });

  it('el menú es por tenant: otro tenant no ve el de Carolina', async () => {
    const response = await http().get('/api/menu').set('X-Tenant-Slug', other.slug).expect(200);
    expect(publicMenuSchema.parse(response.body).categories).toEqual([]);
  });

  it('locationId de otro tenant, inactiva o mal formada da 404/400', async () => {
    await http()
      .get(`/api/menu?locationId=${other.locationId}`)
      .set('X-Tenant-Slug', carolina.slug)
      .expect(404);
    await http()
      .get(`/api/menu?locationId=${carolina.inactiveLocationId}`)
      .set('X-Tenant-Slug', carolina.slug)
      .expect(404);
    await http()
      .get('/api/menu?locationId=no-uuid')
      .set('X-Tenant-Slug', carolina.slug)
      .expect(400);
  });

  it('el import aplica el programa de puntos del archivo (unidades menores de USD)', async () => {
    const response = await http()
      .get('/api/tenant')
      .set('X-Tenant-Slug', carolina.slug)
      .expect(200);
    expect(publicTenantSchema.parse(response.body).rewardProgram).toEqual(file.rewardProgram);
    expect(file.rewardProgram).toMatchObject({
      pointsPerCurrencyUnit: 1,
      redemptionValueCents: 1,
      minPointsToRedeem: 100,
      signupBonusPoints: 50,
    });
  });

  it('cambiar la moneda de un tenant con pedidos se rechaza salvo forceCurrency', async () => {
    const withOrders = await seedTenant(prisma, 'con-pedidos'); // CLP
    await prisma.order.create({
      data: {
        tenantId: withOrders.id,
        locationId: withOrders.locationId,
        code: 'CP-0001',
        status: 'completed',
        fulfillmentType: 'pickup',
        totalCents: 890000,
      },
    });

    await expect(importCarolinaMenu(prisma, withOrders.slug)).rejects.toThrow(/--force-currency/);
    // Nada cambió: la transacción se revirtió entera.
    const before = await prisma.tenant.findUniqueOrThrow({ where: { id: withOrders.id } });
    expect(before.currency).toBe('CLP');
    expect(await prisma.menuItem.count({ where: { tenantId: withOrders.id } })).toBe(0);

    await importCarolinaMenu(prisma, withOrders.slug, { forceCurrency: true });
    const after = await prisma.tenant.findUniqueOrThrow({ where: { id: withOrders.id } });
    expect(after.currency).toBe('USD');
    expect(await prisma.menuItem.count({ where: { tenantId: withOrders.id } })).toBeGreaterThan(0);
  });

  it('reimportar reemplaza el menú sin duplicar', async () => {
    await importCarolinaMenu(prisma, carolina.slug);
    const response = await http().get('/api/menu').set('X-Tenant-Slug', carolina.slug).expect(200);
    const items = publicMenuSchema.parse(response.body).categories.flatMap((c) => c.items);
    expect(items).toHaveLength(file.categories.flatMap((c) => c.items).length);
  });

  it('GET /api/tenant devuelve marca, moneda y programa de puntos', async () => {
    const response = await http()
      .get('/api/tenant')
      .set('X-Tenant-Slug', carolina.slug)
      .expect(200);
    const tenant = publicTenantSchema.parse(response.body);
    expect(tenant).toMatchObject({ slug: carolina.slug, currency: 'USD' });
    expect(tenant.rewardProgram.isEnabled).toBe(true);
  });

  it('GET /api/locations devuelve solo las activas del tenant', async () => {
    const response = await http()
      .get('/api/locations')
      .set('X-Tenant-Slug', carolina.slug)
      .expect(200);
    const locations = locationSchema.array().parse(response.body);
    expect(locations.map((l) => l.id)).toEqual([carolina.locationId]);
  });

  it('tenant inexistente da 404 con el formato uniforme', async () => {
    const response = await http().get('/api/menu').set('X-Tenant-Slug', 'no-existe').expect(404);
    expect(response.body).toMatchObject({ statusCode: 404, error: 'Not Found' });
  });
});
