import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { MediaUploadResponse, MenuChange, Order, PublicMenu, StaffMenu } from '@ventea/shared';
import sharp from 'sharp';
import request from 'supertest';

import {
  createApp,
  createRawPrisma,
  createStaffMember,
  loginStaff,
  loginStaffAs,
  registerCustomer,
  seedTenant,
  type TestTenant,
} from './helpers';

describe('Gestión del menú desde el panel (TASK-016)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenant: TestTenant;
  let other: TestTenant;
  let owner: string;
  let manager: string;
  let staff: string;
  let otherOwner: string;

  const as = (token: string, slug = tenant.slug) => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('X-Tenant-Slug', slug)
        .set('Authorization', `Bearer ${token}`),
    post: (url: string, body?: object) =>
      request(app.getHttpServer())
        .post(url)
        .set('X-Tenant-Slug', slug)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
    patch: (url: string, body: object) =>
      request(app.getHttpServer())
        .patch(url)
        .set('X-Tenant-Slug', slug)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
    delete: (url: string) =>
      request(app.getHttpServer())
        .delete(url)
        .set('X-Tenant-Slug', slug)
        .set('Authorization', `Bearer ${token}`),
  });

  async function uploadImage(token: string, slug: string, size: number): Promise<string> {
    const png = await sharp({
      create: { width: size, height: size, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();
    const response = await request(app.getHttpServer())
      .post('/api/staff/media')
      .set('X-Tenant-Slug', slug)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', png, { filename: 'p.png', contentType: 'image/png' })
      .expect(201);
    return (response.body as MediaUploadResponse).url;
  }

  const publicMenu = async (): Promise<PublicMenu> =>
    (
      await request(app.getHttpServer())
        .get('/api/menu')
        .set('X-Tenant-Slug', tenant.slug)
        .expect(200)
    ).body as PublicMenu;
  const tree = async (): Promise<StaffMenu> =>
    (await as(staff).get('/api/staff/menu').expect(200)).body as StaffMenu;

  beforeAll(async () => {
    app = await createApp();
    prisma = createRawPrisma();
    tenant = await seedTenant(prisma, 'menu-admin');
    other = await seedTenant(prisma, 'menu-admin-otra');
    owner = (await loginStaff(app, tenant)).accessToken;
    otherOwner = (await loginStaff(app, other)).accessToken;
    manager = await loginStaffAs(app, tenant, await createStaffMember(prisma, tenant, 'manager'));
    staff = await loginStaffAs(app, tenant, await createStaffMember(prisma, tenant, 'staff'));
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('permisos', () => {
    it('sin sesión 401; staff lee pero no escribe (403); manager escribe', async () => {
      await request(app.getHttpServer())
        .get('/api/staff/menu')
        .set('X-Tenant-Slug', tenant.slug)
        .expect(401);
      await as(staff).get('/api/staff/menu').expect(200);
      await as(staff).post('/api/staff/menu/categories', { name: 'X' }).expect(403);
      await as(staff).get('/api/staff/menu/changes').expect(403);
      await as(manager).post('/api/staff/menu/categories', { name: 'Del manager' }).expect(201);
    });
  });

  describe('flujo completo: categoría, grupo, ítem con foto, público', () => {
    let categoryId: string;
    let groupId: string;
    let itemId: string;
    let imageUrl: string;

    it('crea, edita y lo muestra en el menú público con URL absoluta', async () => {
      categoryId = (
        (await as(owner).post('/api/staff/menu/categories', { name: ' Pollos ' }).expect(201))
          .body as { id: string }
      ).id;
      groupId = (
        (
          await as(owner)
            .post('/api/staff/menu/modifier-groups', {
              name: 'Picante',
              minSelect: 1,
              maxSelect: 1,
              options: [{ name: 'Suave' }, { name: 'Extra', priceDeltaCents: 150 }],
            })
            .expect(201)
        ).body as { id: string }
      ).id;
      imageUrl = await uploadImage(owner, tenant.slug, 120);

      itemId = (
        (
          await as(manager)
            .post('/api/staff/menu/items', {
              categoryId,
              name: 'Tenders',
              basePriceCents: 1000,
              compareAtPriceCents: 1200,
              tags: ['Popular', 'popular', 'hot'],
              imageUrl,
              modifierGroupIds: [groupId],
            })
            .expect(201)
        ).body as { id: string }
      ).id;

      const menu = await publicMenu();
      const category = menu.categories.find((c) => c.id === categoryId)!;
      expect(category.name).toBe('Pollos');
      const item = category.items.find((i) => i.id === itemId)!;
      expect(new URL(item.imageUrl!).pathname).toBe(new URL(imageUrl).pathname);
      expect(item.imageUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api\/media\//);
      expect(item.tags).toEqual(['popular', 'hot']);
      expect(item.modifierGroups.map((g) => g.options.map((o) => o.name))).toEqual([
        ['Suave', 'Extra'],
      ]);

      // La foto que muestra el menú se sirve.
      await request(app.getHttpServer()).get(new URL(item.imageUrl!).pathname).expect(200);
      // Se guarda la ruta, no el host.
      const row = await prisma.menuItem.findUniqueOrThrow({ where: { id: itemId } });
      expect(row.imageUrl).toMatch(/^\/api\/media\//);
    });

    it('PATCH parcial, quitar foto, cambiar grupos; disponibilidad rápida', async () => {
      await as(owner)
        .patch(`/api/staff/menu/items/${itemId}`, {
          description: 'Crujientes',
          imageUrl: null,
          modifierGroupIds: [],
        })
        .expect(204);
      await as(owner)
        .patch(`/api/staff/menu/items/${itemId}/availability`, { isAvailable: false })
        .expect(204);
      const item = (await publicMenu()).categories
        .flatMap((c) => c.items)
        .find((i) => i.id === itemId)!;
      expect(item).toMatchObject({
        description: 'Crujientes',
        imageUrl: null,
        isAvailable: false,
        modifierGroups: [],
      });
      await as(owner)
        .patch(`/api/staff/menu/items/${itemId}`, { imageUrl, modifierGroupIds: [groupId] })
        .expect(204);
    });

    it('una categoría inactiva sale del público pero no del panel', async () => {
      await as(owner)
        .patch(`/api/staff/menu/categories/${categoryId}`, { isActive: false })
        .expect(204);
      expect((await publicMenu()).categories.some((c) => c.id === categoryId)).toBe(false);
      const inPanel = (await tree()).categories.find((c) => c.id === categoryId)!;
      expect(inPanel.isActive).toBe(false);
      expect(inPanel.items[0]!.modifierGroupIds).toEqual([groupId]);
      expect((await tree()).modifierGroups.find((g) => g.id === groupId)!.itemCount).toBe(1);
      await as(owner)
        .patch(`/api/staff/menu/categories/${categoryId}`, { isActive: true })
        .expect(204);
    });

    it('opciones: crear, editar, reordenar, borrar', async () => {
      const optionId = (
        (
          await as(owner)
            .post(`/api/staff/menu/modifier-groups/${groupId}/options`, {
              name: 'Medio',
              priceDeltaCents: -50,
            })
            .expect(201)
        ).body as { id: string }
      ).id;
      await as(owner)
        .patch(`/api/staff/menu/modifier-options/${optionId}`, { isAvailable: false })
        .expect(204);
      const group = (await tree()).modifierGroups.find((g) => g.id === groupId)!;
      const ids = group.options.map((o) => o.id);
      await as(owner)
        .patch(`/api/staff/menu/modifier-groups/${groupId}/options/reorder`, {
          items: [...ids].reverse().map((id, sortOrder) => ({ id, sortOrder })),
        })
        .expect(204);
      const reordered = (await tree()).modifierGroups.find((g) => g.id === groupId)!;
      expect(reordered.options.map((o) => o.id)).toEqual([...ids].reverse());
      expect(reordered.options.find((o) => o.id === optionId)!.isAvailable).toBe(false);
      await as(owner).delete(`/api/staff/menu/modifier-options/${optionId}`).expect(204);
      await as(owner).delete(`/api/staff/menu/modifier-options/${optionId}`).expect(404);
    });

    it('reordenar categorías e ítems', async () => {
      const second = (
        (await as(owner).post('/api/staff/menu/categories', { name: 'Bebidas' }).expect(201))
          .body as { id: string }
      ).id;
      await as(owner)
        .patch('/api/staff/menu/categories/reorder', {
          items: [
            { id: second, sortOrder: 0 },
            { id: categoryId, sortOrder: 1 },
          ],
        })
        .expect(204);
      const order = (await tree()).categories.map((c) => c.id);
      expect(order.indexOf(second)).toBeLessThan(order.indexOf(categoryId));

      const another = (
        (
          await as(owner)
            .post('/api/staff/menu/items', { categoryId, name: 'Alitas', basePriceCents: 800 })
            .expect(201)
        ).body as { id: string }
      ).id;
      await as(owner)
        .patch('/api/staff/menu/items/reorder', {
          items: [
            { id: another, sortOrder: 0 },
            { id: itemId, sortOrder: 5 },
          ],
        })
        .expect(204);
      const items = (await tree()).categories
        .find((c) => c.id === categoryId)!
        .items.map((i) => i.id);
      expect(items).toEqual([another, itemId]);
    });

    it('categoría con productos → 409', async () => {
      const response = await as(owner)
        .delete(`/api/staff/menu/categories/${categoryId}`)
        .expect(409);
      expect((response.body as { message: string }).message).toMatch(/2 productos/);
    });

    it('ítem con pedidos → soft-delete: sale del menú, el pedido no cambia, no se puede pedir', async () => {
      await as(owner)
        .patch(`/api/staff/menu/items/${itemId}/availability`, { isAvailable: true })
        .expect(204);
      const customer = await registerCustomer(app, tenant.slug);
      const groupOptions = (await tree()).modifierGroups.find((g) => g.id === groupId)!.options;
      const order = (
        await request(app.getHttpServer())
          .post('/api/orders')
          .set('X-Tenant-Slug', tenant.slug)
          .set('Authorization', `Bearer ${customer.accessToken}`)
          .send({
            locationId: tenant.locationId,
            fulfillmentType: 'pickup',
            lines: [{ menuItemId: itemId, quantity: 1, selectedOptionIds: [groupOptions[0]!.id] }],
          })
          .expect(201)
      ).body as Order;

      const deleted = await as(owner).delete(`/api/staff/menu/items/${itemId}`).expect(200);
      expect(deleted.body).toEqual({ deleted: 'soft' });
      expect(
        (await publicMenu()).categories.flatMap((c) => c.items).some((i) => i.id === itemId),
      ).toBe(false);
      expect((await tree()).categories.flatMap((c) => c.items).some((i) => i.id === itemId)).toBe(
        false,
      );

      const again = await request(app.getHttpServer())
        .get(`/api/orders/${order.id}`)
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .expect(200);
      expect((again.body as Order).lines[0]!.nameSnapshot).toBe('Tenders');

      await request(app.getHttpServer())
        .post('/api/orders')
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({
          locationId: tenant.locationId,
          fulfillmentType: 'pickup',
          lines: [{ menuItemId: itemId, quantity: 1 }],
        })
        .expect(400);
      // Editar o borrar de nuevo un ítem borrado: 404.
      await as(owner).patch(`/api/staff/menu/items/${itemId}`, { name: 'X' }).expect(404);
      await as(owner).delete(`/api/staff/menu/items/${itemId}`).expect(404);
    });

    it('ítem sin pedidos → borrado real; categoría solo con borrados → soft', async () => {
      const items = (await tree()).categories.find((c) => c.id === categoryId)!.items;
      for (const item of items) {
        const response = await as(owner).delete(`/api/staff/menu/items/${item.id}`).expect(200);
        expect(response.body).toEqual({ deleted: 'hard' });
        expect(await prisma.menuItem.count({ where: { id: item.id } })).toBe(0);
      }
      await as(owner).delete(`/api/staff/menu/categories/${categoryId}`).expect(204);
      const row = await prisma.menuCategory.findUniqueOrThrow({ where: { id: categoryId } });
      expect(row.deletedAt).not.toBeNull();
      expect((await tree()).categories.some((c) => c.id === categoryId)).toBe(false);
    });

    it('borrar un grupo lo quita de los ítems', async () => {
      const cat = (
        (await as(owner).post('/api/staff/menu/categories', { name: 'Combos' }).expect(201))
          .body as { id: string }
      ).id;
      const item = (
        (
          await as(owner)
            .post('/api/staff/menu/items', {
              categoryId: cat,
              name: 'Combo 1',
              basePriceCents: 2000,
              modifierGroupIds: [groupId],
            })
            .expect(201)
        ).body as { id: string }
      ).id;
      await as(owner).delete(`/api/staff/menu/modifier-groups/${groupId}`).expect(204);
      const found = (await tree()).categories.flatMap((c) => c.items).find((i) => i.id === item)!;
      expect(found.modifierGroupIds).toEqual([]);
      // Categoría vacía sin historia: borrado real.
      await as(owner).delete(`/api/staff/menu/items/${item}`).expect(200);
      await as(owner).delete(`/api/staff/menu/categories/${cat}`).expect(204);
      expect(await prisma.menuCategory.count({ where: { id: cat } })).toBe(0);
    });

    it('auditoría: quién, qué y cuándo', async () => {
      const changes = (await as(owner).get('/api/staff/menu/changes?limit=200').expect(200))
        .body as MenuChange[];
      const actions = new Set(changes.map((c) => `${c.entity}:${c.action}`));
      for (const expected of [
        'category:create',
        'category:update',
        'category:reorder',
        'category:soft_delete',
        'category:delete',
        'item:create',
        'item:update',
        'item:availability',
        'item:soft_delete',
        'item:delete',
        'item:reorder',
        'modifier_group:create',
        'modifier_group:delete',
        'modifier_option:create',
        'modifier_option:reorder',
      ]) {
        expect(actions).toContain(expected);
      }
      const staffIds = new Set(changes.map((c) => c.staffId));
      expect(staffIds.size).toBe(2); // dueño y manager
      expect(await prisma.menuChange.count({ where: { tenantId: other.id } })).toBe(0);
    });
  });

  describe('validación', () => {
    let categoryId: string;
    beforeAll(async () => {
      categoryId = (
        (await as(owner).post('/api/staff/menu/categories', { name: 'Validación' }).expect(201))
          .body as { id: string }
      ).id;
    });

    it.each([
      [{ name: 'X', basePriceCents: -1 }, 'precio negativo'],
      [{ name: '   ', basePriceCents: 100 }, 'nombre vacío'],
      [{ basePriceCents: 100 }, 'sin nombre'],
      [{ name: 'X', basePriceCents: 1.5 }, 'centavos no enteros'],
      [{ name: 'X', basePriceCents: 100, compareAtPriceCents: 100 }, 'precio anterior no mayor'],
      [{ name: 'X', basePriceCents: 100, isDeleted: true }, 'campo desconocido'],
      [
        { name: 'X', basePriceCents: 100, imageUrl: 'https://evil.example/x.png' },
        'imagen externa',
      ],
      [
        {
          name: 'X',
          basePriceCents: 100,
          modifierGroupIds: ['00000000-0000-4000-8000-000000000000'],
        },
        'grupo inexistente',
      ],
    ])('ítem inválido → 400 (%s)', async (body: object, _label: string) => {
      await as(owner)
        .post('/api/staff/menu/items', { categoryId, ...body })
        .expect(400);
    });

    it('grupo con minSelect > maxSelect → 400 (alta y edición)', async () => {
      await as(owner)
        .post('/api/staff/menu/modifier-groups', { name: 'G', minSelect: 3, maxSelect: 1 })
        .expect(400);
      const id = (
        (
          await as(owner)
            .post('/api/staff/menu/modifier-groups', { name: 'G', minSelect: 0, maxSelect: 2 })
            .expect(201)
        ).body as { id: string }
      ).id;
      await as(owner).patch(`/api/staff/menu/modifier-groups/${id}`, { minSelect: 3 }).expect(400);
    });

    it('PATCH vacío o id inválido → 400', async () => {
      await as(owner).patch(`/api/staff/menu/categories/${categoryId}`, {}).expect(400);
      await as(owner).patch('/api/staff/menu/categories/no-es-uuid', { name: 'X' }).expect(400);
    });
  });

  describe('aislamiento entre marcas', () => {
    let foreignItem: string;
    let foreignCategory: string;
    let foreignGroup: string;
    let foreignImage: string;

    beforeAll(async () => {
      foreignCategory = (
        (
          await as(otherOwner, other.slug)
            .post('/api/staff/menu/categories', { name: 'Ajena' })
            .expect(201)
        ).body as { id: string }
      ).id;
      foreignGroup = (
        (
          await as(otherOwner, other.slug)
            .post('/api/staff/menu/modifier-groups', { name: 'Ajeno' })
            .expect(201)
        ).body as { id: string }
      ).id;
      foreignItem = (
        (
          await as(otherOwner, other.slug)
            .post('/api/staff/menu/items', {
              categoryId: foreignCategory,
              name: 'Ajeno',
              basePriceCents: 100,
            })
            .expect(201)
        ).body as { id: string }
      ).id;
      foreignImage = await uploadImage(otherOwner, other.slug, 90);
    });

    it('no ve ni toca lo de otra marca (404/400)', async () => {
      expect((await tree()).categories.some((c) => c.id === foreignCategory)).toBe(false);
      await as(owner).patch(`/api/staff/menu/items/${foreignItem}`, { name: 'Robado' }).expect(404);
      await as(owner).delete(`/api/staff/menu/items/${foreignItem}`).expect(404);
      await as(owner)
        .patch(`/api/staff/menu/categories/${foreignCategory}`, { name: 'X' })
        .expect(404);
      await as(owner).delete(`/api/staff/menu/modifier-groups/${foreignGroup}`).expect(404);
      await as(owner)
        .patch('/api/staff/menu/categories/reorder', {
          items: [{ id: foreignCategory, sortOrder: 0 }],
        })
        .expect(400);
      await as(owner)
        .post('/api/staff/menu/items', {
          categoryId: foreignCategory,
          name: 'X',
          basePriceCents: 1,
        })
        .expect(400);
      const mine = (
        (await as(owner).post('/api/staff/menu/categories', { name: 'Mía' }).expect(201)).body as {
          id: string;
        }
      ).id;
      await as(owner)
        .post('/api/staff/menu/items', {
          categoryId: mine,
          name: 'X',
          basePriceCents: 1,
          modifierGroupIds: [foreignGroup],
        })
        .expect(400);
      expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: foreignItem } })).name).toBe(
        'Ajeno',
      );
    });

    it('imagen de otra marca → 400 aunque la URL sea válida', async () => {
      const category = (await tree()).categories[0]!;
      const response = await as(owner)
        .post('/api/staff/menu/items', {
          categoryId: category.id,
          name: 'Foto ajena',
          basePriceCents: 100,
          imageUrl: foreignImage,
        })
        .expect(400);
      expect((response.body as { message: string }).message).toMatch(/no pertenece a esta marca/);
      // Hash propio con el tenantId de la ruta cambiado: tampoco.
      const ownImage = await uploadImage(owner, tenant.slug, 91);
      const tampered = ownImage.replace(tenant.id, other.id);
      await as(owner)
        .post('/api/staff/menu/items', {
          categoryId: category.id,
          name: 'Foto',
          basePriceCents: 100,
          imageUrl: tampered,
        })
        .expect(400);
    });
  });
});
