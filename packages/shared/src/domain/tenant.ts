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
 * Contexto de tenant resuelto por request. Todo acceso a datos lo exige:
 * sin `tenantId` no se consulta nada (ver docs/multi-tenancy.md).
 */
export interface TenantContext {
  tenantId: string;
  slug: TenantSlug;
}

/** Header usado para forzar tenant cuando no hay subdominio (apps nativas, desarrollo). */
export const TENANT_HEADER = 'x-tenant-slug';
