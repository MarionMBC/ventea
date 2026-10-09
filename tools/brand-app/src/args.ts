import { parseArgs } from 'node:util';

import { assertSlug, VERSION } from './paths';

export const PLATFORMS = ['android', 'ios'] as const;
export type Platform = (typeof PLATFORMS)[number];
export const CONFIG_SOURCES = ['api', 'file'] as const;
export type ConfigSource = (typeof CONFIG_SOURCES)[number];

export interface AppArgs {
  tenant: string;
  platform: Platform;
  /** Firmado con el keystore de la marca (AAB + APK). Sin él: APK debug. */
  release: boolean;
  configFrom: ConfigSource;
  /** Solo con `--config-from file`: archivo de marca (si falta, se busca en apps/mobile/brands). */
  configFile: string | null;
  /** Origen de la API de la plataforma (`--config-from api`): `--api-url` o `VENTEA_API_URL`. */
  apiUrl: string | null;
  /** API que usará la app; por defecto la del build-config (la que respondió). */
  appApiUrl: string | null;
  buildNumber: number | null;
  version: string | null;
  /** Prepara la copia de trabajo (config, íconos, nativo, web, cap sync) y no compila. */
  prepareOnly: boolean;
  /** Keystore de una app ya publicada, leído en su sitio (`--keystore-props` obligatorio). */
  keystore: string | null;
  keystoreProps: string | null;
  /** Prefijo del storage de la app anterior de la marca (`chc.`), para la migración. */
  legacyStoragePrefix: string | null;
}

export const APP_USAGE = `Uso: npm run brand:app -- --tenant <slug> [opciones]

  --platform android|ios       (default android)
  --release                    AAB + APK firmados con el keystore de la marca
  --config-from api|file       (default api)
      api:  GET /api/platform/tenants/:slug/app/build-config
            --api-url <origen> o VENTEA_API_URL; token en VENTEA_PLATFORM_TOKEN
      file: --config <brand.json> o el de apps/mobile/brands con ese tenantSlug
  --app-api-url <origen>       API que usará la app (default: la del build-config)
  --version X.Y.Z              (default: la de la plataforma o apps/mobile/package.json)
  --build-number N             (default: el de la plataforma + 1, o el último local + 1)
  --prepare-only               solo prepara la copia de trabajo (sin gradle/xcode)
  --keystore <ruta>            keystore de una app ya publicada (o VENTEA_BRAND_KEYSTORE)
  --keystore-props <ruta>      su storePassword/keyAlias/keyPassword (o VENTEA_BRAND_KEYSTORE_PROPS);
                               sin estos, el de ~/.ventea/keystores/<slug>.jks (se crea si falta)
  --legacy-storage-prefix p.   storage de la app anterior a migrar (en modo file: legacyStoragePrefix)`;

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

function oneOf<T extends string>(value: string, allowed: readonly T[], flag: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new UsageError(`${flag} debe ser ${allowed.join(' o ')}: "${value}"`);
  }
  return value as T;
}

function positiveInt(value: string, flag: string): number {
  if (!/^\d{1,10}$/.test(value) || Number(value) < 1 || Number(value) > 2_100_000_000) {
    throw new UsageError(`${flag} debe ser un entero positivo: "${value}"`);
  }
  return Number(value);
}

export function parseAppArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): AppArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        tenant: { type: 'string' },
        platform: { type: 'string', default: 'android' },
        release: { type: 'boolean', default: false },
        'config-from': { type: 'string', default: 'api' },
        config: { type: 'string' },
        'api-url': { type: 'string' },
        'app-api-url': { type: 'string' },
        version: { type: 'string' },
        'build-number': { type: 'string' },
        'prepare-only': { type: 'boolean', default: false },
        keystore: { type: 'string' },
        'keystore-props': { type: 'string' },
        'legacy-storage-prefix': { type: 'string' },
      },
    });
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
  const { values, positionals } = parsed;

  if (!values.tenant) throw new UsageError('Falta --tenant <slug>');
  let tenant: string;
  try {
    tenant = assertSlug(values.tenant);
  } catch (error) {
    throw new UsageError((error as Error).message);
  }

  const configFrom = oneOf(values['config-from'], CONFIG_SOURCES, '--config-from');
  // `--config-from file brands/brand.x.json` también vale (posicional tras el modo).
  if (positionals.length > 1 || (positionals.length === 1 && configFrom !== 'file')) {
    throw new UsageError(`Argumento inesperado: ${positionals.join(' ')}`);
  }
  const configFile = values.config ?? positionals[0] ?? null;
  if (configFile && configFrom !== 'file') {
    throw new UsageError('--config solo va con --config-from file');
  }

  const apiUrl = values['api-url'] ?? env.VENTEA_API_URL ?? null;
  if (configFrom === 'api' && !apiUrl) {
    throw new UsageError('--config-from api necesita --api-url o VENTEA_API_URL');
  }

  if (values.version !== undefined && !VERSION.test(values.version)) {
    throw new UsageError(`--version debe ser X.Y.Z: "${values.version}"`);
  }

  const keystore = values.keystore ?? env.VENTEA_BRAND_KEYSTORE ?? null;
  const keystoreProps = values['keystore-props'] ?? env.VENTEA_BRAND_KEYSTORE_PROPS ?? null;
  if (keystore && !keystoreProps) {
    throw new UsageError('--keystore necesita --keystore-props (contraseñas y alias)');
  }

  return {
    tenant,
    platform: oneOf(values.platform, PLATFORMS, '--platform'),
    release: values.release,
    configFrom,
    configFile,
    apiUrl,
    appApiUrl: values['app-api-url'] ?? null,
    buildNumber:
      values['build-number'] === undefined
        ? null
        : positiveInt(values['build-number'], '--build-number'),
    version: values.version ?? null,
    prepareOnly: values['prepare-only'],
    keystore,
    keystoreProps,
    legacyStoragePrefix: values['legacy-storage-prefix'] ?? null,
  };
}
