import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';

import { PLATFORM_AUTH_REQUEST_KEY, type PlatformPrincipal } from '@/common/auth/auth.context';
import { TokenService } from '@/modules/auth/token.service';
import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { bearerToken } from './jwt-auth.guard';

/**
 * Verifica el access token de un `PlatformAdmin` (`kind: "platform"`, sin `tid`).
 *
 * Rechaza (401) los tokens de cliente y de staff: aunque estén bien firmados, no son de
 * plataforma. Revisa además que la cuenta siga existiendo: borrar un admin corta su
 * sesión sin esperar a que expire el token.
 *
 * No se usa suelto: lo aplica `@PlatformAuth()`.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const token = bearerToken(request);
    const claims = token ? await this.tokens.verifyPlatform(token) : null;
    const admin = claims
      ? await this.prisma.platformAdmin.findUnique({
          where: { id: claims.sub },
          select: { id: true, email: true },
        })
      : null;

    if (!admin) throw new UnauthorizedException('Sesión inválida o expirada');

    const principal: PlatformPrincipal = { adminId: admin.id, email: admin.email };
    request[PLATFORM_AUTH_REQUEST_KEY] = principal;
    return true;
  }
}
