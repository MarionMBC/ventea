import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifrado en reposo de las credenciales push de cada marca (TASK-016): AES-256-GCM con la
 * clave `PUSH_CREDENTIALS_KEY` (32 bytes, base64 o hex) y el `tenantId` como dato asociado
 * (AAD). Con la AAD, un texto cifrado copiado a la fila de otra marca no descifra: las
 * credenciales quedan atadas a su marca aunque alguien mueva datos en la base.
 *
 * Formato guardado: `v1.<iv base64url>.<tag base64url>.<cifrado base64url>`.
 */

const VERSION = 'v1';
const IV_BYTES = 12;
/**
 * Tag fijo de 16 bytes en las dos puntas: sin `authTagLength`, Node acepta en `setAuthTag` un
 * tag truncado (hasta 4 bytes) y la integridad baja a 32 bits.
 */
const TAG_BYTES = 16;

/** Lee la clave de la variable de entorno. `null` si falta o no mide 32 bytes. */
export function parseCredentialsKey(raw: string | undefined): Buffer | null {
  const value = raw?.trim();
  if (!value) return null;
  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');
  return key.length === 32 ? key : null;
}

export function encryptCredentials(plain: string, key: Buffer, tenantId: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(tenantId, 'utf8'));
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, data]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

/** Lanza si la clave, la marca o el texto no coinciden (GCM verifica la integridad). */
export function decryptCredentials(stored: string, key: Buffer, tenantId: string): string {
  const [version, iv, tag, data] = stored.split('.');
  if (version !== VERSION || !iv || !tag || !data)
    throw new Error('Credenciales push con formato desconocido');
  const ivBytes = Buffer.from(iv, 'base64url');
  const tagBytes = Buffer.from(tag, 'base64url');
  if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) {
    throw new Error('Credenciales push con IV o tag de largo inválido');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, ivBytes, { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(tenantId, 'utf8'));
  decipher.setAuthTag(tagBytes);
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
