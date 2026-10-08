import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { fitsLocationLimit } from '@/modules/subscriptions/plan-limits';
import { addDays, periodEnd } from '@/modules/subscriptions/subscription-state';
import { SubscriptionsService } from '@/modules/subscriptions/subscriptions.service';
import { isUniqueViolation } from '@/prisma/prisma-errors';
import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import {
  BILLING_CYCLE_LOCK,
  BillingLockService,
  subscriptionLockKey,
} from './billing-lock.service';
import {
  BillingOutcomeService,
  OPEN_ATTEMPT_STATUSES,
  RECONCILABLE_ATTEMPT_STATUSES,
} from './billing-outcome.service';
import {
  checkApproval,
  GRACE_DAYS,
  MAX_RENEWAL_ATTEMPTS,
  planPriceCents,
  renewalOrderId,
} from './billing-rules';
import {
  BILLING_SUBSCRIPTION_SELECT,
  canChargeRecurring,
  nextPeriodPlan,
  type BillingPlan,
  type BillingSubscription,
} from './billing.mapper';
import {
  GatewayError,
  PAYMENT_GATEWAY,
  type ChargeResult,
  type PaymentGateway,
} from './gateway/payment-gateway';

export interface BillingCycleSummary {
  /** Otra réplica (u otra corrida) tenía el lock: esta no hizo nada. */
  skipped: boolean;
  reconciled: number;
  charged: { approved: number; declined: number; unknown: number };
  canceled: number;
  pastDue: number;
  suspended: number;
  /** Suscripciones salteadas (lock tomado, intento abierto, pasarela caída, error…). */
  deferred: number;
}

type RenewalOutcome = 'approved' | 'declined' | 'unknown' | 'deferred';

/** Cobros desconocidos seguidos que cortan las renovaciones de la corrida (circuit breaker). */
export const UNKNOWN_BREAKER = 3;

const HAS_CARD = { paymentToken: { not: null }, networkTransactionId: { not: null } };
const NO_CARD = { OR: [{ paymentToken: null }, { networkTransactionId: null }] };
/** Una suscripción con un cobro abierto no cambia de estado sola: primero se sabe si pagó. */
const NO_OPEN_ATTEMPT = { attempts: { none: { status: { in: OPEN_ATTEMPT_STATUSES } } } };

/** Intento abierto, con lo que se cobró congelado. */
interface FrozenAttempt {
  tenantId: string;
  subscriptionId: string;
  orderId: string;
  periodStart: Date;
  periodEnd: Date;
  interval: BillingSubscription['interval'];
  amountCents: number;
  plan: { id: string; code: string };
}

/**
 * Ciclo de cobro (TASK-005). Lo dispara `BillingScheduler` cada 15 min o el script
 * `run-billing-cycle`. Un lock de Postgres deja correr a una sola réplica; dentro, cada
 * suscripción se cobra con su propio lock (el alta de tarjeta del dueño usa el mismo).
 *
 * Invariantes de dinero:
 * - una suscripción tiene como mucho UN intento abierto (pending/unknown), de cualquier tipo;
 *   mientras lo tenga no se le cobra nada más ni cambia de estado sola;
 * - lo cobrado queda congelado en el intento y se aplica desde ahí.
 *
 * Orden: 1) conciliar intentos sin confirmar vía `status`; 2) cancelar las que pidieron
 * cancelar al fin del período; 3) cobrar renovaciones vencidas (solo `ms-payments`);
 * 4) vencer estados de lo que no se cobra solo (prueba vencida, sin tarjeta, modo manual).
 */
@Injectable()
export class BillingCycleService {
  private readonly logger = new Logger(BillingCycleService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly locks: BillingLockService,
    private readonly outcomes: BillingOutcomeService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async run(now: Date = new Date()): Promise<BillingCycleSummary> {
    const summary: BillingCycleSummary = {
      skipped: false,
      reconciled: 0,
      charged: { approved: 0, declined: 0, unknown: 0 },
      canceled: 0,
      pastDue: 0,
      suspended: 0,
      deferred: 0,
    };
    const lock = await this.locks.withTryLock(BILLING_CYCLE_LOCK, async () => {
      await this.reconcile(now, summary);
      await this.cancelAtPeriodEnd(now, summary);
      if (this.gateway.mode === 'ms-payments') await this.renew(now, summary);
      await this.expire(now, summary);
    });
    if (!lock.acquired) return { ...summary, skipped: true };
    this.logger.log(`Ciclo de cobro: ${JSON.stringify(summary)}`);
    return summary;
  }

  // ─── 1. Conciliación ─────────────────────────────────────────────────────────

  /**
   * Intentos de renovación `pending` (el proceso murió a mitad) o `unknown` (timeout): se
   * consulta a la pasarela. Los de alta de tarjeta los resuelve el admin (`resolve-payment`):
   * su aprobación tardía no trae el `networkTransactionId` que ancla la serie.
   */
  private async reconcile(now: Date, summary: BillingCycleSummary): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: {
        paymentAttempts: {
          some: { kind: 'renewal', status: { in: RECONCILABLE_ATTEMPT_STATUSES } },
        },
      },
      select: {
        id: true,
        paymentAttempts: {
          where: { kind: 'renewal', status: { in: RECONCILABLE_ATTEMPT_STATUSES } },
          select: { subscriptionId: true },
        },
      },
    });

    for (const tenant of tenants) {
      const subscriptionIds = new Set(tenant.paymentAttempts.map((a) => a.subscriptionId));
      for (const subscriptionId of subscriptionIds) {
        try {
          const lock = await this.locks.withTryLock(subscriptionLockKey(subscriptionId), () =>
            this.reconcileSubscription(tenant.id, subscriptionId, now),
          );
          if (lock.acquired) summary.reconciled += lock.value;
          else summary.deferred += 1;
        } catch (error) {
          summary.deferred += 1;
          if (error instanceof GatewayError) {
            this.logger.warn(`Conciliación detenida: ${error.message}`);
            return;
          }
          this.logger.error(`Conciliación de ${tenant.id} falló: ${errorText(error)}`);
        }
      }
    }
  }

  private async reconcileSubscription(
    tenantId: string,
    subscriptionId: string,
    now: Date,
  ): Promise<number> {
    const attempts = await this.prisma.paymentAttempt.findMany({
      where: {
        tenantId,
        subscriptionId,
        kind: 'renewal',
        status: { in: RECONCILABLE_ATTEMPT_STATUSES },
      },
      orderBy: { createdAt: 'asc' },
      include: { plan: { select: { id: true, code: true } } },
    });
    let resolved = 0;
    for (const attempt of attempts) {
      const result = checkApproval(
        await this.gateway.status({
          orderId: attempt.orderId,
          transactionId: attempt.providerTransactionId,
        }),
        { orderId: attempt.orderId, amount: attempt },
      );
      if (result.status === 'unknown') {
        // Pending huérfano (el proceso murió con el cobro en vuelo), o un aprobado distinto
        // de lo pedido: pasa a unknown (con su alerta) y queda para una persona.
        if (attempt.status === 'pending' || result.alert) {
          await this.outcomes.markUnknown({ ...attempt, result });
        }
        continue;
      }
      await this.applyRenewalResult(attempt, result, now, true);
      resolved += 1;
    }
    return resolved;
  }

  // ─── 2. Cancelación al fin del período ───────────────────────────────────────

  private async cancelAtPeriodEnd(now: Date, summary: BillingCycleSummary): Promise<void> {
    const due = await this.dueSubscriptions({
      cancelAtPeriodEnd: true,
      ...NO_OPEN_ATTEMPT,
      OR: [
        { status: 'trialing', trialEndsAt: { lte: now } },
        { status: { in: ['active', 'past_due'] }, currentPeriodEnd: { lte: now } },
      ],
    });
    for (const subscription of due) {
      const changed = await this.transition(subscription, 'canceled', {
        type: 'canceled',
        message: 'Cancelada al terminar el período (pedido del dueño)',
      });
      if (changed) summary.canceled += 1;
    }
  }

  // ─── 3. Renovaciones ─────────────────────────────────────────────────────────

  private async renew(now: Date, summary: BillingCycleSummary): Promise<void> {
    const due = await this.dueSubscriptions({
      status: { in: ['active', 'past_due'] },
      cancelAtPeriodEnd: false,
      currentPeriodEnd: { lte: now },
      ...HAS_CARD,
      ...NO_OPEN_ATTEMPT,
      OR: [{ retryAt: null }, { retryAt: { lte: now } }],
    });

    let unknownInARow = 0;
    for (const { id, tenantId } of due) {
      let outcome: RenewalOutcome;
      try {
        const lock = await this.locks.withTryLock(subscriptionLockKey(id), () =>
          this.renewSubscription(tenantId, now),
        );
        outcome = lock.acquired ? lock.value : 'deferred';
      } catch (error) {
        if (error instanceof GatewayError && error.kind === 'unavailable') {
          // Pasarela caída: no tiene sentido seguir golpeándola; la próxima corrida reintenta.
          this.logger.error(`Renovaciones detenidas: ${error.message}`);
          summary.deferred += 1;
          return;
        }
        // Una suscripción rota no frena a las demás.
        this.logger.error(`Renovación de ${tenantId} falló: ${errorText(error)}`);
        outcome = 'deferred';
      }
      if (outcome === 'deferred') {
        summary.deferred += 1;
        continue;
      }
      summary.charged[outcome] += 1;
      unknownInARow = outcome === 'unknown' ? unknownInARow + 1 : 0;
      if (unknownInARow >= UNKNOWN_BREAKER) {
        this.logger.error(
          `Renovaciones cortadas: ${UNKNOWN_BREAKER} cobros sin confirmar seguidos (¿ms-payments o el procesador caídos?)`,
        );
        return;
      }
    }
  }

  private async renewSubscription(tenantId: string, now: Date): Promise<RenewalOutcome> {
    // Se relee con el lock tomado: el dueño pudo haber pagado o cambiado algo en el medio.
    const subscription = await this.load(tenantId);
    if (
      !subscription ||
      !['active', 'past_due'].includes(subscription.status) ||
      subscription.cancelAtPeriodEnd ||
      !canChargeRecurring(subscription) ||
      subscription.currentPeriodEnd.getTime() > now.getTime() ||
      (subscription.retryAt && subscription.retryAt.getTime() > now.getTime())
    ) {
      return 'deferred';
    }

    // Un intento abierto de CUALQUIER tipo (también un alta de tarjeta sin confirmar que paga
    // este mismo período) bloquea el cobro: primero hay que saber si cobró.
    const open = await this.prisma.paymentAttempt.count({
      where: { tenantId, subscriptionId: subscription.id, status: { in: OPEN_ATTEMPT_STATUSES } },
    });
    if (open > 0) return 'deferred';

    const periodStart = subscription.currentPeriodEnd;
    const previous = await this.prisma.paymentAttempt.findMany({
      where: { tenantId, subscriptionId: subscription.id, kind: 'renewal', periodStart },
      select: { status: true },
    });
    const bankFailures = previous.filter((a) => a.status === 'failed').length;
    if (bankFailures >= MAX_RENEWAL_ATTEMPTS) return 'deferred';
    const sequence = previous.length + 1;

    const { plan, interval } = await this.renewalPlan(subscription);
    const attempt: FrozenAttempt = {
      tenantId,
      subscriptionId: subscription.id,
      orderId: renewalOrderId(subscription.id, periodStart, sequence),
      periodStart,
      periodEnd: periodEnd(periodStart, interval),
      interval,
      amountCents: planPriceCents(plan, interval),
      plan: { id: plan.id, code: plan.code },
    };

    try {
      await this.prisma.paymentAttempt.create({
        data: {
          tenantId,
          subscriptionId: subscription.id,
          orderId: attempt.orderId,
          kind: 'renewal',
          periodStart,
          periodEnd: attempt.periodEnd,
          planId: plan.id,
          interval,
          attempt: sequence,
          amountCents: attempt.amountCents,
          currency: plan.currency,
        },
      });
    } catch (error) {
      // Otro proceso ya creó este mismo intento (orderId determinístico): no se cobra dos veces.
      if (isUniqueViolation(error)) return 'deferred';
      throw error;
    }

    const amount = { amountCents: attempt.amountCents, currency: plan.currency };
    let result: ChargeResult;
    try {
      result = await this.gateway.chargeRecurring({
        token: subscription.paymentToken!,
        initialTransactionId: subscription.networkTransactionId!,
        expMonth: subscription.cardExpMonth,
        expYear: subscription.cardExpYear,
        amount,
        orderId: attempt.orderId,
      });
    } catch (error) {
      if (!(error instanceof GatewayError)) throw error;
      if (error.kind === 'invalid') {
        await this.outcomes.applyNonBankFailure(
          { ...attempt, result: { status: 'declined', message: error.message } },
          now,
        );
        return 'deferred';
      }
      // No llegó al procesador: se borra el intento y el mismo orderId sirve la próxima vez.
      await this.prisma.paymentAttempt.deleteMany({
        where: { tenantId, orderId: attempt.orderId, status: 'pending' },
      });
      throw error;
    }

    // Lo primero: la referencia del procesador, por si algo falla después.
    await this.outcomes.rememberTransaction(tenantId, attempt.orderId, result.transactionId);
    result = checkApproval(result, { orderId: attempt.orderId, amount });
    return this.applyRenewalResult(attempt, result, now, false);
  }

  /** Aplica el resultado con lo que se cobró (congelado en el intento), nunca con lo actual. */
  private async applyRenewalResult(
    attempt: FrozenAttempt,
    result: ChargeResult,
    now: Date,
    reconciled: boolean,
  ): Promise<RenewalOutcome> {
    switch (result.status) {
      case 'approved':
        await this.outcomes.applyPaid({
          tenantId: attempt.tenantId,
          subscriptionId: attempt.subscriptionId,
          periodStart: attempt.periodStart,
          periodEnd: attempt.periodEnd,
          plan: attempt.plan,
          interval: attempt.interval,
          amountCents: attempt.amountCents,
          orderId: attempt.orderId,
          providerTransactionId: result.transactionId ?? null,
          message: `Renovación${reconciled ? ', confirmada al consultar a la pasarela' : ''}`,
          keepSuspended: true,
        });
        return 'approved';
      case 'declined':
        await this.outcomes.applyRenewalFailure({ ...attempt, result }, now);
        return 'declined';
      case 'unknown':
        await this.outcomes.markUnknown({ ...attempt, result });
        return 'unknown';
    }
  }

  /**
   * Plan del período que se cobra: el agendado si lo hay y si la marca todavía cabe (pudo
   * abrir sucursales después de agendarlo). Si no cabe, se queda en el actual y se avisa.
   */
  private async renewalPlan(
    subscription: BillingSubscription,
  ): Promise<{ plan: BillingPlan; interval: BillingSubscription['interval'] }> {
    const next = nextPeriodPlan(subscription);
    if (next.plan.id === subscription.plan.id) return next;
    const active = await this.prisma.location.count({
      where: { tenantId: subscription.tenantId, isActive: true },
    });
    if (fitsLocationLimit(next.plan.maxLocations, active)) return next;

    await this.outcomes.notify(
      subscription.tenantId,
      'plan_change_scheduled',
      `Cambio a ${next.plan.code} no aplicado: ${active} sucursales activas superan su límite`,
    );
    return { plan: subscription.plan, interval: subscription.interval };
  }

  // ─── 4. Vencimientos sin cobro ───────────────────────────────────────────────

  private async expire(now: Date, summary: BillingCycleSummary): Promise<void> {
    const manual = this.gateway.mode === 'manual';
    const notCharged: Prisma.SubscriptionWhereInput = manual ? {} : NO_CARD;

    // Prueba vencida → past_due (lo mismo que hace el middleware con tráfico).
    const trials = await this.dueSubscriptions({
      status: 'trialing',
      cancelAtPeriodEnd: false,
      trialEndsAt: { lte: now },
      ...NO_OPEN_ATTEMPT,
    });
    for (const subscription of trials) {
      await this.subscriptions.expireTrial(subscription.tenantId, subscription.id, now);
      summary.pastDue += 1;
    }

    // Período vencido sin forma de cobrarlo → past_due.
    const overdue = await this.dueSubscriptions({
      status: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: { lte: now },
      ...NO_OPEN_ATTEMPT,
      ...notCharged,
    });
    for (const subscription of overdue) {
      const changed = await this.transition(subscription, 'past_due', {
        type: 'past_due',
        message: manual
          ? 'Período vencido: pendiente de pago manual'
          : 'Período vencido sin tarjeta registrada',
      });
      if (changed) summary.pastDue += 1;
    }

    // Gracia vencida → suspended.
    const graceOver = await this.dueSubscriptions({
      status: 'past_due',
      currentPeriodEnd: { lte: addDays(now, -GRACE_DAYS) },
      ...NO_OPEN_ATTEMPT,
      ...notCharged,
    });
    for (const subscription of graceOver) {
      const changed = await this.transition(subscription, 'suspended', {
        type: 'suspended',
        message: `Sin pago tras ${GRACE_DAYS} días de gracia`,
      });
      if (changed) summary.suspended += 1;
    }
  }

  // ─── Utilidades ──────────────────────────────────────────────────────────────

  /** Suscripciones de marcas activas que cumplen `where` (se leen vía Tenant, sin guard). */
  private async dueSubscriptions(
    where: Prisma.SubscriptionWhereInput,
  ): Promise<BillingSubscription[]> {
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true, subscription: { is: where } },
      select: { subscription: { select: BILLING_SUBSCRIPTION_SELECT } },
    });
    return tenants.flatMap((tenant) => (tenant.subscription ? [tenant.subscription] : []));
  }

  /** Cambio de estado condicional sobre lo leído, con su asiento y su aviso. */
  private async transition(
    subscription: BillingSubscription,
    status: 'canceled' | 'past_due' | 'suspended',
    event: { type: 'canceled' | 'past_due' | 'suspended'; message: string },
  ): Promise<boolean> {
    const { tenantId } = subscription;
    const changed = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.subscription.updateMany({
        where: {
          tenantId,
          id: subscription.id,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
        },
        data: { status, retryAt: null },
      });
      if (count === 0) return false;
      await tx.billingEvent.create({ data: { tenantId, ...event } });
      return true;
    });
    if (changed) await this.outcomes.notify(tenantId, event.type, event.message);
    return changed;
  }

  private load(tenantId: string): Promise<BillingSubscription | null> {
    return this.prisma.subscription.findUnique({
      where: { tenantId },
      select: BILLING_SUBSCRIPTION_SELECT,
    });
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}
