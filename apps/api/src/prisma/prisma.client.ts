import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const logger = new Logger('PrismaTenantGuard');

/**
 * Modelos que NO llevan tenantId porque viven por encima de los tenants
 * o son puramente relacionales. Cualquier otro modelo consultado sin filtro
 * de tenant es un bug de aislamiento.
 */
const TENANT_EXEMPT_MODELS = new Set<string>(['PlatformAdmin', 'Tenant', 'MenuItemModifierGroup']);

/** Operaciones que leen o afectan múltiples filas y por lo tanto exigen el filtro. */
const GUARDED_OPERATIONS = new Set<string>([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

/**
 * Crea el cliente Prisma con el guard de tenant instalado.
 *
 * El guard es una RED DE SEGURIDAD, no el mecanismo de aislamiento. El aislamiento
 * real lo hace cada servicio, que recibe `tenantId` del TenantMiddleware y lo pone
 * en su `where`. Esto existe porque un olvido en un solo `where` filtra datos de una
 * marca a otra — el peor bug posible en un SaaS multi-tenant.
 *
 * En desarrollo revienta ruidosamente; en producción registra el incidente sin
 * tumbar el request. No puede corregir el olvido: no hay forma de adivinar de qué
 * tenant es una consulta que no lo dice.
 *
 * Sustituir por RLS de Postgres antes de tener varios tenants con datos reales
 * (ver docs/multi-tenancy.md, sección "Camino a RLS").
 */
export function createPrismaClient(connectionString: string) {
  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({ adapter }).$extends({
    name: 'tenantGuard',
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ model, operation, args, query }: any) {
          const needsTenant = !TENANT_EXEMPT_MODELS.has(model) && GUARDED_OPERATIONS.has(operation);

          if (needsTenant) {
            const where = (args as { where?: Record<string, unknown> } | undefined)?.where;

            if (!where || !('tenantId' in where)) {
              const message = `Consulta sin tenantId: ${model}.${operation}`;

              if (process.env.NODE_ENV !== 'production') {
                throw new Error(`${message}. Toda consulta de negocio filtra por tenantId.`);
              }

              logger.error(message);
            }
          }

          return query(args);
        },
      },
    },
  });
}

/** Tipo del cliente extendido. Es lo que se inyecta en los servicios. */
export type PrismaClientExtended = ReturnType<typeof createPrismaClient>;

/**
 * Lo que reciben los servicios que pueden correr dentro o fuera de una transacción
 * interactiva: el cliente extendido o el `tx` de `$transaction(async (tx) => …)`.
 */
export type PrismaDb = Omit<
  PrismaClientExtended,
  '$transaction' | '$connect' | '$disconnect' | '$on' | '$extends'
>;
