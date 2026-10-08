/**
 * Importa (reemplaza) el menú de un tenant desde un archivo JSON.
 *
 *   node apps/api/dist/scripts/import-menu.js --tenant carolina-hot-chicken \
 *     --file apps/api/prisma/data/carolina-menu.json [--force-currency]
 *
 * Reemplaza categorías, ítems, grupos y opciones del tenant en una transacción. Si
 * el archivo trae `currency` actualiza la moneda del tenant, y si trae
 * `rewardProgram` reemplaza el programa de puntos. No toca pedidos.
 *
 * Cambiar la moneda de un tenant que ya tiene pedidos se rechaza (exit 1): sus
 * montos están guardados en centavos de la moneda anterior y pasarían a leerse en
 * la nueva. `--force-currency` lo permite cuando es intencional (p. ej. el tenant
 * solo tiene pedidos de prueba).
 *
 * Formato del archivo: `menuFileSchema` en src/modules/catalog/menu-import.ts.
 */
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { importMenu } from '../modules/catalog/menu-import';

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      tenant: { type: 'string' },
      file: { type: 'string' },
      'force-currency': { type: 'boolean', default: false },
    },
  });

  if (!values.tenant || !values.file) {
    fail('Uso: import-menu --tenant <slug> --file <menu.json> [--force-currency]');
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) fail('Falta DATABASE_URL');

  let data: unknown;
  try {
    data = JSON.parse(await readFile(values.file, 'utf8'));
  } catch (error) {
    fail(
      `No se pudo leer ${values.file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const result = await importMenu(prisma, values.tenant, data, {
      forceCurrency: values['force-currency'],
    });
    /* eslint-disable no-console -- salida del script de operación */
    console.log(`✓ menú de ${values.tenant} reemplazado`);
    console.log(
      `  ${result.categories} categorías · ${result.items} ítems · ` +
        `${result.modifierGroups} grupos · ${result.modifierOptions} opciones`,
    );
    if (result.currencyChanged) console.log('  moneda actualizada');
    if (result.rewardProgramUpdated) console.log('  programa de puntos actualizado');
    /* eslint-enable no-console */
  } catch (error) {
    // exitCode y no process.exit: el finally tiene que cerrar la conexión.
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
