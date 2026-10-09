import { createHash, randomBytes } from 'node:crypto';

import { TEAM_LINK_TTL_HOURS } from '@ventea/shared';

/**
 * Tokens de los enlaces del equipo (invitación, contraseña nueva). 32 bytes aleatorios: con
 * esa entropía no hay diccionario que probar, así que basta sha256 (sin sal ni argon2) para
 * que un volcado de la base no sirva para entrar. El token en claro sale una sola vez.
 */
export function newTeamToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashTeamToken(token) };
}

export function hashTeamToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function teamLinkExpiry(now: Date): Date {
  return new Date(now.getTime() + TEAM_LINK_TTL_HOURS * 60 * 60 * 1000);
}
