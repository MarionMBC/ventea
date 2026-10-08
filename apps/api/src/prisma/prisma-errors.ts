import { Prisma } from '@prisma/client';

/** Violación de un índice único (P2002): email repetido, código de pedido repetido… */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** El registro a actualizar no existe (P2025). */
export function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

/** Violación de clave foránea (P2003): la fila referenciada desapareció a mitad de camino. */
export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}
