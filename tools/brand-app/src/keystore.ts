import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { keystoreFiles } from './paths';
import { run } from './run';

/**
 * Firma de Android por marca. Dos casos:
 *
 * - **Keystore propio** (marca nueva): `~/.ventea/keystores/<slug>.jks` y, al lado,
 *   `<slug>.properties` (0600) con la contraseña aleatoria. Se crean si faltan.
 * - **Keystore externo** (marca con app ya publicada, p. ej. Carolina): `--keystore` y
 *   `--keystore-props` apuntan a los archivos donde ya viven; se leen en su sitio.
 *
 * En los dos casos gradle recibe RUTAS por variables de entorno (`VENTEA_KEYSTORE_FILE`,
 * `VENTEA_KEYSTORE_PROPERTIES`): ni la contraseña ni el keystore se copian a la copia de
 * trabajo, a la línea de comandos ni a la salida.
 */

export interface Signing {
  keystore: string;
  properties: string;
  alias: string;
  /** `true` si se generó en esta corrida: hay que respaldarlo YA. */
  created: boolean;
  external: boolean;
}

/** Lee un `.properties` simple (`clave=valor`, `#` comentarios). */
export function parseProperties(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const match = /^([^=:\s]+)\s*[=:]\s*(.*)$/.exec(line);
    if (match) out[match[1]!] = match[2]!;
  }
  return out;
}

/** Valores de `.properties`: `\` y saltos escapados (las rutas de Windows llevan `\`). */
const propertyValue = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r');

/** Contenido del `<slug>.properties` de un keystore propio. */
export function signingProperties(keystore: string, alias: string, password: string): string {
  return [
    '# Firma de la app de esta marca (brand-app, TASK-019). NO compartir ni commitear.',
    '# Respaldar junto con el .jks: sin ambos no se puede actualizar la app publicada.',
    `storeFile=${propertyValue(keystore.replace(/\\/g, '/'))}`,
    `storePassword=${propertyValue(password)}`,
    `keyAlias=${propertyValue(alias)}`,
    `keyPassword=${propertyValue(password)}`,
    '',
  ].join('\n');
}

/** CN/O del certificado: sin los caracteres especiales de un DN X.500. */
export function distinguishedName(appName: string): string {
  const safe =
    appName
      .replace(/[,+="<>#;\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Ventea brand';
  return `CN=${safe}, O=${safe}, OU=Ventea`;
}

/**
 * Argumentos de `keytool -genkeypair`. La contraseña NO va acá: `-storepass:env` /
 * `-keypass:env` la leen de `VENTEA_KS_PASS`.
 */
export function keytoolGenArgs(keystore: string, alias: string, appName: string): string[] {
  return [
    '-genkeypair',
    '-keystore',
    keystore,
    '-storetype',
    'PKCS12',
    '-alias',
    alias,
    '-keyalg',
    'RSA',
    '-keysize',
    '4096',
    // Play exige validez hasta después de 2033: 30 años.
    '-validity',
    '10950',
    '-dname',
    distinguishedName(appName),
    '-storepass:env',
    'VENTEA_KS_PASS',
    '-keypass:env',
    'VENTEA_KS_PASS',
    '-noprompt',
  ];
}

/**
 * Solo el dueño: `0600` en Unix. En Windows `chmod` no restringe la lectura, así que se
 * cortan los permisos heredados y queda solo el usuario actual (icacls).
 */
async function restrict(file: string): Promise<void> {
  chmodSync(file, 0o600);
  if (process.platform === 'win32' && process.env.USERNAME) {
    await run('icacls', [file, '/inheritance:r', '/grant:r', `${process.env.USERNAME}:F`], {
      capture: true,
    });
  }
}

async function writeSecret(file: string, content: string): Promise<void> {
  writeFileSync(file, content, { mode: 0o600, flag: 'wx' });
  await restrict(file);
}

export async function ensureOwnKeystore(options: {
  dir: string;
  slug: string;
  appName: string;
  keytool?: string;
}): Promise<Signing> {
  const files = keystoreFiles(options.dir, options.slug);
  const properties = files.properties;
  const alias = options.slug;
  if (existsSync(files.keystore)) {
    if (!existsSync(properties)) {
      throw new Error(
        `Existe ${files.keystore} pero falta ${properties}: restaurarlo del respaldo (no se regenera)`,
      );
    }
    return { keystore: files.keystore, properties, alias, created: false, external: false };
  }
  if (existsSync(properties)) {
    throw new Error(
      `Existe ${properties} sin su keystore: restaurar ${files.keystore} del respaldo`,
    );
  }
  mkdirSync(options.dir, { recursive: true, mode: 0o700 });
  const password = randomBytes(24).toString('base64url');
  // Primero las credenciales (0600): si keytool falla, se ve cuál falta y nada queda a medias.
  await writeSecret(properties, signingProperties(files.keystore, alias, password));
  await run(options.keytool ?? 'keytool', keytoolGenArgs(files.keystore, alias, options.appName), {
    env: { ...process.env, VENTEA_KS_PASS: password },
    capture: true,
  });
  await restrict(files.keystore);
  return { keystore: files.keystore, properties, alias, created: true, external: false };
}

/**
 * Keystore de una app ya publicada. `storeFile` relativo se resuelve contra la carpeta del
 * `.properties` (o contra `--keystore` si se da). Solo se valida que estén las claves.
 */
export function externalKeystore(options: {
  keystore: string | null;
  properties: string;
}): Signing {
  if (!existsSync(options.properties)) throw new Error(`No existe ${options.properties}`);
  const props = parseProperties(readFileSync(options.properties, 'utf8'));
  for (const key of ['storePassword', 'keyAlias', 'keyPassword']) {
    if (!props[key]) throw new Error(`${options.properties}: falta ${key}`);
  }
  const keystore =
    options.keystore ??
    (props.storeFile ? path.resolve(path.dirname(options.properties), props.storeFile) : null);
  if (!keystore) throw new Error(`${options.properties}: falta storeFile (o usar --keystore)`);
  if (!existsSync(keystore)) throw new Error(`No existe el keystore ${keystore}`);
  return {
    keystore,
    properties: options.properties,
    alias: props.keyAlias!,
    created: false,
    external: true,
  };
}

/** Variables para gradle: rutas, nunca contraseñas. */
export function signingEnv(signing: Signing): Record<string, string> {
  return {
    VENTEA_KEYSTORE_FILE: signing.keystore,
    VENTEA_KEYSTORE_PROPERTIES: signing.properties,
  };
}
