import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthKind, TenantContext, TenantRole } from '@ventea/shared';

import {
  AUTH_KIND_KEY,
  AUTH_REQUEST_KEY,
  AUTH_ROLES_KEY,
  type AuthPrincipal,
} from '@/common/auth/auth.context';
import { TENANT_REQUEST_KEY } from '@/common/tenant.context';
import { TokenService } from '@/modules/auth/token.service';

/**
 * Verifica el access token y lo ata al tenant del request.
 *
 * Rechaza (401) un token firmado para otra marca (`tid` distinto al tenant que
 * resolvió el TenantMiddleware), un refresh usado como access y un token de
 * cliente en una ruta de staff o al revés. El mensaje es siempre el mismo:
 * distinguir los casos le diría a un atacante qué parte del token falló.
 *
 * No se usa suelto: lo aplican `@CustomerAuth()` y `@StaffAuth()`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const kind = this.reflector.getAllAndOverride<AuthKind | undefined>(AUTH_KIND_KEY, targets);
    if (!kind) {
      // Programación defensiva: el guard sin tipo de sesión dejaría pasar cualquier token.
      throw new Error('JwtAuthGuard exige @CustomerAuth() o @StaffAuth() en la ruta');
    }

    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const token = bearerToken(request);
    const claims = token ? await this.tokens.verify(token, 'access') : null;
    const tenant = request[TENANT_REQUEST_KEY] as TenantContext | undefined;

    if (!claims || !tenant || claims.kind !== kind || claims.tid !== tenant.tenantId) {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }

    if (kind === 'staff') {
      const roles = this.reflector.getAllAndOverride<TenantRole[] | undefined>(
        AUTH_ROLES_KEY,
        targets,
      );
      if (!claims.role || (roles && roles.length > 0 && !roles.includes(claims.role))) {
        throw new ForbiddenException('Tu rol no permite esta acción');
      }
    }

    const principal: AuthPrincipal = {
      id: claims.sub,
      tenantId: claims.tid,
      kind: claims.kind,
      role: claims.role,
    };
    request[AUTH_REQUEST_KEY] = principal;
    return true;
  }
}

function bearerToken(request: Record<string, unknown>): string | undefined {
  const headers = request.headers as Record<string, string | string[] | undefined>;
  const header = headers.authorization;
  if (typeof header !== 'string') return undefined;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
}
