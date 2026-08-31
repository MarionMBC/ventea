import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { TenantContext } from '@ventea/shared';

/**
 * Clave donde el TenantMiddleware deja el contexto resuelto en el request.
 * Nada lee `req.tenant` a mano: se usa el decorador `@CurrentTenant()`.
 */
export const TENANT_REQUEST_KEY = 'ventea:tenant';

export interface RequestWithTenant extends Request {
  [TENANT_REQUEST_KEY]?: TenantContext;
}

/** Inyecta el tenant resuelto en un handler de controlador. */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest<Record<string, unknown>>();
    const tenant = request[TENANT_REQUEST_KEY] as TenantContext | undefined;

    if (!tenant) {
      // Programación defensiva: si esto salta, una ruta quedó fuera del middleware.
      // Preferimos romper antes que servir datos sin filtrar por tenant.
      throw new Error('No hay tenant en el request. Toda ruta debe pasar por TenantMiddleware.');
    }

    return tenant;
  },
);
