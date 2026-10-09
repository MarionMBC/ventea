import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { Platform } from './args';
import type { BrandConfig } from './config';
import type { BrandPaths } from './paths';

/**
 * Copia de trabajo de una marca: un «app root» de Capacitor en `dist-apps/.work/<slug>/` con
 * su propia `capacitor.config.json`, `brand.config.json` y la copia del proyecto nativo.
 * La plantilla versionada (`apps/mobile/android|ios`) nunca se toca.
 */

/** Lo que no se copia de la plantilla: salida de builds, copias de `cap sync` y secretos. */
const EXCLUDED = [
  /(^|[\\/])\.gradle([\\/]|$)/,
  /(^|[\\/])build([\\/]|$)/,
  /(^|[\\/])\.idea([\\/]|$)/,
  /(^|[\\/])capacitor-cordova-(android|ios)-plugins([\\/]|$)/,
  /[\\/]assets[\\/]public([\\/]|$)/,
  /(^|[\\/])App[\\/]App[\\/]public([\\/]|$)/,
  /(^|[\\/])(DerivedData|Pods|xcuserdata)([\\/]|$)/,
  /(^|[\\/])(local|keystore)\.properties$/,
  /\.(jks|keystore|p12|mobileprovision)$/,
  /(^|[\\/])(google-services\.json|GoogleService-Info\.plist)$/,
];

export function isExcluded(relative: string): boolean {
  return EXCLUDED.some((pattern) => pattern.test(relative));
}

/** Fondo del WebView: el mismo que `capacitor.config.ts` de la plantilla. */
const BACKGROUND = '#121010';

/** Lo que la plantilla calcula en `capacitor.config.ts`, ya resuelto para esta marca. */
export function capacitorConfig(brand: BrandConfig): Record<string, unknown> {
  return {
    appId: brand.bundleId,
    appName: brand.appName,
    webDir: 'www',
    backgroundColor: BACKGROUND,
    android: { backgroundColor: BACKGROUND },
    ios: { backgroundColor: BACKGROUND },
    plugins: { PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] } },
  };
}

export function prepareWorkDir(options: {
  mobileDir: string;
  paths: BrandPaths;
  platform: Platform;
  brand: BrandConfig;
}): void {
  const { mobileDir, paths, platform, brand } = options;
  const source = path.join(mobileDir, platform);
  const target = platform === 'android' ? paths.android : paths.ios;
  if (!existsSync(source)) throw new Error(`No existe la plantilla ${source}`);

  rmSync(target, { recursive: true, force: true });
  mkdirSync(paths.work, { recursive: true });
  cpSync(source, target, {
    recursive: true,
    filter: (from) => !isExcluded(path.relative(source, from)),
  });

  // Capacitor descubre los plugins por las dependencias del package.json del app root.
  const pkg = JSON.parse(readFileSync(path.join(mobileDir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  writeJson(path.join(paths.work, 'package.json'), {
    name: `ventea-brand-${brand.tenantSlug}`,
    private: true,
    dependencies: pkg.dependencies ?? {},
  });
  writeJson(paths.capacitorConfig, capacitorConfig(brand));
  writeJson(paths.brandFile, brand);
}

export function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function editFile(file: string, edit: (source: string) => string): void {
  writeFileSync(file, edit(readFileSync(file, 'utf8')));
}
