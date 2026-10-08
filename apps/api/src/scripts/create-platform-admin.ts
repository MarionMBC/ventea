/**
 * Alta de un administrador de la plataforma (`PlatformAdmin`, ADR 0007): quien opera el
 * SaaS desde `/api/platform/*`.
 *
 *   node apps/api/dist/scripts/create-platform-admin.js --email yo@ventea.tech --name "Mario"
 *   node apps/api/dist/scripts/create-platform-admin.js --email yo@ventea.tech --reset-password
 *
 * La contraseña se genera acá y se imprime UNA vez; no se guarda en ningún otro lado. Si
 * el email ya existe, falla salvo con `--reset-password`, que le genera una nueva.
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { emailSchema } from '@ventea/shared';
import argon2 from 'argon2';

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      'reset-password': { type: 'boolean', default: false },
    },
  });

  const email = emailSchema.safeParse(values.email);
  if (!email.success) {
    fail('Uso: create-platform-admin --email <email> --name "<nombre>" [--reset-password]');
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) fail('Falta DATABASE_URL');

  // PlatformAdmin está fuera de todo tenant: el cliente crudo alcanza.
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const existing = await prisma.platformAdmin.findUnique({
      where: { email: email.data },
      select: { id: true },
    });
    if (existing && !values['reset-password']) {
      fail(`Ya existe un admin con email ${email.data} (usar --reset-password para otra clave)`);
    }
    if (!existing && !values.name) fail('Falta --name para un admin nuevo');

    const password = randomBytes(18).toString('base64url');
    const passwordHash = await argon2.hash(password);

    if (existing) {
      await prisma.platformAdmin.update({ where: { id: existing.id }, data: { passwordHash } });
    } else {
      await prisma.platformAdmin.create({
        data: { email: email.data, name: values.name!, passwordHash },
      });
    }

    /* eslint-disable no-console -- salida del script de operación */
    console.log(`✓ admin de plataforma ${email.data} ${existing ? '(clave nueva)' : '(creado)'}`);
    console.log(`  password: ${password}   ← se muestra solo esta vez`);
    console.log('  login:    POST /api/platform/auth/login');
    /* eslint-enable no-console */
  } finally {
    await prisma.$disconnect();
  }
}

void main();
