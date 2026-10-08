import { z } from 'zod';

/**
 * Slug del tenant: identifica la marca en subdominio y URLs públicas.
 * Minúsculas, dígitos y guiones. Ej: `carolina-hot-chicken`.
 */
export const tenantSlugSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug: minúsculas, dígitos y guiones simples');

export type TenantSlug = z.infer<typeof tenantSlugSchema>;

/**
 * Subdominios que ninguna marca puede tomar: los que el proxy o la plataforma usan para
 * otra cosa, y los que servirían para suplantar (phishing con TLS válido bajo
 * `*.ventea.tech`). Los usan el registro self-service y el script `create-tenant`.
 */
export const RESERVED_TENANT_SLUGS: readonly string[] = [
  // infraestructura y plataforma
  'www',
  'api',
  'app',
  'mail',
  'status',
  'docs',
  'platform',
  'billing',
  'help',
  'support',
  'soporte',
  'blog',
  'static',
  'cdn',
  'traefik',
  // suplantación obvia
  'login',
  'signin',
  'secure',
  'seguridad',
  'pay',
  'pagos',
  'pago',
  'banco',
  'bank',
  'account',
  'cuenta',
  'verify',
  'verificar',
  'password',
];

/** Prefijos reservados: `admin`, `admin-panel`, `administracion`… */
const RESERVED_SLUG_PREFIXES: readonly string[] = ['admin'];

/** Fragmentos prohibidos en cualquier posición: la marca de la plataforma. */
const RESERVED_SLUG_FRAGMENTS: readonly string[] = ['ventea'];

export function isReservedTenantSlug(slug: string): boolean {
  return (
    RESERVED_TENANT_SLUGS.includes(slug) ||
    RESERVED_SLUG_PREFIXES.some((prefix) => slug.startsWith(prefix)) ||
    RESERVED_SLUG_FRAGMENTS.some((fragment) => slug.includes(fragment))
  );
}

/**
 * Contexto de tenant resuelto por request. Todo acceso a datos lo exige:
 * sin `tenantId` no se consulta nada (ver docs/multi-tenancy.md).
 */
export interface TenantContext {
  tenantId: string;
  slug: TenantSlug;
}

/** Header usado para forzar tenant cuando no hay subdominio (apps nativas, desarrollo). */
export const TENANT_HEADER = 'x-tenant-slug';
