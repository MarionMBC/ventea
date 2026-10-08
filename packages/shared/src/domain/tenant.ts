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
 * Subdominios que el proxy o la plataforma usan para otra cosa: ninguna marca puede
 * llamarse así. Los usan el registro self-service y el script `create-tenant`.
 */
export const RESERVED_TENANT_SLUGS: readonly string[] = [
  'www',
  'api',
  'admin',
  'app',
  'mail',
  'status',
  'docs',
  'platform',
  'ventea',
  'billing',
  'help',
  'support',
  'blog',
  'static',
  'cdn',
  'traefik',
];

export function isReservedTenantSlug(slug: string): boolean {
  return RESERVED_TENANT_SLUGS.includes(slug);
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
