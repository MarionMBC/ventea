import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AUTH_KIND,
  TENANT_ROLE,
  type AuthKind,
  type AuthTokens,
  type TenantRole,
} from '@ventea/shared';
import { z } from 'zod';

import type { JwtClaims } from '@/common/auth/auth.context';

/** Lo que tiene que traer un JWT para ser aceptado, además de la firma válida. */
const claimsSchema = z.object({
  sub: z.string().min(1),
  tid: z.string().min(1),
  typ: z.enum(['access', 'refresh']),
  kind: z.enum(AUTH_KIND),
  role: z.enum(TENANT_ROLE).optional(),
});

/** Valor de `.env.example`: público, nunca puede firmar tokens en producción. */
const EXAMPLE_JWT_SECRET = 'cambiar-en-cada-entorno';
const MIN_PRODUCTION_SECRET_LENGTH = 32;

/**
 * Valida `JWT_SECRET` al arrancar. Con HS256, quien conoce el secreto forja tokens de
 * cualquier tenant: en producción se exige uno largo y distinto del de ejemplo.
 */
export function assertJwtSecret(secret: string | undefined, nodeEnv: string | undefined): string {
  if (!secret) throw new Error('Falta JWT_SECRET');
  if (nodeEnv === 'production') {
    if (secret === EXAMPLE_JWT_SECRET) {
      throw new Error('JWT_SECRET es el valor de .env.example: generar uno propio');
    }
    if (secret.length < MIN_PRODUCTION_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET demasiado corto para producción (mínimo ${MIN_PRODUCTION_SECRET_LENGTH} caracteres)`,
      );
    }
  }
  return secret;
}

const TTL_UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/**
 * Convierte `15m`, `30d`, `3600` (segundos) a segundos. Falla al arrancar si el
 * valor no se entiende: un TTL mal escrito no puede convertirse en tokens eternos.
 */
export function parseTtl(value: string): number {
  const match = /^(\d+)\s*([smhd]?)$/.exec(value.trim());
  if (!match) throw new Error(`TTL de JWT inválido: "${value}" (usar 900, 15m, 12h, 30d)`);
  const amount = Number(match[1]);
  const unit = TTL_UNITS[match[2] || 's'] ?? 1;
  if (amount <= 0) throw new Error(`TTL de JWT inválido: "${value}"`);
  return amount * unit;
}

/**
 * Emite y verifica los JWT (HS256 con `JWT_SECRET`).
 *
 * El refresh es un JWT firmado sin tabla de sesiones (decisión 2026-10-08): no hay
 * revocación server-side, el logout es que el cliente descarte los tokens.
 */
@Injectable()
export class TokenService {
  private readonly accessTtl: number;
  private readonly refreshTtl: number;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.accessTtl = parseTtl(config.get<string>('JWT_ACCESS_TTL') || '15m');
    this.refreshTtl = parseTtl(config.get<string>('JWT_REFRESH_TTL') || '30d');
  }

  async issuePair(input: {
    subject: string;
    tenantId: string;
    kind: AuthKind;
    role?: TenantRole;
  }): Promise<AuthTokens> {
    const base = { sub: input.subject, tid: input.tenantId, kind: input.kind, role: input.role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync({ ...base, typ: 'access' }, { expiresIn: this.accessTtl }),
      this.jwt.signAsync({ ...base, typ: 'refresh' }, { expiresIn: this.refreshTtl }),
    ]);
    return { accessToken, refreshToken };
  }

  /** Devuelve los claims si la firma es válida, no expiró y el `typ` coincide; si no, `null`. */
  async verify(token: string, typ: JwtClaims['typ']): Promise<JwtClaims | null> {
    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        algorithms: ['HS256'],
      });
    } catch {
      return null;
    }

    const claims = claimsSchema.safeParse(payload);
    if (!claims.success || claims.data.typ !== typ) return null;
    return claims.data;
  }
}
