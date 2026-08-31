/**
 * En la app nativa no hay subdominio, así que el tenant se fija en tiempo de build
 * (VITE_DEFAULT_TENANT_SLUG) y viaja en el header X-Tenant-Slug de cada request.
 * Un binario = una marca.
 */
import { TENANT_HEADER, tenantSlugSchema } from '@ventea/shared';

export const TENANT_SLUG = tenantSlugSchema.parse(
  import.meta.env.VITE_DEFAULT_TENANT_SLUG ?? 'carolina-hot-chicken',
);

export const tenantHeaders: Record<string, string> = {
  [TENANT_HEADER]: TENANT_SLUG,
};
