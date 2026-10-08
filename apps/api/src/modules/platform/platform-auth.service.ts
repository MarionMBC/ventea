import { Inject, Injectable, UnauthorizedException, type OnModuleInit } from '@nestjs/common';
import type { LoginInput, PlatformAuthResponse } from '@ventea/shared';
import argon2 from 'argon2';

import { TokenService } from '@/modules/auth/token.service';
import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

/** Mismo mensaje para email inexistente y clave incorrecta: no se puede enumerar cuentas. */
const INVALID_CREDENTIALS = 'Email o contraseña incorrectos';

/** Login de los administradores de la plataforma (`PlatformAdmin`). */
@Injectable()
export class PlatformAuthService implements OnModuleInit {
  /**
   * Hash de relleno: un email inexistente tarda lo mismo que una clave incorrecta. Se
   * calcula al arrancar, no en el primer login: si no, ese primer login con un email
   * inexistente tardaría el doble (hash + verify) y delataría que no existe.
   */
  private dummyHash!: string;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    private readonly tokens: TokenService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await argon2.hash('ventea-dummy-password');
  }

  async login(input: LoginInput): Promise<PlatformAuthResponse> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email: input.email },
      select: { id: true, email: true, name: true, passwordHash: true, tokenVersion: true },
    });

    if (!(await this.passwordMatches(admin?.passwordHash ?? null, input.password)) || !admin) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    return {
      accessToken: await this.tokens.issuePlatformAccess(admin.id, admin.tokenVersion),
      admin: { id: admin.id, email: admin.email, name: admin.name },
    };
  }

  private async passwordMatches(hash: string | null, password: string): Promise<boolean> {
    if (!hash) {
      await argon2.verify(this.dummyHash, password);
      return false;
    }
    try {
      return await argon2.verify(hash, password);
    } catch {
      // Hash corrupto o de otro algoritmo: se trata como clave incorrecta.
      return false;
    }
  }
}
