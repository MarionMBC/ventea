import { createHash } from 'node:crypto';

import { ConflictException } from '@nestjs/common';
import type { CreateOrderInput } from '@ventea/shared';

/**
 * Huella del cuerpo de `POST /api/orders` para el Idempotency-Key.
 *
 * Se calcula sobre el cuerpo YA validado por zod: sin campos desconocidos, con los
 * defaults aplicados y las claves en el orden del schema. Así dos reintentos del
 * mismo pedido dan el mismo hash aunque el JSON original difiera en orden o en
 * campos que la API ignora (p. ej. precios que mande el cliente).
 */
export function hashOrderRequest(input: CreateOrderInput): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

/** Misma clave con otro cuerpo: el cliente reutilizó una clave para otro pedido. */
export function assertSameRequest(storedHash: string | null, requestHash: string): void {
  if (storedHash !== requestHash) {
    throw new ConflictException('Idempotency-Key reutilizada con otro pedido');
  }
}
