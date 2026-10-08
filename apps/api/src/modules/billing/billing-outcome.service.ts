import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { BillingEventType, BillingInterval, SubscriptionStatus } from '@ventea/shared';

import type { PrismaClientExtended, PrismaDb } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { BILLING_NOTIFIER, type BillingNotifier } from './billing-notifier';
import { afterRenewalFailure } from './billing-rules';
import type { ChargeResult } from './gateway/payment-gateway';

/** Datos de la tarjeta que SÍ se guardan: token de la pasarela, marca, últimos 4, vencimiento. */
export interface SavedCardData {
  provider: string | null;
  token: string;
  networkTransactionId: string | null;
  brand: string | null;
  last4: string | null;
  expMonth: number;
  expYear: number;
}

/**
 * Un período pagado, tal como se cobró. Viene del intento (`payment_attempts`, congelado al
 * cobrar) o de un pago manual; nunca se recalcula con el estado actual de la suscripción.
 */
export interface PaidPeriod {
  tenantId: string;
  subscriptionId: string;
  periodStart: Date;
  periodEnd: Date;
  plan: { id: string; code: string };
  interval: BillingInterval;
  amountCents: number;
  /** Intento que se cierra como `succeeded`. Null en un pago manual. */
  orderId: string | null;
  providerTransactionId?: string | null;
  card?: SavedCardData;
  /**
   * Solo el alta de tarjeta del dueño (con él presente): pagar es pedir seguir, así que anula
   * una cancelación agendada. Conciliaciones y pagos manuales NUNCA la tocan.
   */
  resetCancel?: boolean;
  message: string;
}

/** Datos de un intento cerrado sin cobro. */
export interface FailedAttempt {
  tenantId: string;
  subscriptionId: string;
  orderId: string;
  amountCents: number;
  result: ChargeResult;
}

export const OPEN_ATTEMPT_STATUSES: ('pending' | 'unknown')[] = ['pending', 'unknown'];
const OPEN_ATTEMPT = { in: OPEN_ATTEMPT_STATUSES };
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Aplica el resultado de un cobro (alta, renovación, conciliación o pago manual) a la
 * suscripción, al intento y al historial, en una transacción.
 *
 * Regla de dinero: un período pagado se aplica solo si la suscripción todavía no lo cubre
 * (`currentPeriodEnd <= periodStart`). Si ya está cubierto, el cobro se asienta igual (el
 * dinero se movió) pero el período no se toca y queda una alerta de posible doble pago.
 */
@Injectable()
export class BillingOutcomeService {
  private readonly logger = new Logger(BillingOutcomeService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    @Inject(BILLING_NOTIFIER) private readonly notifier: BillingNotifier,
  ) {}

  async applyPaid(paid: PaidPeriod): Promise<{ periodApplied: boolean }> {
    const until = paid.periodEnd.toISOString().slice(0, 10);
    const from = paid.periodStart.toISOString().slice(0, 10);

    const outcome = await this.prisma.$transaction(async (tx) => {
      const before = await tx.subscription.findUnique({
        where: { tenantId: paid.tenantId },
        select: {
          planId: true,
          interval: true,
          pendingPlanId: true,
          pendingInterval: true,
          currentPeriodEnd: true,
          plan: { select: { code: true } },
        },
      });

      const data: Prisma.SubscriptionUncheckedUpdateManyInput = {
        status: 'active',
        planId: paid.plan.id,
        interval: paid.interval,
        currentPeriodStart: paid.periodStart,
        currentPeriodEnd: paid.periodEnd,
        retryAt: null,
        ...(paid.resetCancel ? { cancelAtPeriodEnd: false } : {}),
        ...(paid.card
          ? {
              paymentProvider: paid.card.provider,
              paymentToken: paid.card.token,
              networkTransactionId: paid.card.networkTransactionId,
              cardBrand: paid.card.brand,
              cardLast4: paid.card.last4,
              cardExpMonth: paid.card.expMonth,
              cardExpYear: paid.card.expYear,
            }
          : {}),
      };
      const { count } = await tx.subscription.updateMany({
        where: {
          tenantId: paid.tenantId,
          id: paid.subscriptionId,
          currentPeriodEnd: { lte: paid.periodStart },
        },
        data,
      });

      if (paid.orderId) {
        await tx.paymentAttempt.updateMany({
          where: { tenantId: paid.tenantId, orderId: paid.orderId, status: OPEN_ATTEMPT },
          data: { status: 'succeeded', providerTransactionId: paid.providerTransactionId ?? null },
        });
      }
      await tx.billingEvent.create({
        data: {
          tenantId: paid.tenantId,
          type: 'payment_succeeded',
          amountCents: paid.amountCents,
          status: 'succeeded',
          orderId: paid.orderId,
          providerTransactionId: paid.providerTransactionId ?? null,
          message:
            count > 0
              ? `${paid.message}. Período ${from} → ${until}`
              : `${paid.message}. Período ${from} → ${until} NO aplicado: ya estaba cubierto`,
        },
      });

      if (count === 0) {
        const coveredUntil = before?.currentPeriodEnd.toISOString().slice(0, 10) ?? '?';
        const alert = `Posible doble pago: cobro ${paid.orderId ?? 'manual'} (${paid.amountCents} centavos) por ${from} → ${until}, pero la suscripción ya estaba cubierta hasta ${coveredUntil}. Revisar y reembolsar si corresponde`;
        await tx.billingEvent.create({
          data: { tenantId: paid.tenantId, type: 'billing_alert', message: alert },
        });
        return { periodApplied: false, alert };
      }

      if (before) {
        // El cambio agendado se limpia solo si es justo el que se aplicó: uno agendado
        // después (con otro plan o intervalo) sigue para el período siguiente.
        const scheduledPlan = before.pendingPlanId ?? before.planId;
        const scheduledInterval = before.pendingInterval ?? before.interval;
        if (scheduledPlan === paid.plan.id && scheduledInterval === paid.interval) {
          await tx.subscription.updateMany({
            where: { tenantId: paid.tenantId, id: paid.subscriptionId },
            data: { pendingPlanId: null, pendingInterval: null },
          });
        }
        if (before.planId !== paid.plan.id || before.interval !== paid.interval) {
          await tx.billingEvent.create({
            data: {
              tenantId: paid.tenantId,
              type: 'plan_changed',
              message: `${before.plan.code} (${before.interval}) → ${paid.plan.code} (${paid.interval}), agendado`,
            },
          });
        }
      }
      if (paid.card) {
        await tx.billingEvent.create({
          data: {
            tenantId: paid.tenantId,
            type: 'payment_method_updated',
            message: ['Tarjeta', paid.card.brand, `****${paid.card.last4 ?? '????'}`]
              .filter(Boolean)
              .join(' '),
          },
        });
      }
      return { periodApplied: true, alert: null };
    });

    if (outcome.alert) await this.notify(paid.tenantId, 'billing_alert', outcome.alert);
    return { periodApplied: outcome.periodApplied };
  }

  /**
   * Rechazo bancario de una renovación: `past_due` con reintento (días 1, 3, 7 desde el
   * vencimiento, espaciado desde ahora si hubo catch-up) o `suspended` al 4.º rechazo del
   * período. Solo si la suscripción sigue en el período que se intentó cobrar.
   */
  async applyRenewalFailure(
    failed: FailedAttempt & { periodStart: Date },
    now: Date,
  ): Promise<SubscriptionStatus | null> {
    const reason = failureReason(failed.result);

    const result = await this.prisma.$transaction(async (tx) => {
      await this.closeFailedAttempt(tx, failed, reason);
      const failures = await tx.paymentAttempt.count({
        where: {
          tenantId: failed.tenantId,
          subscriptionId: failed.subscriptionId,
          kind: 'renewal',
          periodStart: failed.periodStart,
          status: 'failed',
        },
      });
      const decision = afterRenewalFailure(failures, failed.periodStart, now);
      const { count } = await tx.subscription.updateMany({
        where: {
          tenantId: failed.tenantId,
          id: failed.subscriptionId,
          status: { in: ['active', 'past_due'] },
          currentPeriodEnd: failed.periodStart,
        },
        data: { status: decision.status, retryAt: decision.retryAt },
      });
      if (count > 0 && decision.status === 'suspended') {
        await tx.billingEvent.create({
          data: {
            tenantId: failed.tenantId,
            type: 'suspended',
            message: `Suspendida tras ${failures} cobros rechazados`,
          },
        });
      }
      return { decision, failures, applied: count > 0 };
    });

    const { decision, failures } = result;
    const next =
      decision.status === 'suspended'
        ? 'suspendida'
        : `reintento el ${decision.retryAt.toISOString().slice(0, 10)}`;
    await this.notify(
      failed.tenantId,
      decision.status === 'suspended' ? 'suspended' : 'payment_failed',
      `Cobro rechazado (rechazo ${failures}): ${reason}; ${next}`,
    );
    return result.applied ? decision.status : null;
  }

  /**
   * La pasarela rechazó el request antes del banco (400: dato inválido). No cuenta para el
   * dunning ni cambia el estado; el intento queda `failed_non_bank` (visible en el resumen de
   * plataforma) y el próximo intento espera un día, no 15 minutos.
   */
  async applyNonBankFailure(
    failed: FailedAttempt & { periodStart: Date },
    now: Date,
  ): Promise<void> {
    const reason = `No llegó al banco: ${failed.result.message ?? 'request inválido'}`.slice(
      0,
      300,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.paymentAttempt.updateMany({
        where: { tenantId: failed.tenantId, orderId: failed.orderId, status: OPEN_ATTEMPT },
        data: { status: 'failed_non_bank', message: reason },
      });
      await tx.billingEvent.create({
        data: {
          tenantId: failed.tenantId,
          type: 'payment_failed',
          amountCents: failed.amountCents,
          status: 'failed_non_bank',
          orderId: failed.orderId,
          message: reason,
        },
      });
      await tx.subscription.updateMany({
        where: {
          tenantId: failed.tenantId,
          id: failed.subscriptionId,
          currentPeriodEnd: failed.periodStart,
        },
        data: { retryAt: new Date(now.getTime() + DAY_MS) },
      });
    });
    await this.notify(failed.tenantId, 'payment_failed', reason);
  }

  /** Rechazo de un alta de tarjeta: se asienta; la suscripción no cambia. */
  async applyEstablishFailure(failed: FailedAttempt): Promise<void> {
    const reason = failureReason(failed.result);
    await this.prisma.$transaction((tx) => this.closeFailedAttempt(tx, failed, reason));
  }

  /** Guarda la referencia del procesador apenas llega, antes de cualquier otra escritura. */
  async rememberTransaction(
    tenantId: string,
    orderId: string,
    transactionId: string | undefined,
  ): Promise<void> {
    if (!transactionId) return;
    await this.prisma.paymentAttempt.updateMany({
      where: { tenantId, orderId, status: OPEN_ATTEMPT },
      data: { providerTransactionId: transactionId },
    });
  }

  /** La pasarela no confirmó: el intento queda abierto y no se vuelve a cobrar. */
  async markUnknown(attempt: {
    tenantId: string;
    orderId: string;
    amountCents: number;
    result: ChargeResult;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.paymentAttempt.updateMany({
        where: { tenantId: attempt.tenantId, orderId: attempt.orderId, status: OPEN_ATTEMPT },
        data: {
          status: 'unknown',
          ...(attempt.result.transactionId
            ? { providerTransactionId: attempt.result.transactionId }
            : {}),
          message: (attempt.result.alert ?? attempt.result.message ?? null)?.slice(0, 300),
        },
      });
      await tx.billingEvent.create({
        data: {
          tenantId: attempt.tenantId,
          type: 'payment_unknown',
          amountCents: attempt.amountCents,
          status: 'unknown',
          providerTransactionId: attempt.result.transactionId ?? null,
          message: `Cobro ${attempt.orderId} sin confirmar: se consulta a la pasarela, no se recobra`,
        },
      });
      if (attempt.result.alert) {
        await tx.billingEvent.create({
          data: {
            tenantId: attempt.tenantId,
            type: 'billing_alert',
            message: attempt.result.alert,
          },
        });
      }
    });
    await this.notify(
      attempt.tenantId,
      attempt.result.alert ? 'billing_alert' : 'payment_unknown',
      attempt.result.alert ?? `Cobro ${attempt.orderId} sin confirmar`,
    );
  }

  /** Alerta suelta (card-testing…): asiento + aviso. */
  async alert(tenantId: string, message: string): Promise<void> {
    await this.prisma.billingEvent.create({
      data: { tenantId, type: 'billing_alert', message },
    });
    await this.notify(tenantId, 'billing_alert', message);
  }

  /** Aviso que nunca rompe al llamador: el evento ya quedó en `BillingEvent`. */
  async notify(tenantId: string, type: BillingEventType, message: string): Promise<void> {
    try {
      await this.notifier.notify({ tenantId, type, message });
    } catch (error) {
      this.logger.warn(`Aviso de cobro fallido: ${(error as Error).message}`);
    }
  }

  private async closeFailedAttempt(
    tx: PrismaDb,
    failed: FailedAttempt,
    reason: string,
  ): Promise<void> {
    await tx.paymentAttempt.updateMany({
      where: { tenantId: failed.tenantId, orderId: failed.orderId, status: OPEN_ATTEMPT },
      data: {
        status: 'failed',
        ...(failed.result.transactionId
          ? { providerTransactionId: failed.result.transactionId }
          : {}),
        message: reason,
      },
    });
    await tx.billingEvent.create({
      data: {
        tenantId: failed.tenantId,
        type: 'payment_failed',
        amountCents: failed.amountCents,
        status: 'failed',
        orderId: failed.orderId,
        providerTransactionId: failed.result.transactionId ?? null,
        message: reason,
      },
    });
  }
}

/** Motivo legible del rechazo (mensaje del banco o código). Nunca lleva datos de tarjeta. */
export function failureReason(result: ChargeResult): string {
  const detail = result.message ?? result.providerCode;
  return (detail ? `Rechazado por el banco: ${detail}` : 'Rechazado por el banco').slice(0, 300);
}
