import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { CustomerAuthResponse, StaffAuthResponse } from '@ventea/shared';
import argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { importMenu, type MenuImportOptions } from '@/modules/catalog/menu-import';

export const STAFF_PASSWORD = 'staff-password-123';
export const CUSTOMER_PASSWORD = 'customer-password-123';

/** La app completa, configurada como en main.ts (prefijo `api`). */
export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

/** Cliente crudo para preparar datos (como la semilla): sin el guard de tenant. */
export function createRawPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Falta DATABASE_URL (test/e2e/env.cjs)');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export interface TestTenant {
  id: string;
  slug: string;
  locationId: string;
  inactiveLocationId: string;
  staffEmail: string;
}

/**
 * Un tenant con branding, programa de puntos activo, una sucursal activa, otra
 * inactiva y un dueño. Slug con sufijo aleatorio: cada archivo de test arma los suyos.
 */
export async function seedTenant(
  prisma: PrismaClient,
  base: string,
  program: Partial<{
    pointsPerCurrencyUnit: number;
    redemptionValueCents: number;
    minPointsToRedeem: number;
    signupBonusPoints: number;
  }> = {},
): Promise<TestTenant> {
  const slug = `${base}-${randomUUID().slice(0, 8)}`;
  const staffEmail = `owner@${slug}.test`;
  // Como la migración y create-tenant: toda marca nace con suscripción activa.
  const chain = await prisma.plan.findUniqueOrThrow({ where: { code: 'chain' } });
  const now = new Date();

  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: `Tenant ${base}`,
      currency: 'CLP',
      branding: { create: { primaryColor: '#E23B2E', appDisplayName: `App ${base}` } },
      rewardProgram: {
        create: {
          isEnabled: true,
          pointsPerCurrencyUnit: program.pointsPerCurrencyUnit ?? 1,
          redemptionValueCents: program.redemptionValueCents ?? 10,
          minPointsToRedeem: program.minPointsToRedeem ?? 5,
          signupBonusPoints: program.signupBonusPoints ?? 50,
        },
      },
      staff: {
        create: {
          email: staffEmail,
          passwordHash: await argon2.hash(STAFF_PASSWORD),
          name: 'Dueño',
          role: 'owner',
        },
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
      name: 'Sucursal Centro',
      address: 'Av. Principal 123',
      latitude: -33.4,
      longitude: -70.6,
      openingHours: [{ day: 1, opens: '12:00', closes: '22:00' }],
    },
  });
  const inactive = await prisma.location.create({
    data: {
      tenantId: tenant.id,
      name: 'Sucursal Cerrada',
      address: 'Calle 1',
      latitude: 0,
      longitude: 0,
      isActive: false,
    },
  });

  return {
    id: tenant.id,
    slug,
    locationId: location.id,
    inactiveLocationId: inactive.id,
    staffEmail,
  };
}

export const CAROLINA_MENU_FILE = fileURLToPath(
  new URL('../../prisma/data/carolina-menu.json', import.meta.url),
);

/**
 * Importa el menú real de Carolina. `keepRewardProgram` quita el bloque
 * `rewardProgram` del archivo para conservar el programa con que se sembró el tenant
 * (las suites de pedidos usan valores chicos para que las cuentas se lean fácil).
 */
export async function importCarolinaMenu(
  prisma: PrismaClient,
  slug: string,
  options: MenuImportOptions & { keepRewardProgram?: boolean } = {},
): Promise<void> {
  const { keepRewardProgram, ...importOptions } = options;
  const data = JSON.parse(await readFile(CAROLINA_MENU_FILE, 'utf8')) as Record<string, unknown>;
  if (keepRewardProgram) delete data.rewardProgram;
  await importMenu(prisma, slug, data, importOptions);
}

export async function registerCustomer(
  app: INestApplication,
  slug: string,
  overrides: Partial<{ email: string; password: string }> = {},
): Promise<CustomerAuthResponse> {
  const response = await request(app.getHttpServer())
    .post('/api/auth/register')
    .set('X-Tenant-Slug', slug)
    .send({
      email: overrides.email ?? `cliente-${randomUUID().slice(0, 8)}@example.com`,
      password: overrides.password ?? CUSTOMER_PASSWORD,
      firstName: 'Ana',
      lastName: 'Pérez',
    })
    .expect(201);
  return response.body as CustomerAuthResponse;
}

export async function loginStaff(
  app: INestApplication,
  tenant: TestTenant,
): Promise<StaffAuthResponse> {
  const response = await request(app.getHttpServer())
    .post('/api/staff/auth/login')
    .set('X-Tenant-Slug', tenant.slug)
    .send({ email: tenant.staffEmail, password: STAFF_PASSWORD })
    .expect(200);
  return response.body as StaffAuthResponse;
}
