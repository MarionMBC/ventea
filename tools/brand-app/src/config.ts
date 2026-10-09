import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { buildConfigSchema, type BuildConfig } from '@ventea/shared';

// La misma validación que hace `vite.config.ts` de la app: si pasa acá, pasa en el build.
import { parseBrandConfig, type BrandConfig } from '../../../apps/mobile/src/brand/brandConfig';
import { VERSION } from './paths';

export type { BrandConfig };

/**
 * `apiBaseUrl` de la plataforma (`https://api.ventea.tech/api`) → el origen que espera
 * `brand.config.json` (`https://api.ventea.tech`).
 */
export function apiOrigin(apiBaseUrl: string): string {
  const url = new URL(apiBaseUrl);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`API no http(s): ${apiBaseUrl}`);
  }
  return url.origin;
}

export function parseBuildConfig(input: unknown): BuildConfig {
  const result = buildConfigSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`build-config inválido: ${issue?.path.join('.')} ${issue?.message}`);
  }
  return result.data;
}

export interface BrandFromBuildConfigOptions {
  /** Pisa la API que respondió (p. ej. build contra una API local para producción). */
  appApiUrl?: string | null;
  /** Solo si el build lleva el `google-services.json` de la marca. */
  pushEnabled: boolean;
}

/** `GET …/app/build-config` → `brand.config.json` (el contrato de TASK-018). */
export function brandFromBuildConfig(
  config: BuildConfig,
  options: BrandFromBuildConfigOptions,
): BrandConfig {
  const b = config.branding;
  const served = apiOrigin(config.apiBaseUrl);
  const apiUrl = apiOrigin(options.appApiUrl ?? config.apiBaseUrl);
  // Medios servidos por la API que respondió → la misma ruta en la API de la app.
  const media = (url: string | null) =>
    url && apiUrl !== served && new URL(url).origin === served
      ? `${apiUrl}${new URL(url).pathname}`
      : url;
  return parseBrandConfig({
    tenantSlug: config.tenant.slug,
    apiUrl,
    appName: b.appDisplayName,
    bundleId: config.app.bundleId,
    colors: { primary: b.primaryColor, secondary: b.secondaryColor, accent: b.accentColor },
    logoUrl: media(b.logoUrl),
    iconUrl: media(b.iconUrl),
    defaultLanguage: b.language,
    currency: config.tenant.currency,
    push: { enabled: options.pushEnabled },
  });
}

export interface BrandFile {
  brand: BrandConfig;
  /**
   * Identidad de una app ya publicada (p. ej. Carolina: 1.2.0, build ≥ 4): la versión y el
   * build number mínimos con los que sigue. Solo los usa el generador; la app los ignora.
   */
  version: string | null;
  buildNumber: number | null;
}

export function readBrandFile(file: string): BrandFile {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`No se pudo leer ${file}: ${(error as Error).message}`, { cause: error });
  }
  const brand = parseBrandConfig(raw);
  const { version, buildNumber } = raw as { version?: unknown; buildNumber?: unknown };
  if (version !== undefined && (typeof version !== 'string' || !VERSION.test(version))) {
    throw new Error(`${file}: "version" debe ser X.Y.Z`);
  }
  if (
    buildNumber !== undefined &&
    (typeof buildNumber !== 'number' || !Number.isInteger(buildNumber) || buildNumber < 1)
  ) {
    throw new Error(`${file}: "buildNumber" debe ser un entero positivo`);
  }
  return {
    brand,
    version: (version as string | undefined) ?? null,
    buildNumber: (buildNumber as number | undefined) ?? null,
  };
}

/** El archivo de `brandsDir` cuyo `tenantSlug` es `slug` (`brand.carolina.json` → carolina-hot-chicken). */
export function findBrandFile(brandsDir: string, slug: string): string {
  const matches = readdirSync(brandsDir)
    .filter((name) => /^brand\..+\.json$/.test(name))
    .map((name) => path.join(brandsDir, name))
    .filter((file) => {
      try {
        return (
          (JSON.parse(readFileSync(file, 'utf8')) as { tenantSlug?: unknown }).tenantSlug === slug
        );
      } catch {
        return false;
      }
    });
  if (matches.length === 0)
    throw new Error(`Ningún archivo de ${brandsDir} tiene tenantSlug "${slug}"`);
  if (matches.length > 1)
    throw new Error(`Varios archivos con tenantSlug "${slug}": ${matches.join(', ')}`);
  return matches[0]!;
}

/**
 * Versión X.Y.Z (compartida entre marcas) y build number (por marca, siempre creciente:
 * es el `versionCode` de Android y el `CFBundleVersion` de iOS).
 */
export function resolveVersion(options: {
  flag: string | null;
  platform: string | null;
  fallback: string;
}): string {
  const version = options.flag ?? options.platform ?? options.fallback;
  if (!VERSION.test(version)) throw new Error(`Versión inválida (X.Y.Z): "${version}"`);
  return version;
}

/**
 * - `--build-number` manda.
 * - Con la plataforma: el último que registró + 1.
 * - Con archivo: el siguiente al último generado en local, y nunca menos que el `buildNumber`
 *   del archivo (el mínimo de una app ya publicada).
 */
export function resolveBuildNumber(options: {
  flag: number | null;
  platform: number | null;
  fileMinimum?: number | null;
  localLast: number | null;
}): number {
  if (options.flag !== null) return options.flag;
  if (options.platform !== null) return options.platform + 1;
  return Math.max(options.fileMinimum ?? 1, (options.localLast ?? 0) + 1);
}

/** El build number más alto ya generado en local (`dist-apps/<slug>/<version>+<build>`). */
export function lastLocalBuildNumber(slugDistDir: string): number | null {
  let entries: string[];
  try {
    entries = readdirSync(slugDistDir);
  } catch {
    return null;
  }
  const numbers = entries
    .map((name) => /^\d+\.\d+\.\d+\+(\d+)$/.exec(name)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number);
  return numbers.length ? Math.max(...numbers) : null;
}

export function mobileVersion(mobileDir: string): string {
  return (
    JSON.parse(readFileSync(path.join(mobileDir, 'package.json'), 'utf8')) as { version: string }
  ).version;
}
