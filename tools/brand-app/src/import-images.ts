import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

import type { Brand, MediaUploadResponse, StaffAuthResponse, StaffMenu } from '@ventea/shared';

import { apiBase, apiError, type Fetch } from './http';

/**
 * Migración de fotos de una app vieja (assets locales) a Ventea: sube cada imagen con
 * `POST /api/staff/media` y la asigna al ítem del menú (`PATCH /api/staff/menu/items/:id`) y,
 * si el mapa lo dice, a la marca (`PATCH /api/staff/brand`: logo e ícono).
 *
 * Idempotente: lo que ya tiene imagen no se toca (salvo `force`), y un mismo archivo se
 * sube una sola vez por corrida (la API además deduplica por hash del WebP).
 */

export const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/**
 * Clave de búsqueda de un nombre de producto, como la de la app de Carolina
 * (`productPhotos.ts`): minúsculas, sin acentos, solo letras y dígitos. (La vieja no quitaba
 * las marcas de acento tras `NFD`; acá sí, y se normalizan igual los dos lados.)
 * «Nashville Tenders · 3 pzas» → «nashville tenders 3 pzas».
 */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface ImageMap {
  /** Nombre del producto → archivo (ruta absoluta, dentro de `dir`). */
  items: { name: string; key: string; file: string }[];
  brand: { logo: string | null; icon: string | null };
}

/** Archivo del mapa: relativo a `dir`, sin salir de él, existente y de un tipo admitido. */
function resolveImage(dir: string, relative: unknown, what: string): string {
  if (typeof relative !== 'string' || !relative.trim()) {
    throw new Error(`${what}: falta el archivo`);
  }
  if (path.isAbsolute(relative)) throw new Error(`${what}: la ruta debe ser relativa a --dir`);
  const root = realpathSync(dir);
  const file = path.resolve(root, relative);
  if (!existsSync(file)) throw new Error(`${what}: no existe ${relative}`);
  const real = realpathSync(file);
  if (real !== root && !real.startsWith(root + path.sep)) {
    throw new Error(`${what}: ${relative} sale de --dir`);
  }
  if (!IMAGE_TYPES[path.extname(real).toLowerCase()]) {
    throw new Error(`${what}: ${relative} no es png/jpg/webp`);
  }
  if (!statSync(real).isFile()) throw new Error(`${what}: ${relative} no es un archivo`);
  return real;
}

/**
 * `{ "items": { "<producto>": "<archivo>" }, "brand": { "logo": "<archivo>", "icon": "<archivo>" } }`.
 * Dos nombres que normalizan igual son un error (no se sabría cuál gana).
 */
export function parseImageMap(raw: unknown, dir: string): ImageMap {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('El mapa debe ser un objeto JSON');
  }
  // `$comment` y cualquier otra clave son notas para quien lee el mapa.
  const { items, brand } = raw as { items?: unknown; brand?: unknown };
  if (
    items !== undefined &&
    (typeof items !== 'object' || items === null || Array.isArray(items))
  ) {
    throw new Error('"items" debe ser un objeto nombre → archivo');
  }
  const seen = new Map<string, string>();
  const entries = Object.entries((items ?? {}) as Record<string, unknown>).map(([name, file]) => {
    const key = normaliseName(name);
    if (!key) throw new Error(`Nombre vacío en el mapa: "${name}"`);
    const previous = seen.get(key);
    if (previous) throw new Error(`"${name}" y "${previous}" son el mismo producto`);
    seen.set(key, name);
    return { name, key, file: resolveImage(dir, file, `"${name}"`) };
  });
  const brandMap = (brand ?? {}) as { logo?: unknown; icon?: unknown };
  return {
    items: entries,
    brand: {
      logo: brandMap.logo == null ? null : resolveImage(dir, brandMap.logo, 'brand.logo'),
      icon: brandMap.icon == null ? null : resolveImage(dir, brandMap.icon, 'brand.icon'),
    },
  };
}

export interface ImportOptions {
  apiUrl: string;
  tenant: string;
  email: string;
  password: string;
  map: ImageMap;
  force: boolean;
  dryRun: boolean;
  fetch?: Fetch;
  log?: (line: string) => void;
  /** Espera entre reintentos (los tests la reemplazan). */
  sleep?: (ms: number) => Promise<void>;
}

/** Reintentos de una subida que la API rechaza con 503 (semáforo de sharp lleno). */
export const UPLOAD_ATTEMPTS = 5;

/** Espera antes del reintento `attempt` (1, 2…): `Retry-After` si viene (≤ 60 s), si no 1, 2, 4, 8 s. */
export function retryDelayMs(attempt: number, retryAfter: string | null): number {
  const seconds = retryAfter !== null && /^\d{1,3}$/.test(retryAfter) ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds)) return Math.min(seconds, 60) * 1000;
  return 1000 * 2 ** (attempt - 1);
}

export interface ImportReport {
  uploaded: number;
  assigned: string[];
  skipped: string[];
  missing: string[];
  brand: string[];
}

/** Cliente mínimo del panel con la sesión del dueño. El token no sale de acá. */
class StaffClient {
  private token = '';
  role = '';

  constructor(
    private readonly base: string,
    private readonly tenant: string,
    private readonly fetchImpl: Fetch,
    private readonly sleep: (ms: number) => Promise<void>,
    private readonly log: (line: string) => void,
  ) {}

  async login(email: string, password: string): Promise<void> {
    const response = await this.call('POST', '/staff/auth/login', { email, password });
    if (!response.ok) throw await apiError(response, 'login del dueño');
    const body = (await response.json()) as StaffAuthResponse;
    this.token = body.accessToken;
    this.role = body.staff.role;
  }

  async json<T>(method: string, route: string, body?: unknown): Promise<T> {
    const response = await this.call(method, route, body);
    if (!response.ok) throw await apiError(response, `${method} ${route}`);
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  /**
   * Una subida a la vez (quien llama las encadena). La API limita cuántas imágenes procesa en
   * paralelo y responde 503 cuando está llena: se reintenta con backoff. 429 (cupo por hora)
   * y el resto de errores no se reintentan.
   */
  async upload(file: string): Promise<MediaUploadResponse> {
    const type = IMAGE_TYPES[path.extname(file).toLowerCase()]!;
    const bytes = readFileSync(file);
    for (let attempt = 1; ; attempt += 1) {
      const form = new FormData();
      form.append('file', new Blob([bytes], { type }), path.basename(file));
      const response = await this.fetchImpl(`${this.base}/staff/media`, {
        method: 'POST',
        headers: this.headers(),
        body: form,
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return (await response.json()) as MediaUploadResponse;
      if (response.status !== 503 || attempt >= UPLOAD_ATTEMPTS) {
        throw await apiError(response, `subir ${path.basename(file)}`);
      }
      const wait = retryDelayMs(attempt, response.headers.get('retry-after'));
      this.log(
        `… API ocupada (503), reintento ${attempt}/${UPLOAD_ATTEMPTS - 1} en ${wait / 1000} s`,
      );
      await this.sleep(wait);
    }
  }

  private headers(): Record<string, string> {
    return {
      'x-tenant-slug': this.tenant,
      accept: 'application/json',
      ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
    };
  }

  private call(method: string, route: string, body?: unknown): Promise<Response> {
    return this.fetchImpl(`${this.base}${route}`, {
      method,
      headers: {
        ...this.headers(),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
  }
}

export async function importImages(options: ImportOptions): Promise<ImportReport> {
  const log = options.log ?? (() => undefined);
  const client = new StaffClient(
    apiBase(options.apiUrl),
    options.tenant,
    options.fetch ?? fetch,
    options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    log,
  );
  await client.login(options.email, options.password);
  const { logo, icon } = options.map.brand;
  if ((logo || icon) && client.role !== 'owner') {
    throw new Error('Logo e ícono de la marca: hace falta la cuenta del dueño');
  }

  const report: ImportReport = { uploaded: 0, assigned: [], skipped: [], missing: [], brand: [] };
  const uploads = new Map<string, string>();
  const urlFor = async (file: string): Promise<string> => {
    const cached = uploads.get(file);
    if (cached) return cached;
    if (options.dryRun) return `(dry-run) ${path.basename(file)}`;
    const { url } = await client.upload(file);
    uploads.set(file, url);
    report.uploaded += 1;
    return url;
  };

  const menu = await client.json<StaffMenu>('GET', '/staff/menu');
  const byKey = new Map<string, StaffMenu['categories'][number]['items']>();
  for (const category of menu.categories) {
    for (const item of category.items) {
      const key = normaliseName(item.name);
      byKey.set(key, [...(byKey.get(key) ?? []), item]);
    }
  }

  for (const entry of options.map.items) {
    const items = byKey.get(entry.key);
    if (!items) {
      report.missing.push(entry.name);
      log(`! sin producto en el menú: ${entry.name}`);
      continue;
    }
    for (const item of items) {
      if (item.imageUrl && !options.force) {
        report.skipped.push(item.name);
        log(`= ya tiene foto: ${item.name}`);
        continue;
      }
      const url = await urlFor(entry.file);
      if (!options.dryRun) {
        await client.json('PATCH', `/staff/menu/items/${item.id}`, { imageUrl: url });
      }
      report.assigned.push(item.name);
      log(`✓ ${item.name} ← ${path.basename(entry.file)}`);
    }
  }

  if (logo || icon) {
    const current = await client.json<Brand>('GET', '/staff/brand');
    const patch: { logoUrl?: string; iconUrl?: string } = {};
    for (const [field, file] of [
      ['logoUrl', logo],
      ['iconUrl', icon],
    ] as const) {
      if (!file) continue;
      if (current[field] && !options.force) {
        log(`= la marca ya tiene ${field}`);
        continue;
      }
      patch[field] = await urlFor(file);
      report.brand.push(field);
      log(`✓ marca ${field} ← ${path.basename(file)}`);
    }
    if (Object.keys(patch).length && !options.dryRun) {
      await client.json('PATCH', '/staff/brand', patch);
    }
  }
  return report;
}
