/**
 * Alta de un tenant nuevo: la marca, su branding, su programa de puntos, una
 * sucursal y el usuario dueño.
 *
 *   node apps/api/dist/scripts/create-tenant.js \
 *     --slug pollos-juan --name "Pollos Juan" --owner-email juan@pollosjuan.com \
 *     [--currency HNL] [--color "#E23B2E"] [--location "Sucursal Centro"] [--address "..."]
 *     [--plan basic|pro|chain] [--interval month|year] [--region hn-1]
 *
 * En TENANT_MODE=multi el slug ES el subdominio: el tenant queda accesible en
 * `<slug>.<TENANT_BASE_DOMAIN>` en cuanto el cron de rutas publica su certificado
 * (≤ 2 min en la VPS de prueba, ver deploy/test-vps/README.md).
 *
 * Crea la suscripción `active` (plan `chain` anual por defecto): las marcas que da de
 * alta operación no pasan por la prueba del registro self-service. El período corre
 * desde hoy.
 *
 * La contraseña del dueño se genera acá y se imprime UNA vez; no se guarda en
 * ningún otro lado.
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {
  BILLING_INTERVAL,
  DEFAULT_REWARD_PROGRAM,
  isReservedTenantSlug,
  PLAN_CODE,
  tenantSlugSchema,
  type BillingInterval,
  type PlanCode,
} from '@ventea/shared';
import argon2 from 'argon2';

import { periodEnd } from '../modules/subscriptions/subscription-state';

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      slug: { type: 'string' },
      name: { type: 'string' },
      'owner-email': { type: 'string' },
      currency: { type: 'string', default: 'HNL' },
      color: { type: 'string', default: '#E23B2E' },
      location: { type: 'string', default: 'Sucursal Principal' },
      address: { type: 'string', default: 'Por definir' },
      plan: { type: 'string', default: 'chain' },
      interval: { type: 'string', default: 'year' },
      region: { type: 'string', default: 'hn-1' },
    },
  });

  if (!values.slug || !values.name || !values['owner-email']) {
    fail('Uso: create-tenant --slug <slug> --name "<nombre>" --owner-email <email>');
  }

  const slug = tenantSlugSchema.safeParse(values.slug);
  if (!slug.success) fail(slug.error.issues[0]?.message ?? 'slug inválido');
  if (isReservedTenantSlug(slug.data)) fail(`"${slug.data}" es un subdominio reservado`);
  if (!/^[A-Z]{3}$/.test(values.currency))
    fail('currency: código ISO 4217 de 3 letras (HNL, USD…)');
  if (!(PLAN_CODE as readonly string[]).includes(values.plan)) {
    fail(`plan: uno de ${PLAN_CODE.join(', ')}`);
  }
  if (!(BILLING_INTERVAL as readonly string[]).includes(values.interval)) {
    fail(`interval: uno de ${BILLING_INTERVAL.join(', ')}`);
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(values.region)) fail('region: código como hn-1');
  const planCode = values.plan as PlanCode;
  const interval = values.interval as BillingInterval;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) fail('Falta DATABASE_URL');

  // Cliente crudo, sin el guard de tenant: como la semilla, es el único lugar que
  // crea filas antes de que exista un tenant al cual filtrar.
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    if (await prisma.tenant.findUnique({ where: { slug: slug.data }, select: { id: true } })) {
      fail(`Ya existe un tenant con slug "${slug.data}"`);
    }

    const plan = await prisma.plan.findUnique({
      where: { code: planCode },
      select: { id: true },
    });
    if (!plan) fail(`No existe el plan "${planCode}": ¿corrió prisma migrate deploy?`);

    const password = randomBytes(12).toString('base64url');
    const now = new Date();

    const tenant = await prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          slug: slug.data,
          name: values.name!,
          currency: values.currency,
          branding: { create: { primaryColor: values.color, appDisplayName: values.name! } },
          rewardProgram: {
            create: { ...DEFAULT_REWARD_PROGRAM },
          },
          region: values.region,
          createdVia: 'script',
          subscription: {
            create: {
              planId: plan.id,
              interval,
              status: 'active',
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd(now, interval),
            },
          },
        },
      });

      await tx.location.create({
        data: {
          tenantId: created.id,
          name: values.location,
          address: values.address,
          latitude: 0,
          longitude: 0,
          openingHours: [],
        },
      });

      await tx.staffMember.create({
        data: {
          tenantId: created.id,
          email: values['owner-email']!.toLowerCase(),
          passwordHash: await argon2.hash(password),
          name: `Dueño ${values.name}`,
          role: 'owner',
        },
      });

      return created;
    });

    const baseDomain = process.env.TENANT_BASE_DOMAIN;
    /* eslint-disable no-console -- salida del script de operación */
    console.log(`✓ tenant ${tenant.slug} (${tenant.name})`);
    if (baseDomain) console.log(`  url:      https://${tenant.slug}.${baseDomain}`);
    console.log(`  plan:     ${planCode} (${interval}), activo · región ${values.region}`);
    console.log(`  dueño:    ${values['owner-email']}`);
    console.log(`  password: ${password}   ← se muestra solo esta vez`);
    /* eslint-enable no-console */
  } finally {
    await prisma.$disconnect();
  }
}

void main();
