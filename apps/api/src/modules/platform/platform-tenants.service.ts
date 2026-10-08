import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  ChangePlanInput,
  PlatformTenantDetail,
  PlatformTenantListQuery,
  PlatformTenantPage,
  SubscriptionStatus,
} from '@ventea/shared';

import type { PlatformPrincipal } from '@/common/auth/auth.context';
import { BillingLockService, subscriptionLockKey } from '@/modules/billing/billing-lock.service';
import { PlanLimitsService } from '@/modules/subscriptions/plan-limits.service';
import { OPEN_ATTEMPT_STATUSES } from '@/modules/subscriptions/subscriptions.service';
import {
  addDays,
  extendedTrialEnd,
  nextStatus,
  periodEnd,
  type SubscriptionAction,
} from '@/modules/subscriptions/subscription-state';
import type { PrismaClientExtended, PrismaDb } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { PLATFORM_TENANT_INCLUDE, toPlatformTenant } from './platform.mapper';

const RECENT_ORDERS_DAYS = 30;
const DETAIL_EVENTS = 20;

const ACTION_LABEL: Record<SubscriptionAction, string> = {
  suspend: 'suspender',
  reactivate: 'reactivar',
  extend_trial: 'extender la prueba de',
  change_plan: 'cambiar el plan de',
};

/**
 * Administración de las marcas desde la plataforma. Cruza tenants por definición: lee por
 * `Tenant` (exento del guard) y, cuando consulta tablas de negocio, lo hace con
 * `tenantId` explícito (uno, o `{ in: [...] }` para los conteos del listado).
 *
 * Cada cambio de suscripción es condicional sobre el estado leído (`updateMany` con
 * `status` en el where): si otro request lo cambió en el medio, 409 en vez de pisarlo.
 */
@Injectable()
export class PlatformTenantsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    private readonly limits: PlanLimitsService,
    private readonly locks: BillingLockService,
  ) {}

  async list({ page, pageSize }: PlatformTenantListQuery): Promise<PlatformTenantPage> {
    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        include: PLATFORM_TENANT_INCLUDE,
        // `id` desempata altas en el mismo milisegundo: sin él, una página podría repetir
        // o saltarse marcas.
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tenant.count(),
    ]);
    const counts = await this.recentOrderCounts(tenants.map((t) => t.id));
    return {
      items: tenants.map((tenant) => toPlatformTenant(tenant, counts.get(tenant.id) ?? 0)),
      total,
      page,
      pageSize,
    };
  }

  async detail(slug: string): Promise<PlatformTenantDetail> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      include: {
        ...PLATFORM_TENANT_INCLUDE,
        billingEvents: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: DETAIL_EVENTS },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    const [counts, activeLocations] = await Promise.all([
      this.recentOrderCounts([tenant.id]),
      this.prisma.location.count({ where: { tenantId: tenant.id, isActive: true } }),
    ]);

    return {
      ...toPlatformTenant(tenant, counts.get(tenant.id) ?? 0),
      activeLocations,
      billingEvents: tenant.billingEvents.map((event) => ({
        type: event.type,
        amountCents: event.amountCents,
        status: event.status,
        message: event.message,
        createdAt: event.createdAt,
      })),
      card: tenant.subscription?.paymentToken
        ? { brand: tenant.subscription.cardBrand, last4: tenant.subscription.cardLast4 }
        : null,
    };
  }

  async suspend(
    slug: string,
    admin: PlatformPrincipal,
    reason?: string,
  ): Promise<PlatformTenantDetail> {
    await this.transition(slug, 'suspend', async (tx, { tenantId, status }) => {
      await this.updateSubscription(tx, tenantId, status, { status: 'suspended' });
      await tx.billingEvent.create({
        data: {
          tenantId,
          type: 'suspended',
          message: withReason(`Suspendida por ${admin.email}`, reason),
        },
      });
    });
    return this.detail(slug);
  }

  /** Reactivar = pago manual del admin (sin cobro todavía): abre un período desde hoy. */
  /**
   * Reactivar = pago manual del admin: abre un período desde hoy, salvo que el vigente ya esté
   * pagado (p. ej. una renovación conciliada mientras estaba suspendida): ese se conserva.
   * Toma el lock de cobro de la suscripción y da `409` con un cobro con tarjeta sin confirmar
   * (podría ser el mismo período: doble pago). Suspender, en cambio, siempre gana.
   */
  async reactivate(slug: string, admin: PlatformPrincipal): Promise<PlatformTenantDetail> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, subscription: { select: { id: true } } },
    });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    if (!tenant.subscription) throw new ConflictException('La marca no tiene suscripción');
    const subscriptionId = tenant.subscription.id;

    const lock = await this.locks.withTryLock(subscriptionLockKey(subscriptionId), async () => {
      const open = await this.prisma.paymentAttempt.count({
        where: { tenantId: tenant.id, subscriptionId, status: { in: OPEN_ATTEMPT_STATUSES } },
      });
      if (open > 0) {
        throw new ConflictException(
          'Hay un cobro con tarjeta sin confirmar: resuélvelo primero (resolve-payment)',
        );
      }
      await this.reactivateUnlocked(slug, admin);
    });
    if (!lock.acquired) {
      throw new ConflictException('Hay un cobro en curso para esta marca; intenta en un momento');
    }
    return this.detail(slug);
  }

  private async reactivateUnlocked(slug: string, admin: PlatformPrincipal): Promise<void> {
    await this.transition(slug, 'reactivate', async (tx, { tenantId, status, interval }) => {
      const now = new Date();
      const current = await tx.subscription.findUnique({
        where: { tenantId },
        select: { currentPeriodEnd: true },
      });
      const paidPeriodLeft = current && current.currentPeriodEnd.getTime() > now.getTime();
      await this.updateSubscription(tx, tenantId, status, {
        status: 'active',
        ...(paidPeriodLeft
          ? {}
          : { currentPeriodStart: now, currentPeriodEnd: periodEnd(now, interval) }),
        cancelAtPeriodEnd: false,
      });
      await tx.billingEvent.create({
        data: { tenantId, type: 'reactivated', message: `Reactivada por ${admin.email}` },
      });
    });
  }

  async changePlan(
    slug: string,
    admin: PlatformPrincipal,
    input: ChangePlanInput,
  ): Promise<PlatformTenantDetail> {
    const plan = await this.prisma.plan.findFirst({
      where: { code: input.planCode, isActive: true },
      select: { id: true, code: true, name: true, maxLocations: true },
    });
    if (!plan) throw new BadRequestException('Plan no disponible');

    await this.transition(slug, 'change_plan', async (tx, current) => {
      const interval = input.interval ?? current.interval;
      if (current.planCode === plan.code && current.interval === interval) return;

      await this.limits.assertFitsPlan(current.tenantId, plan, tx);
      // Cambio inmediato del admin: un cambio agendado por el dueño queda sin efecto.
      await this.updateSubscription(tx, current.tenantId, current.status, {
        planId: plan.id,
        interval,
        pendingPlanId: null,
        pendingInterval: null,
      });
      await tx.billingEvent.create({
        data: {
          tenantId: current.tenantId,
          type: 'plan_changed',
          message: `${current.planCode} (${current.interval}) → ${plan.code} (${interval}) por ${admin.email}`,
        },
      });
    });
    return this.detail(slug);
  }

  async extendTrial(
    slug: string,
    admin: PlatformPrincipal,
    days: number,
  ): Promise<PlatformTenantDetail> {
    await this.transition(slug, 'extend_trial', async (tx, { tenantId, status, trialEndsAt }) => {
      const now = new Date();
      const newEnd = extendedTrialEnd(trialEndsAt, now, days);
      await this.updateSubscription(tx, tenantId, status, {
        status: 'trialing',
        trialEndsAt: newEnd,
        currentPeriodEnd: newEnd,
      });
      await tx.billingEvent.create({
        data: {
          tenantId,
          type: 'trial_extended',
          message: `+${days} días (hasta ${newEnd.toISOString().slice(0, 10)}) por ${admin.email}`,
        },
      });
    });
    return this.detail(slug);
  }

  /** Pedidos de los últimos 30 días por tenant, en una sola consulta. */
  private async recentOrderCounts(tenantIds: string[]): Promise<Map<string, number>> {
    if (tenantIds.length === 0) return new Map();
    const rows = await this.prisma.order.groupBy({
      by: ['tenantId'],
      where: {
        tenantId: { in: tenantIds },
        createdAt: { gte: addDays(new Date(), -RECENT_ORDERS_DAYS) },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.tenantId, row._count._all]));
  }

  /**
   * Lee la suscripción de la marca, valida que la acción se pueda desde su estado y corre
   * `apply` en una transacción.
   */
  private async transition(
    slug: string,
    action: SubscriptionAction,
    apply: (tx: PrismaDb, current: CurrentSubscription) => Promise<void>,
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        subscription: {
          select: {
            status: true,
            interval: true,
            trialEndsAt: true,
            plan: { select: { code: true } },
          },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    const { subscription } = tenant;
    if (!subscription) throw new ConflictException('La marca no tiene suscripción');

    if (nextStatus(subscription.status, action) === null) {
      throw new ConflictException(
        `No se puede ${ACTION_LABEL[action]} una suscripción en estado ${subscription.status}`,
      );
    }

    await this.prisma.$transaction((tx) =>
      apply(tx, {
        tenantId: tenant.id,
        status: subscription.status,
        interval: subscription.interval,
        trialEndsAt: subscription.trialEndsAt,
        planCode: subscription.plan.code,
      }),
    );
  }

  /**
   * Actualiza la suscripción solo si sigue en el estado leído. `updateMany` bloquea la
   * fila: un request concurrente espera, vuelve a evaluar el where y no encuentra nada.
   */
  private async updateSubscription(
    tx: PrismaDb,
    tenantId: string,
    expectedStatus: SubscriptionStatus,
    data: Prisma.SubscriptionUncheckedUpdateManyInput,
  ): Promise<void> {
    const { count } = await tx.subscription.updateMany({
      where: { tenantId, status: expectedStatus },
      data,
    });
    if (count === 0) {
      throw new ConflictException(
        'La suscripción cambió mientras tanto; recarga e intenta de nuevo',
      );
    }
  }
}

interface CurrentSubscription {
  tenantId: string;
  status: SubscriptionStatus;
  interval: 'month' | 'year';
  trialEndsAt: Date | null;
  planCode: string;
}

function withReason(message: string, reason?: string): string {
  return reason ? `${message}: ${reason}` : message;
}
