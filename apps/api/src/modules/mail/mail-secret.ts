import type { Prisma } from '@prisma/client';

import { decryptCredentials, encryptCredentials } from '@/modules/push/push-crypto';

import { SECRET_LINK_KINDS } from './mail-templates';

/**
 * Links secretos de un solo uso en la outbox (TASK-022): invitación y contraseña nueva. Las tablas
 * del equipo guardan solo el sha256 del token; la outbox no puede deshacer eso.
 *
 * - Al encolar, el link se guarda CIFRADO (AES-256-GCM, clave HKDF de `PUSH_CREDENTIALS_KEY`,
 *   `MailSettings.secretLinkKey`) con la `dedupeKey` del correo como dato asociado: copiado a
 *   otra fila no descifra.
 * - Se descifra solo en memoria, al armar el correo para enviarlo.
 * - En todo estado final (`sent`, `skipped`, `failed`) se reemplaza por `[redacted]`; por eso un
 *   correo de estos no se reenvía desde la plataforma (el dueño regenera el enlace en Equipo).
 */

const PREFIX = 'enc:';
export const REDACTED = '[redacted]';

type JsonObject = Record<string, unknown>;

export function secretLinkField(kind: string): string | undefined {
  return (SECRET_LINK_KINDS as Record<string, string | undefined>)[kind];
}

function asObject(payload: unknown): JsonObject | null {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as JsonObject)
    : null;
}

/** Payload con el link cifrado (o el mismo si el tipo no lleva link secreto). */
export function sealSecretLink(kind: string, payload: unknown, key: Buffer, aad: string): unknown {
  const field = secretLinkField(kind);
  const data = asObject(payload);
  if (!field || !data || typeof data[field] !== 'string') return payload;
  return { ...data, [field]: PREFIX + encryptCredentials(data[field], key, aad) };
}

/** Payload con el link en claro, para armar el correo. Tira si no descifra (clave, fila, formato). */
export function openSecretLink(
  kind: string,
  payload: unknown,
  key: Buffer | null,
  aad: string,
): unknown {
  const field = secretLinkField(kind);
  const data = asObject(payload);
  if (!field || !data) return payload;
  const value = data[field];
  if (typeof value !== 'string' || !value.startsWith(PREFIX) || !key) {
    throw new Error('Link secreto ausente o sin clave para descifrarlo');
  }
  return { ...data, [field]: decryptCredentials(value.slice(PREFIX.length), key, aad) };
}

/** Para el `update` que deja el correo en un estado final: el link sale de la base. */
export function withoutSecretLink(message: { kind: string; payload: Prisma.JsonValue }): {
  payload?: Prisma.InputJsonValue;
} {
  const field = secretLinkField(message.kind);
  const data = asObject(message.payload);
  if (!field || !data) return {};
  return { payload: { ...data, [field]: REDACTED } as Prisma.InputJsonValue };
}
