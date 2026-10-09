import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { importImages, parseImageMap } from './import-images';
import { assertSlug, userPath } from './paths';

/**
 * `npm run brand:import-images -- --tenant <slug> --dir <carpeta> [--map <json>]`
 *
 * Credenciales del dueño SOLO por entorno (`VENTEA_OWNER_EMAIL`, `VENTEA_OWNER_PASSWORD`);
 * API por `--api-url` o `VENTEA_API_URL` (sin default: elegir el destino a conciencia).
 */
const USAGE = `Uso: npm run brand:import-images -- --tenant <slug> --dir <carpeta> [opciones]

  --map <json>      nombre del producto → archivo (default: tools/brand-app/maps/<slug>.json)
  --api-url <url>   o VENTEA_API_URL
  --force           reemplaza fotos/logo/ícono que ya existen
  --dry-run         muestra qué haría, sin subir ni cambiar nada
  env: VENTEA_OWNER_EMAIL, VENTEA_OWNER_PASSWORD (cuenta del dueño de la marca)`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    options: {
      tenant: { type: 'string' },
      dir: { type: 'string' },
      map: { type: 'string' },
      'api-url': { type: 'string' },
      force: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  if (!values.tenant || !values.dir) throw new Error(`Faltan --tenant y --dir\n\n${USAGE}`);
  const tenant = assertSlug(values.tenant);
  const apiUrl = values['api-url'] ?? process.env.VENTEA_API_URL;
  if (!apiUrl) throw new Error(`Falta --api-url o VENTEA_API_URL\n\n${USAGE}`);
  const email = process.env.VENTEA_OWNER_EMAIL;
  const password = process.env.VENTEA_OWNER_PASSWORD;
  if (!email || !password) {
    throw new Error('Faltan VENTEA_OWNER_EMAIL / VENTEA_OWNER_PASSWORD en el entorno');
  }

  const dir = userPath(values.dir);
  const mapFile = values.map
    ? userPath(values.map)
    : path.resolve(import.meta.dirname, '..', 'maps', `${tenant}.json`);
  if (!existsSync(mapFile)) throw new Error(`No existe el mapa ${mapFile}`);
  const map = parseImageMap(JSON.parse(readFileSync(mapFile, 'utf8')), dir);

  console.log(`▸ ${tenant} en ${new URL(apiUrl).origin}${values['dry-run'] ? ' (dry-run)' : ''}`);
  const report = await importImages({
    apiUrl,
    tenant,
    email,
    password,
    map,
    force: values.force,
    dryRun: values['dry-run'],
    log: (line) => console.log(`  ${line}`),
  });
  console.log(
    `▸ subidas ${report.uploaded} · asignadas ${report.assigned.length} · ya tenían ${report.skipped.length}` +
      ` · marca ${report.brand.length} · sin producto ${report.missing.length}`,
  );
  if (report.missing.length) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
