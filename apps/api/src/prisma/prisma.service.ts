import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Modelos que NO llevan tenantId porque viven por encima de los tenants
 * o son puramente relacionales. Cualquier otro modelo sin filtro de tenant
 * en una consulta es un bug de aislamiento.
 */
const TENANT_EXEMPT_MODELS = new Set<string>([
  'PlatformAdmin',
  'Tenant',
  'MenuItemModifierGroup',
]);

const READ_WRITE_ACTIONS = new Set([
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

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ log: [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }] });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.installTenantGuard();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Red de seguridad, NO el mecanismo principal de aislamiento.
   *
   * El aislamiento real lo hace cada servicio, que recibe `tenantId` del
   * TenantMiddleware y lo pone en su `where`. Este guard existe porque un olvido
   * en un solo `where` filtra datos de una marca a otra — el peor bug posible en
   * un SaaS multi-tenant. En desarrollo revienta ruidosamente; en producción
   * registra el incidente sin tumbar el request.
   *
   * Sustituir por RLS de Postgres antes de tener varios tenants con datos reales
   * (ver docs/multi-tenancy.md, sección "Camino a RLS").
   */
  private installTenantGuard(): void {
    this.$use(async (params: Prisma.MiddlewareParams, next) => {
      const model = params.model;

      if (!model || TENANT_EXEMPT_MODELS.has(model) || !READ_WRITE_ACTIONS.has(params.action)) {
        return next(params);
      }

      const where = (params.args as { where?: Record<string, unknown> } | undefined)?.where;
      const hasTenantFilter = Boolean(where && 'tenantId' in where);

      if (!hasTenantFilter) {
        const message = `Consulta sin tenantId: ${model}.${params.action}`;

        if (process.env.NODE_ENV !== 'production') {
          throw new Error(`${message}. Toda consulta de negocio filtra por tenantId.`);
        }

        this.logger.error(message);
      }

      return next(params);
    });
  }
}
