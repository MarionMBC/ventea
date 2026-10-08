/**
 * Semilla de desarrollo.
 *
 * Crea DOS tenants a propósito: Carolina Hot Chicken (el cliente real) y un
 * segundo tenant de prueba. Con un solo tenant en la base, un bug de aislamiento
 * es invisible — todo "funciona" porque no hay con qué mezclarse.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_REWARD_PROGRAM } from '@ventea/shared';
import argon2 from 'argon2';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Falta DATABASE_URL');

// La semilla usa el cliente crudo, sin el guard de tenant: es el unico lugar
// que legitimamente crea filas antes de que exista un tenant al cual filtrar.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function seedTenant(input: {
  slug: string;
  name: string;
  currency: string;
  primaryColor: string;
  locationName: string;
  address: string;
  latitude: number;
  longitude: number;
}): Promise<void> {
  // Suscripción activa: sin ella el tenant funciona igual (el middleware falla abierto),
  // pero el panel de plataforma lo mostraría sin plan.
  const chain = await prisma.plan.findUniqueOrThrow({ where: { code: 'chain' } });
  const now = new Date();

  const tenant = await prisma.tenant.upsert({
    where: { slug: input.slug },
    update: {},
    create: {
      slug: input.slug,
      name: input.name,
      currency: input.currency,
      branding: { create: { primaryColor: input.primaryColor, appDisplayName: input.name } },
      rewardProgram: {
        create: { ...DEFAULT_REWARD_PROGRAM },
      },
      subscription: {
        create: {
          planId: chain.id,
          interval: 'year',
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
        },
      },
    },
  });

  const location = await prisma.location.create({
    data: {
      tenantId: tenant.id,
      name: input.locationName,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      openingHours: [
        { day: 1, opens: '12:00', closes: '22:00' },
        { day: 2, opens: '12:00', closes: '22:00' },
        { day: 3, opens: '12:00', closes: '22:00' },
        { day: 4, opens: '12:00', closes: '23:00' },
        { day: 5, opens: '12:00', closes: '23:30' },
        { day: 6, opens: '12:00', closes: '23:30' },
      ],
    },
  });

  const category = await prisma.menuCategory.create({
    data: { tenantId: tenant.id, name: 'Sándwiches', sortOrder: 0 },
  });

  await prisma.menuItem.create({
    data: {
      tenantId: tenant.id,
      categoryId: category.id,
      name: 'Hot Chicken Clásico',
      description: 'Pollo frito picante, pickles, salsa de la casa.',
      basePriceCents: 890000,
      sortOrder: 0,
    },
  });

  await prisma.staffMember.create({
    data: {
      tenantId: tenant.id,
      email: `owner@${input.slug}.test`,
      passwordHash: await argon2.hash('devpassword'),
      name: `Dueño ${input.name}`,
      role: 'owner',
    },
  });

  // eslint-disable-next-line no-console
  console.log(`✓ tenant ${input.slug} (sucursal ${location.name})`);
}

async function main(): Promise<void> {
  await seedTenant({
    slug: 'carolina-hot-chicken',
    name: 'Carolina Hot Chicken',
    currency: 'CLP',
    primaryColor: '#E23B2E',
    locationName: 'Sucursal Centro',
    address: 'Av. Principal 123',
    latitude: -33.4489,
    longitude: -70.6693,
  });

  // Tenant de control: existe para que los tests de aislamiento tengan con qué comparar.
  await seedTenant({
    slug: 'demo-burgers',
    name: 'Demo Burgers',
    currency: 'CLP',
    primaryColor: '#2E6FE2',
    locationName: 'Sucursal Demo',
    address: 'Calle Falsa 742',
    latitude: -33.4372,
    longitude: -70.6506,
  });
}

main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
