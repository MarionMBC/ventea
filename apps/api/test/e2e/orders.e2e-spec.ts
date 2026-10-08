import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { orderSchema, publicMenuSchema, type MenuItem, type PublicMenu } from '@ventea/shared';
import request from 'supertest';

import {
  createApp,
  createRawPrisma,
  importCarolinaMenu,
  registerCustomer,
  seedTenant,
  type TestTenant,
} from './helpers';

describe('Pedidos de cliente (AC4, AC5, AC7)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenant: TestTenant;
  let other: TestTenant;
  let menu: PublicMenu;
  let otherMenu: PublicMenu;

  const http = () => request(app.getHttpServer());

  async function fetchMenu(slug: string): Promise<PublicMenu> {
    const response = await http().get('/api/menu').set('X-Tenant-Slug', slug).expect(200);
    return publicMenuSchema.parse(response.body);
  }

  function item(source: PublicMenu, name: string): MenuItem {
    const found = source.categories.flatMap((c) => c.items).find((i) => i.name === name);
    if (!found) throw new Error(`No está "${name}" en el menú`);
    return found;
  }

  function option(menuItem: MenuItem, group: string, name: string): string {
    const found = menuItem.modifierGroups
      .find((g) => g.name === group)
      ?.options.find((o) => o.name === name);
    if (!found) throw new Error(`No está "${group}/${name}" en ${menuItem.name}`);
    return found.id;
  }

  function sandwichLine(quantity = 1, extras: string[] = []) {
    const sandwich = item(menu, 'Reaper Tender Sandwich');
    return {
      menuItemId: sandwich.id,
      quantity,
      selectedOptionIds: [
        option(sandwich, 'Heat level', 'Hot'),
        ...extras.map((e) => option(sandwich, 'Extras', e)),
      ],
    };
  }

  function placeOrder(token: string, body: Record<string, unknown>, slug = tenant.slug) {
    return http()
      .post('/api/orders')
      .set('X-Tenant-Slug', slug)
      .set('Authorization', `Bearer ${token}`)
      .send({ locationId: tenant.locationId, fulfillmentType: 'pickup', ...body });
  }

  async function balanceOf(token: string): Promise<number> {
    const response = await http()
      .get('/api/rewards/balance')
      .set('X-Tenant-Slug', tenant.slug)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (response.body as { balance: number }).balance;
  }

  beforeAll(async () => {
    prisma = createRawPrisma();
    // 50 puntos de bono, 1 punto = 10 centavos, mínimo 5.
    tenant = await seedTenant(prisma, 'orders', {
      signupBonusPoints: 50,
      redemptionValueCents: 10,
    });
    other = await seedTenant(prisma, 'orders-otro');
    await importCarolinaMenu(prisma, tenant.slug, { keepRewardProgram: true });
    await importCarolinaMenu(prisma, other.slug, { keepRewardProgram: true });
    app = await createApp();
    menu = await fetchMenu(tenant.slug);
    otherMenu = await fetchMenu(other.slug);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('AC4 — la API recalcula y valida', () => {
    it('ignora precios enviados y recalcula desde el catálogo', async () => {
      const { accessToken } = await registerCustomer(app, tenant.slug);
      const tea = item(menu, 'Sweet Tea 20 oz');

      const response = await placeOrder(accessToken, {
        subtotalCents: 1,
        totalCents: 1,
        discountCents: 999999,
        lines: [
          { ...sandwichLine(2, ['Pimento cheese']), unitPriceCents: 1, totalCents: 2 },
          {
            menuItemId: tea.id,
            quantity: 1,
            selectedOptionIds: [option(tea, 'Heat level', 'Mild')],
          },
        ],
      }).expect(201);

      const order = orderSchema.parse(response.body);
      expect(order.lines.map((l) => [l.nameSnapshot, l.unitPriceCents, l.totalCents])).toEqual(
        expect.arrayContaining([
          ['Reaper Tender Sandwich', 1290 + 150, (1290 + 150) * 2],
          ['Sweet Tea 20 oz', 320, 320],
        ]),
      );
      expect(order).toMatchObject({
        status: 'confirmed',
        paymentStatus: 'pending',
        fulfillmentType: 'pickup',
        subtotalCents: 2880 + 320,
        discountCents: 0,
        taxCents: 0,
        totalCents: 3200,
        pointsRedeemed: 0,
        pointsEarned: 0,
      });
      expect(order.code).toMatch(/^[A-Z0-9]{1,3}-\d{4}$/);
      const sandwich = order.lines.find((l) => l.nameSnapshot === 'Reaper Tender Sandwich');
      expect(sandwich?.selectedOptions.map((o) => o.nameSnapshot).sort()).toEqual([
        'Hot',
        'Pimento cheese',
      ]);
    });

    it.each([
      [
        'opción inexistente',
        () => ({
          ...sandwichLine(),
          selectedOptionIds: [...sandwichLine().selectedOptionIds, randomUUID()],
        }),
      ],
      [
        'opción de otro tenant',
        () => {
          const foreign = item(otherMenu, 'Reaper Tender Sandwich');
          return { ...sandwichLine(), selectedOptionIds: [option(foreign, 'Heat level', 'Hot')] };
        },
      ],
      ['opción agotada', () => sandwichLine(1, ['Coleslaw'])],
      ['grupo obligatorio sin elegir (min)', () => ({ ...sandwichLine(), selectedOptionIds: [] })],
      [
        'más opciones que el máximo',
        () => {
          const sandwich = item(menu, 'Reaper Tender Sandwich');
          return {
            ...sandwichLine(),
            selectedOptionIds: [
              option(sandwich, 'Heat level', 'Hot'),
              option(sandwich, 'Heat level', 'Mild'),
            ],
          };
        },
      ],
      [
        'ítem de otro tenant',
        () => {
          const foreign = item(otherMenu, 'Reaper Tender Sandwich');
          return {
            menuItemId: foreign.id,
            quantity: 1,
            selectedOptionIds: [option(foreign, 'Heat level', 'Hot')],
          };
        },
      ],
      [
        'ítem no disponible',
        () => {
          const fries = item(menu, 'Loaded Reaper Fries');
          return {
            menuItemId: fries.id,
            quantity: 1,
            selectedOptionIds: [option(fries, 'Heat level', 'Hot')],
          };
        },
      ],
    ])('rechaza con 400: %s', async (_case, buildLine) => {
      const { accessToken } = await registerCustomer(app, tenant.slug);
      const response = await placeOrder(accessToken, { lines: [buildLine()] }).expect(400);
      expect(response.body).toMatchObject({ statusCode: 400, error: 'Bad Request' });
    });

    it('rechaza delivery con 400 "delivery no disponible"', async () => {
      const { accessToken } = await registerCustomer(app, tenant.slug);
      const response = await placeOrder(accessToken, {
        fulfillmentType: 'delivery',
        lines: [sandwichLine()],
      }).expect(400);
      expect(response.body.message).toBe('delivery no disponible');
    });

    it('acepta dine_in', async () => {
      const { accessToken } = await registerCustomer(app, tenant.slug);
      const response = await placeOrder(accessToken, {
        fulfillmentType: 'dine_in',
        lines: [sandwichLine()],
      }).expect(201);
      expect(response.body.fulfillmentType).toBe('dine_in');
    });

    it('rechaza sucursal inactiva o de otro tenant', async () => {
      const { accessToken } = await registerCustomer(app, tenant.slug);
      await placeOrder(accessToken, {
        locationId: tenant.inactiveLocationId,
        lines: [sandwichLine()],
      }).expect(400);
      await placeOrder(accessToken, {
        locationId: other.locationId,
        lines: [sandwichLine()],
      }).expect(400);
    });

    it('rechaza scheduledFor en el pasado', async () => {
      const { accessToken } = await registerCustomer(app, tenant.slug);
      const response = await placeOrder(accessToken, {
        lines: [sandwichLine()],
        scheduledFor: new Date(Date.now() - 60_000).toISOString(),
      }).expect(400);
      expect(response.body.issues).toEqual([expect.objectContaining({ path: 'scheduledFor' })]);
    });

    it('token válido de un cliente que ya no existe da 401, no 500', async () => {
      const { accessToken, customer } = await registerCustomer(app, tenant.slug);
      await prisma.customer.delete({ where: { id: customer.id } });
      await placeOrder(accessToken, { lines: [sandwichLine()] }).expect(401);
    });

    it('exige sesión', async () => {
      await http()
        .post('/api/orders')
        .set('X-Tenant-Slug', tenant.slug)
        .send({ locationId: tenant.locationId, fulfillmentType: 'pickup', lines: [sandwichLine()] })
        .expect(401);
    });
  });

  describe('AC5 — canje de puntos atómico', () => {
    it('descuenta saldo y precio en el mismo pedido', async () => {
      const { accessToken } = await registerCustomer(app, tenant.slug);
      expect(await balanceOf(accessToken)).toBe(50);

      const response = await placeOrder(accessToken, {
        lines: [sandwichLine()],
        redeemRewardPoints: 20,
      }).expect(201);
      const order = orderSchema.parse(response.body);

      expect(order).toMatchObject({
        subtotalCents: 1290,
        discountCents: 200,
        totalCents: 1090,
        pointsRedeemed: 20,
      });
      expect(await balanceOf(accessToken)).toBe(30);

      const ledger = await http()
        .get('/api/rewards/ledger')
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(ledger.body[0]).toMatchObject({
        points: -20,
        reason: 'redemption',
        orderId: order.id,
      });
    });

    it('un canje mayor al saldo da 400 y no crea pedido ni toca el saldo', async () => {
      const { accessToken, customer } = await registerCustomer(app, tenant.slug);
      const response = await placeOrder(accessToken, {
        lines: [sandwichLine()],
        redeemRewardPoints: 51,
      }).expect(400);
      expect(response.body.message).toBe('Saldo de puntos insuficiente');
      expect(await balanceOf(accessToken)).toBe(50);
      expect(
        await prisma.order.count({ where: { tenantId: tenant.id, customerId: customer.id } }),
      ).toBe(0);
    });

    it('un canje bajo el mínimo da 400', async () => {
      const { accessToken } = await registerCustomer(app, tenant.slug);
      await placeOrder(accessToken, { lines: [sandwichLine()], redeemRewardPoints: 4 }).expect(400);
    });

    it('el descuento no supera el subtotal y solo debita los puntos necesarios', async () => {
      const { accessToken } = await registerCustomer(app, tenant.slug);
      const sauce = item(menu, 'Comeback Sauce'); // 75 centavos
      const response = await placeOrder(accessToken, {
        lines: [
          {
            menuItemId: sauce.id,
            quantity: 1,
            selectedOptionIds: [option(sauce, 'Heat level', 'Mild')],
          },
        ],
        redeemRewardPoints: 50,
      }).expect(201);
      expect(response.body).toMatchObject({
        subtotalCents: 75,
        discountCents: 75,
        totalCents: 0,
        pointsRedeemed: 8,
      });
      expect(await balanceOf(accessToken)).toBe(42);
    });

    it('dos pedidos simultáneos no gastan el mismo saldo', async () => {
      const { accessToken } = await registerCustomer(app, tenant.slug);
      const results = await Promise.all(
        [1, 2].map(() =>
          placeOrder(accessToken, { lines: [sandwichLine()], redeemRewardPoints: 30 }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
      expect(await balanceOf(accessToken)).toBe(20);
    });
  });

  describe('AC7 — el cliente solo ve sus pedidos', () => {
    it('404 en pedidos ajenos; la lista trae solo los propios, el más reciente primero', async () => {
      const ana = await registerCustomer(app, tenant.slug);
      const beto = await registerCustomer(app, tenant.slug);

      const first = (await placeOrder(ana.accessToken, { lines: [sandwichLine()] }).expect(201))
        .body as { id: string };
      const second = (await placeOrder(ana.accessToken, { lines: [sandwichLine()] }).expect(201))
        .body as { id: string };

      const own = await http()
        .get(`/api/orders/${first.id}`)
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${ana.accessToken}`)
        .expect(200);
      expect(orderSchema.parse(own.body).id).toBe(first.id);

      await http()
        .get(`/api/orders/${first.id}`)
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${beto.accessToken}`)
        .expect(404);
      await http()
        .post(`/api/orders/${first.id}/cancel`)
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${beto.accessToken}`)
        .expect(404);

      const anaList = await http()
        .get('/api/orders')
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${ana.accessToken}`)
        .expect(200);
      expect(
        orderSchema
          .array()
          .parse(anaList.body)
          .map((o) => o.id),
      ).toEqual([second.id, first.id]);

      const betoList = await http()
        .get('/api/orders')
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${beto.accessToken}`)
        .expect(200);
      expect(betoList.body).toEqual([]);
    });

    it('el cliente cancela un pedido confirmed (devuelve el canje); cancelar otra vez da 409', async () => {
      const { accessToken } = await registerCustomer(app, tenant.slug);
      const order = (
        await placeOrder(accessToken, { lines: [sandwichLine()], redeemRewardPoints: 10 }).expect(
          201,
        )
      ).body as { id: string };
      expect(await balanceOf(accessToken)).toBe(40);

      const cancelled = await http()
        .post(`/api/orders/${order.id}/cancel`)
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(cancelled.body.status).toBe('cancelled');
      expect(await balanceOf(accessToken)).toBe(50);

      await http()
        .post(`/api/orders/${order.id}/cancel`)
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(409);
    });
  });
});
