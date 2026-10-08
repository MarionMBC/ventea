import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  SUBSCRIPTION_STATUS,
  type BillingSummary,
  type RecordPaymentInput,
  type ResolvePaymentInput,
  type SubscriptionStatus,
} from '@ventea/shared';

import type { PlatformPrincipal } from '@/common/auth/auth.context';
import { fitsLocationLimit } from '@/modules/subscriptions/plan-limits';
import { addDays } from '@/modules/subscriptions/subscription-state';
import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { BillingLockService, subscriptionLockKey } from './billing-lock.service';
import { BillingOutcomeService } from './billing-outcome.service';
import { monthlyValueCents, nextPeriodStart } from './billing-rules';
import {
  BILLING_SUBSCRIPTION_SELECT,
  nextPeriodPlan,
  type BillingSubscription,
} from './billing.mapper';

const SUMMARY_CURRENCY = 'USD';
const FAILURE_WINDOW_DAYS = 7;

/**
 * Cobro desde el panel de plataforma: pagos manuales (`BILLING_MODE=manual`, o transferencia
 * en cualquier modo), cierre a mano de intentos que la pasarela no pudo confirmar y el
 * resumen de facturación del SaaS.
 */
@Injectable()
export class PlatformBillingService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    private readonly locks: BillingLockService,
    private readonly outcomes: BillingOutcomeService,
  ) {}

  /**
   * Pago recibido por fuera: abre un período desde `nextPeriodStart` (lo que ya estaba
   * cubierto no se pierde), `active`, y aplica el cambio de plan agendado si cabe.
   */
  async recordPayment(
    slug: string,
    admin: PlatformPrincipal,
    input: RecordPaymentInput,
  ): Promise<void> {
    const subscription = await this.loadBySlug(slug);
    await this.withSubscriptionLock(subscription.id, async () => {
      const current = await this.load(subscription.tenantId);
      const { plan, interval } = await this.nextPlanThatFits(current);
      await this.outcomes.applyPaid({
        tenantId: current.tenantId,
        subscriptionId: current.id,
        expect: {},
        periodStart: nextPeriodStart(current, new Date()),
        plan,
        interval,
        previous: { planCode: current.plan.code, interval: current.interval },
        amountCents: input.amountCents,
        orderId: null,
        message: `Pago manual (${input.reference}) registrado por ${admin.email}`,
      });
    });
  }

  /**
   * Cierra un intento `pending`/`unknown` que la pasarela no puede confirmar (timeout sin
   * `transactionId`). El admin lo verificó en el panel del procesador.
   */
  async resolvePayment(
    slug: string,
    admin: PlatformPrincipal,
    input: ResolvePaymentInput,
  ): Promise<void> {
    const subscription = await this.loadBySlug(slug);
    await this.withSubscriptionLock(subscription.id, async () => {
      const attempt = await this.prisma.paymentAttempt.findFirst({
        where: {
          tenantId: subscription.tenantId,
          orderId: input.orderId,
          status: { in: ['pending', 'unknown'] },
        },
      });
      if (!attempt) throw new NotFoundException('No hay un cobro sin confirmar con ese orderId');

      const current = await this.load(subscription.tenantId);
      const by = `por ${admin.email}${input.note ? `: ${input.note}` : ''}`;
      const base = {
        tenantId: attempt.tenantId,
        subscriptionId: attempt.subscriptionId,
        orderId: attempt.orderId,
        amountCents: attempt.amountCents,
      };

      if (input.outcome === 'failed') {
        const result = { status: 'declined' as const, message: `Resuelto como no cobrado ${by}` };
        if (attempt.kind === 'renewal') {
          await this.outcomes.applyRenewalFailure({
            ...base,
            attempt: attempt.attempt,
            periodStart: attempt.periodStart,
            result,
          });
        } else {
          await this.outcomes.applyEstablishFailure({ ...base, result });
        }
        return;
      }

      const { plan, interval } = await this.nextPlanThatFits(current);
      await this.outcomes.applyPaid({
        ...base,
        // Renovación: solo si sigue en ese período. Alta: el dueño pagó, se abre igual.
        expect:
          attempt.kind === 'renewal'
            ? { status: ['active', 'past_due'], currentPeriodEnd: attempt.periodStart }
            : {},
        periodStart: attempt.periodStart,
        plan,
        interval,
        previous: { planCode: current.plan.code, interval: current.interval },
        providerTransactionId: attempt.providerTransactionId,
        message:
          attempt.kind === 'renewal'
            ? `Renovación confirmada a mano ${by}`
            : `Cobro de alta confirmado a mano ${by}; la tarjeta no quedó guardada: el dueño debe registrarla de nuevo`,
      });
    });
  }

  async summary(now: Date = new Date()): Promise<BillingSummary> {
    const since = addDays(now, -FAILURE_WINDOW_DAYS);
    // Por `Tenant` (exento del guard): es el único modelo que cruza marcas.
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: {
        subscription: {
          select: {
            status: true,
            interval: true,
            plan: { select: { priceMonthlyCents: true, priceYearlyCents: true } },
          },
        },
        _count: {
          select: {
            billingEvents: { where: { type: 'payment_failed', createdAt: { gte: since } } },
            paymentAttempts: { where: { status: { in: ['pending', 'unknown'] } } },
          },
        },
      },
    });

    const byStatus = Object.fromEntries(SUBSCRIPTION_STATUS.map((s) => [s, 0])) as Record<
      SubscriptionStatus,
      number
    >;
    let mrrCents = 0;
    let failuresLast7Days = 0;
    let unresolvedPayments = 0;
    for (const { subscription, _count } of tenants) {
      failuresLast7Days += _count.billingEvents;
      unresolvedPayments += _count.paymentAttempts;
      if (!subscription) continue;
      byStatus[subscription.status] += 1;
      if (subscription.status === 'active') {
        mrrCents += monthlyValueCents(subscription.plan, subscription.interval);
      }
    }
    return {
      currency: SUMMARY_CURRENCY,
      mrrCents,
      byStatus,
      failuresLast7Days,
      unresolvedPayments,
    };
  }

  private async nextPlanThatFits(subscription: BillingSubscription) {
    const next = nextPeriodPlan(subscription);
    if (next.plan.id === subscription.plan.id) return next;
    const active = await this.prisma.location.count({
      where: { tenantId: subscription.tenantId, isActive: true },
    });
    return fitsLocationLimit(next.plan.maxLocations, active)
      ? next
      : { plan: subscription.plan, interval: subscription.interval };
  }

  private async withSubscriptionLock(id: string, fn: () => Promise<void>): Promise<void> {
    const lock = await this.locks.withTryLock(subscriptionLockKey(id), fn);
    if (!lock.acquired) {
      throw new ConflictException('Hay un cobro en curso para esta marca; intenta en un momento');
    }
  }

  private async loadBySlug(slug: string): Promise<BillingSubscription> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { subscription: { select: BILLING_SUBSCRIPTION_SELECT } },
    });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    if (!tenant.subscription) throw new ConflictException('La marca no tiene suscripción');
    return tenant.subscription;
  }

  private async load(tenantId: string): Promise<BillingSubscription> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      select: BILLING_SUBSCRIPTION_SELECT,
    });
    if (!subscription) throw new ConflictException('La marca no tiene suscripción');
    return subscription;
  }
}
