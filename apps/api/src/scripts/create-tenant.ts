/**
 * Alta de un tenant nuevo: la marca, su branding, su programa de puntos, una
 * sucursal y el usuario dueño.
 *
 *   node apps/api/dist/scripts/create-tenant.js \
 *     --slug pollos-juan --name "Pollos Juan" --owner-email juan@pollosjuan.com \
 *     [--currency HNL] [--color "#E23B2E"] [--location "Sucursal Centro"] [--address "..."]
 *
 * En TENANT_MODE=multi el slug ES el subdominio: el tenant queda accesible en
 * `<slug>.<TENANT_BASE_DOMAIN>` apenas termina el script, sin tocar DNS ni proxy
 * (el DNS y el certificado son comodín).
 *
 * La contraseña del dueño se genera acá y se imprime UNA vez; no se guarda en
 * ningún otro lado. Es un script de operación, no un endpoint: crear marcas no es
 * algo que deba poder hacerse desde internet mientras no exista auth de plataforma.
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { tenantSlugSchema } from '@ventea/shared';
import argon2 from 'argon2';

/** Subdominios que el proxy o la plataforma usan para otra cosa. */
const RESERVED_SLUGS = new Set(['www', 'api', 'admin', 'app', 'mail', 'status', 'docs']);

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
    },
  });

  if (!values.slug || !values.name || !values['owner-email']) {
    fail('Uso: create-tenant --slug <slug> --name "<nombre>" --owner-email <email>');
  }

  const slug = tenantSlugSchema.safeParse(values.slug);
  if (!slug.success) fail(slug.error.issues[0]?.message ?? 'slug inválido');
  if (RESERVED_SLUGS.has(slug.data)) fail(`"${slug.data}" es un subdominio reservado`);
  if (!/^[A-Z]{3}$/.test(values.currency)) fail('currency: código ISO 4217 de 3 letras (HNL, USD…)');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) fail('Falta DATABASE_URL');

  // Cliente crudo, sin el guard de tenant: como la semilla, es el único lugar que
  // crea filas antes de que exista un tenant al cual filtrar.
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    if (await prisma.tenant.findUnique({ where: { slug: slug.data }, select: { id: true } })) {
      fail(`Ya existe un tenant con slug "${slug.data}"`);
    }

    const password = randomBytes(12).toString('base64url');

    const tenant = await prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          slug: slug.data,
          name: values.name!,
          currency: values.currency,
          branding: { create: { primaryColor: values.color, appDisplayName: values.name! } },
          rewardProgram: {
            create: {
              isEnabled: true,
              pointsPerCurrencyUnit: 0.01,
              redemptionValueCents: 100,
              minPointsToRedeem: 10,
              signupBonusPoints: 20,
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
    console.log(`  dueño:    ${values['owner-email']}`);
    console.log(`  password: ${password}   ← se muestra solo esta vez`);
    /* eslint-enable no-console */
  } finally {
    await prisma.$disconnect();
  }
}

void main();
