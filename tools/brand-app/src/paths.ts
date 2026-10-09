import { homedir } from 'node:os';
import path from 'node:path';

/**
 * Dónde vive cada cosa. Todo lo que el generador produce va a `dist-apps/` (gitignored) y
 * todo lo secreto (keystores, Firebase de cada marca) a `~/.ventea/`, fuera del repo.
 */

/** Raíz del monorepo: `tools/brand-app/src` → `../../..`. */
export const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
export const MOBILE_DIR = path.join(REPO_ROOT, 'apps', 'mobile');
export const DIST_APPS_DIR = path.join(REPO_ROOT, 'dist-apps');

/** Mismo formato de slug que la API: minúsculas, dígitos y guiones sueltos. */
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

export function assertSlug(slug: string): string {
  if (!SLUG.test(slug)) throw new Error(`Slug inválido: "${slug}" (minúsculas, dígitos y guiones)`);
  return slug;
}

/**
 * Rutas que da el usuario en la línea de comandos. `npm run -w` cambia el directorio de
 * trabajo al del workspace; `INIT_CWD` es desde donde se llamó.
 */
export function userPath(value: string, cwd = process.env.INIT_CWD ?? process.cwd()): string {
  return path.resolve(cwd, value);
}

export interface BrandPaths {
  /** Copia de trabajo de la marca: app root para Capacitor (`capacitor.config.json`, android/, ios/). */
  work: string;
  /** Bundle web de la marca (`webDir` de Capacitor). */
  www: string;
  brandFile: string;
  capacitorConfig: string;
  android: string;
  ios: string;
  /** Artefactos de esta versión: `dist-apps/<slug>/<version>+<build>/`. */
  out: string;
}

export function brandPaths(
  distDir: string,
  slug: string,
  version: string,
  buildNumber: number,
): BrandPaths {
  assertSlug(slug);
  const work = path.join(distDir, '.work', slug);
  return {
    work,
    www: path.join(work, 'www'),
    brandFile: path.join(work, 'brand.config.json'),
    capacitorConfig: path.join(work, 'capacitor.config.json'),
    android: path.join(work, 'android'),
    ios: path.join(work, 'ios'),
    out: path.join(distDir, slug, `${version}+${buildNumber}`),
  };
}

/** `~/.ventea/keystores` (o `VENTEA_KEYSTORE_DIR`). */
export function keystoreDir(env = process.env, home = homedir()): string {
  return env.VENTEA_KEYSTORE_DIR
    ? path.resolve(env.VENTEA_KEYSTORE_DIR)
    : path.join(home, '.ventea', 'keystores');
}

/** Archivos de Firebase de cada marca: `~/.ventea/brands/<slug>/` (o `VENTEA_BRAND_SECRETS_DIR`). */
export function brandSecretsDir(slug: string, env = process.env, home = homedir()): string {
  assertSlug(slug);
  const base = env.VENTEA_BRAND_SECRETS_DIR
    ? path.resolve(env.VENTEA_BRAND_SECRETS_DIR)
    : path.join(home, '.ventea', 'brands');
  return path.join(base, slug);
}

/** Keystore de la marca y, al lado, su `.properties` (contraseña y alias, 0600). */
export function keystoreFiles(dir: string, slug: string): { keystore: string; properties: string } {
  assertSlug(slug);
  return {
    keystore: path.join(dir, `${slug}.jks`),
    properties: path.join(dir, `${slug}.properties`),
  };
}
