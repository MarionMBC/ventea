import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { BillingInterval, SubscriptionStatus } from '@ventea/shared';

import { periodEnd } from '@/modules/subscriptions/subscription-state';
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

export interface PaidPeriod {
  tenantId: string;
  subscriptionId: string;
  /** La suscripción tiene que seguir como se leyó; si no, el pago se asienta sin mover nada. */
  expect: { status?: SubscriptionStatus[]; currentPeriodEnd?: Date };
  periodStart: Date;
  plan: { id: string; code: string };
  interval: BillingInterval;
  /** Plan e intervalo vigentes antes de este pago (para asentar el cambio agendado). */
  previous: { planCode: string; interval: BillingInterval };
  amountCents: number;
  /** Intento que se cierra como `succeeded` (cobro con tarjeta). Null en un pago manual. */
  orderId: string | null;
  providerTransactionId?: string | null;
  card?: SavedCardData;
  message: string;
}

export interface FailedAttempt {
  tenantId: string;
  subscriptionId: string;
  orderId: string;
  amountCents: number;
  result: ChargeResult;
}

const OPEN_ATTEMPT = { in: ['pending', 'unknown'] as ('pending' | 'unknown')[] };

/**
 * Aplica el resultado de un cobro (alta, renovación, conciliación o pago manual) a la
 * suscripción, al intento y al historial, en una transacción. Todo `update` de la
 * suscripción es condicional sobre lo leído: si cambió en el medio, no se pisa.
 */
@Injectable()
export class BillingOutcomeService {
  private readonly logger = new Logger(BillingOutcomeService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    @Inject(BILLING_NOTIFIER) private readonly notifier: BillingNotifier,
  ) {}

  /** Pago confirmado: período nuevo desde `periodStart`, `active`, cambio de plan aplicado. */
  async applyPaid(paid: PaidPeriod): Promise<{ periodApplied: boolean }> {
    const end = periodEnd(paid.periodStart, paid.interval);
    const periodApplied = await this.prisma.$transaction(async (tx) => {
      const data: Prisma.SubscriptionUncheckedUpdateManyInput = {
        status: 'active',
        planId: paid.plan.id,
        interval: paid.interval,
        currentPeriodStart: paid.periodStart,
        currentPeriodEnd: end,
        pendingPlanId: null,
        pendingInterval: null,
        retryAt: null,
        cancelAtPeriodEnd: false,
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
          ...(paid.expect.status ? { status: { in: paid.expect.status } } : {}),
          ...(paid.expect.currentPeriodEnd
            ? { currentPeriodEnd: paid.expect.currentPeriodEnd }
            : {}),
        },
        data,
      });

      if (paid.orderId) {
        await tx.paymentAttempt.updateMany({
          where: { tenantId: paid.tenantId, orderId: paid.orderId, status: OPEN_ATTEMPT },
          data: { status: 'succeeded', providerTransactionId: paid.providerTransactionId ?? null },
        });
      }

      const until = end.toISOString().slice(0, 10);
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
              ? `${paid.message}. Período hasta ${until}`
              : `${paid.message}. La suscripción cambió mientras se cobraba: revisar (posible doble pago)`,
        },
      });
      if (count === 0) return false;

      if (paid.previous.planCode !== paid.plan.code || paid.previous.interval !== paid.interval) {
        await tx.billingEvent.create({
          data: {
            tenantId: paid.tenantId,
            type: 'plan_changed',
            message: `${paid.previous.planCode} (${paid.previous.interval}) → ${paid.plan.code} (${paid.interval}), agendado`,
          },
        });
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
      return true;
    });

    if (!periodApplied) {
      await this.notify(
        paid.tenantId,
        'payment_succeeded',
        `Cobro sin período aplicado: ${paid.orderId ?? 'manual'}`,
      );
    }
    return { periodApplied };
  }

  /**
   * Rechazo de una renovación: `past_due` con reintento (días 1, 3, 7 desde el vencimiento)
   * o `suspended` al 4.º. Solo si la suscripción sigue en el período que se intentó cobrar.
   */
  async applyRenewalFailure(
    failed: FailedAttempt & { attempt: number; periodStart: Date },
  ): Promise<SubscriptionStatus | null> {
    const decision = afterRenewalFailure(failed.attempt, failed.periodStart);
    const reason = failureReason(failed.result);

    const applied = await this.prisma.$transaction(async (tx) => {
      await this.closeFailedAttempt(tx, failed, reason);
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
            message: `Suspendida tras ${failed.attempt} cobros rechazados`,
          },
        });
      }
      return count > 0;
    });

    const next =
      decision.status === 'suspended'
        ? 'suspendida'
        : `reintento el ${decision.retryAt.toISOString().slice(0, 10)}`;
    await this.notify(
      failed.tenantId,
      decision.status === 'suspended' ? 'suspended' : 'payment_failed',
      `Cobro rechazado (intento ${failed.attempt}): ${reason}; ${next}`,
    );
    return applied ? decision.status : null;
  }

  /** Rechazo de un alta de tarjeta: se asienta; la suscripción no cambia. */
  async applyEstablishFailure(failed: FailedAttempt): Promise<void> {
    const reason = failureReason(failed.result);
    await this.prisma.$transaction((tx) => this.closeFailedAttempt(tx, failed, reason));
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
        where: { tenantId: attempt.tenantId, orderId: attempt.orderId, status: 'pending' },
        data: {
          status: 'unknown',
          providerTransactionId: attempt.result.transactionId ?? null,
          message: attempt.result.message ?? null,
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
    });
    await this.notify(
      attempt.tenantId,
      'payment_unknown',
      `Cobro ${attempt.orderId} sin confirmar`,
    );
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
        providerTransactionId: failed.result.transactionId ?? null,
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

  private async notify(
    tenantId: string,
    type: Parameters<BillingNotifier['notify']>[0]['type'],
    message: string,
  ): Promise<void> {
    try {
      await this.notifier.notify({ tenantId, type, message });
    } catch (error) {
      this.logger.warn(`Aviso de cobro fallido: ${(error as Error).message}`);
    }
  }
}

/** Motivo legible del rechazo (mensaje del banco o código). Nunca lleva datos de tarjeta. */
export function failureReason(result: ChargeResult): string {
  const base = result.status === 'error' ? 'Error de la pasarela' : 'Rechazado por el banco';
  const detail = result.message ?? result.providerCode;
  return (detail ? `${base}: ${detail}` : base).slice(0, 300);
}
