import {
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OWNER_BILLING_EVENT_TYPE,
  type BillingChangePlanInput,
  type BillingOverview,
  type OwnerBillingEventType,
  type PaymentMethodInput,
  type SubscriptionStatus,
} from '@ventea/shared';

import { PlanLimitsService } from '@/modules/subscriptions/plan-limits.service';
import { addDays, nextStatus, periodEnd } from '@/modules/subscriptions/subscription-state';
import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { BillingLockService, subscriptionLockKey } from './billing-lock.service';
import { BillingOutcomeService, OPEN_ATTEMPT_STATUSES } from './billing-outcome.service';
import {
  checkApproval,
  establishOrderId,
  nextPeriodStart,
  planPriceCents,
  rawCardApiAllowed,
} from './billing-rules';
import {
  BILLING_SUBSCRIPTION_SELECT,
  nextPeriodPlan,
  toBillingOverview,
  type BillingSubscription,
} from './billing.mapper';
import {
  GatewayError,
  PAYMENT_GATEWAY,
  type EstablishResult,
  type PaymentGateway,
} from './gateway/payment-gateway';

const OVERVIEW_EVENTS = 20;
const CANCELABLE: SubscriptionStatus[] = ['trialing', 'active', 'past_due'];
/** Rechazos seguidos de una marca que bloquean el alta de tarjeta 24 h (card-testing). */
const DECLINE_BLOCK_COUNT = 3;

/**
 * Cobro de la suscripción desde el panel del dueño (`/api/billing/*`). El número de tarjeta y
 * el CVV llegan en `addPaymentMethod`, van a la pasarela en memoria y se descartan: nunca se
 * escriben en la base, en un log ni en una respuesta.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly locks: BillingLockService,
    private readonly outcomes: BillingOutcomeService,
    private readonly limits: PlanLimitsService,
    private readonly config: ConfigService,
  ) {}

  async overview(tenantId: string): Promise<BillingOverview> {
    const [subscription, events] = await Promise.all([
      this.load(tenantId),
      // Lista blanca: alertas, cobros sin confirmar y tipos nuevos no llegan al dueño. Sin
      // `message`: es interno (ver toOwnerBillingEvent).
      this.prisma.billingEvent.findMany({
        where: { tenantId, type: { in: [...OWNER_BILLING_EVENT_TYPE] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: OVERVIEW_EVENTS,
        select: { type: true, amountCents: true, status: true, createdAt: true },
      }),
    ]);
    return toBillingOverview(
      subscription,
      this.gateway.mode,
      events.map((event) => ({ ...event, type: event.type as OwnerBillingEventType })),
    );
  }

  /**
   * Alta (o cambio) de tarjeta con el primer cobro: tokeniza y cobra el próximo período con
   * CVV, declarando la credencial guardada (`establish`). Aprobado → `active` con período
   * nuevo desde `nextPeriodStart`; rechazado → `402` y la suscripción no cambia.
   */
  async addPaymentMethod(tenantId: string, input: PaymentMethodInput): Promise<BillingOverview> {
    if (this.gateway.mode === 'manual') {
      throw new ConflictException(
        'El cobro con tarjeta no está habilitado: escríbenos y registramos tu pago',
      );
    }
    if (
      !rawCardApiAllowed({
        nodeEnv: this.config.get<string>('NODE_ENV'),
        mode: this.gateway.mode,
        allowRawCard: this.config.get<string>('ALLOW_RAW_CARD_API'),
      })
    ) {
      // PCI: en producción el número de tarjeta no debe tocar la API (docs/deployment.md).
      throw new ServiceUnavailableException(
        'El alta de tarjeta todavía no está habilitada; escríbenos y registramos tu pago',
      );
    }
    const { id } = await this.load(tenantId);
    await this.withIdleSubscription(tenantId, id, () => this.establish(tenantId, input));
    return this.overview(tenantId);
  }

  /** Cambio de plan para el próximo período, sin prorrateo. */
  async changePlan(tenantId: string, input: BillingChangePlanInput): Promise<BillingOverview> {
    const { id } = await this.load(tenantId);
    await this.withIdleSubscription(tenantId, id, () => this.scheduleChange(tenantId, input));
    return this.overview(tenantId);
  }

  /** Cancela al fin del período (o de la prueba). Hasta entonces, todo sigue igual. */
  async cancel(tenantId: string): Promise<BillingOverview> {
    return this.setCancelAtPeriodEnd(tenantId, true);
  }

  async resume(tenantId: string): Promise<BillingOverview> {
    return this.setCancelAtPeriodEnd(tenantId, false);
  }

  /**
   * Corre `fn` con el lock de la suscripción y sin cobros abiertos. Con un cobro en vuelo o
   * sin confirmar, nada que cambie lo que se cobra (plan, cancelación, tarjeta) puede pasar:
   * `409`. Primero se aplica el resultado de ese cobro.
   */
  private async withIdleSubscription(
    tenantId: string,
    subscriptionId: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    const lock = await this.locks.withTryLock(subscriptionLockKey(subscriptionId), async () => {
      const open = await this.prisma.paymentAttempt.count({
        where: { tenantId, subscriptionId, status: { in: OPEN_ATTEMPT_STATUSES } },
      });
      if (open > 0) {
        throw new ConflictException(
          'Hay un cobro sin confirmar con el banco; lo estamos revisando. Espera a que se resuelva.',
        );
      }
      await fn();
    });
    if (!lock.acquired) {
      throw new ConflictException('Hay un cobro en curso para esta marca; espera un momento');
    }
  }

  private async scheduleChange(tenantId: string, input: BillingChangePlanInput): Promise<void> {
    const subscription = await this.load(tenantId);
    if (nextStatus(subscription.status, 'change_plan') === null) {
      throw new ConflictException(
        'La suscripción está cancelada: registra una tarjeta para reactivarla',
      );
    }
    const plan = await this.prisma.plan.findFirst({
      where: { code: input.planCode, isActive: true },
      select: { id: true, code: true, name: true, maxLocations: true },
    });
    if (!plan) throw new BadRequestException('Plan no disponible');

    const interval = input.interval ?? subscription.interval;
    const sameAsCurrent = plan.id === subscription.plan.id && interval === subscription.interval;
    const hadPending = subscription.pendingPlan !== null || subscription.pendingInterval !== null;
    if (sameAsCurrent && !hadPending) return;
    if (!sameAsCurrent) await this.limits.assertFitsPlan(tenantId, plan);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.subscription.updateMany({
        where: { tenantId, id: subscription.id, status: subscription.status },
        data: sameAsCurrent
          ? { pendingPlanId: null, pendingInterval: null }
          : { pendingPlanId: plan.id, pendingInterval: interval },
      });
      if (count === 0) throw changedMeanwhile();
      await tx.billingEvent.create({
        data: {
          tenantId,
          type: 'plan_change_scheduled',
          message: sameAsCurrent
            ? 'Cambio de plan agendado: anulado'
            : `${subscription.plan.code} (${subscription.interval}) → ${plan.code} (${interval}) desde el próximo período`,
        },
      });
    });
  }

  private async setCancelAtPeriodEnd(tenantId: string, cancel: boolean): Promise<BillingOverview> {
    const { id } = await this.load(tenantId);
    await this.withIdleSubscription(tenantId, id, async () => {
      const subscription = await this.load(tenantId);
      if (!CANCELABLE.includes(subscription.status)) {
        throw new ConflictException(
          subscription.status === 'canceled'
            ? 'La suscripción ya terminó: registra una tarjeta para reactivarla'
            : `No se puede ${cancel ? 'cancelar' : 'reanudar'} una suscripción ${subscription.status}`,
        );
      }
      if (subscription.cancelAtPeriodEnd === cancel) return;

      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.subscription.updateMany({
          where: {
            tenantId,
            id: subscription.id,
            status: subscription.status,
            cancelAtPeriodEnd: !cancel,
          },
          data: { cancelAtPeriodEnd: cancel },
        });
        if (count === 0) throw changedMeanwhile();
        await tx.billingEvent.create({
          data: {
            tenantId,
            type: cancel ? 'cancel_scheduled' : 'cancel_resumed',
            message: cancel
              ? 'Se cancela al terminar el período actual'
              : 'Cancelación anulada: sigue renovándose',
          },
        });
      });
    });
    return this.overview(tenantId);
  }

  /** Rechazos bancarios seguidos de altas de tarjeta de la marca en las últimas 24 h. */
  private async declineStreak(tenantId: string, now: Date): Promise<number> {
    const recent = await this.prisma.paymentAttempt.findMany({
      where: { tenantId, kind: 'establish', createdAt: { gte: addDays(now, -1) } },
      orderBy: { createdAt: 'desc' },
      take: DECLINE_BLOCK_COUNT,
      select: { status: true },
    });
    let streak = 0;
    for (const attempt of recent) {
      if (attempt.status !== 'failed') break;
      streak += 1;
    }
    return streak;
  }

  private async establish(tenantId: string, input: PaymentMethodInput): Promise<void> {
    const now = new Date();
    const subscription = await this.load(tenantId);
    // Anti card-testing: 3 rechazos seguidos → 24 h sin poder probar otra tarjeta.
    if ((await this.declineStreak(tenantId, now)) >= DECLINE_BLOCK_COUNT) {
      throw new HttpException(
        'Demasiadas tarjetas rechazadas: el alta queda bloqueada 24 h. Si es un error, escríbenos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const { plan, interval } = nextPeriodPlan(subscription);
    if (plan.id !== subscription.plan.id) await this.limits.assertFitsPlan(tenantId, plan);
    const periodStart = nextPeriodStart(subscription, now);
    const amount = { amountCents: planPriceCents(plan, interval), currency: plan.currency };
    const orderId = establishOrderId(subscription.id, now);
    const frozen = {
      tenantId,
      subscriptionId: subscription.id,
      orderId,
      periodStart,
      periodEnd: periodEnd(periodStart, interval),
      plan: { id: plan.id, code: plan.code },
      interval,
      amountCents: amount.amountCents,
    };

    // Write-ahead, con lo que se cobra congelado: si la respuesta se pierde, el intento queda,
    // nadie cobra de nuevo a ciegas y al confirmarlo se aplica exactamente esto.
    await this.prisma.paymentAttempt.create({
      data: {
        tenantId,
        subscriptionId: subscription.id,
        orderId,
        kind: 'establish',
        periodStart,
        periodEnd: frozen.periodEnd,
        planId: plan.id,
        interval,
        attempt: 1,
        amountCents: amount.amountCents,
        currency: amount.currency,
      },
    });

    let result: EstablishResult;
    try {
      result = await this.gateway.tokenizeAndEstablish(input.card, input.billing, amount, orderId);
    } catch (error) {
      // Nada llegó al procesador: el intento se descarta y se puede reintentar.
      await this.prisma.paymentAttempt.deleteMany({
        where: { tenantId, orderId, status: 'pending' },
      });
      throw gatewayErrorToHttp(error);
    }
    await this.outcomes.rememberTransaction(tenantId, orderId, result.transactionId);
    const checked = checkApproval(result, { orderId, amount });
    const failed = { ...frozen, result: checked };

    switch (checked.status) {
      case 'approved':
        await this.outcomes.applyPaid({
          ...frozen,
          providerTransactionId: result.transactionId ?? null,
          // El dueño paga con él presente: pagar es pedir seguir.
          resetCancel: true,
          card: {
            provider: this.gateway.provider,
            token: result.token!,
            networkTransactionId: result.networkTransactionId ?? null,
            brand: result.cardBrand?.slice(0, 20) ?? null,
            last4: result.cardLast4 ?? null,
            expMonth: Number(input.card.expiryMonth),
            expYear: Number(input.card.expiryYear),
          },
          message: `Cobro de alta con tarjeta ****${result.cardLast4 ?? '????'}`,
        });
        if (!result.networkTransactionId) {
          this.logger.warn(
            `Alta aprobada sin networkTransactionId (tenant ${tenantId}): no podrá renovarse sola`,
          );
        }
        return;
      case 'unknown':
        await this.outcomes.markUnknown(failed);
        throw new GatewayTimeoutException(
          'No pudimos confirmar el cobro con el banco. No lo intentes de nuevo: lo revisamos y te avisamos.',
        );
      case 'declined':
        await this.outcomes.applyEstablishFailure(failed);
        if ((await this.declineStreak(tenantId, now)) === DECLINE_BLOCK_COUNT) {
          await this.outcomes.alert(
            tenantId,
            `${DECLINE_BLOCK_COUNT} tarjetas rechazadas seguidas: alta de tarjeta bloqueada 24 h (posible card-testing)`,
          );
        }
        throw new HttpException(
          `La tarjeta fue rechazada${checked.message ? `: ${checked.message}` : ''}`,
          HttpStatus.PAYMENT_REQUIRED,
        );
    }
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

function changedMeanwhile(): ConflictException {
  return new ConflictException('La suscripción cambió mientras tanto; recarga e intenta de nuevo');
}

function gatewayErrorToHttp(error: unknown): unknown {
  if (!(error instanceof GatewayError)) return error;
  switch (error.kind) {
    case 'invalid':
      return new BadRequestException('La pasarela rechazó los datos de la tarjeta');
    case 'not_supported':
      return new ConflictException(error.message);
    case 'unavailable':
      return new ServiceUnavailableException(
        'El cobro no está disponible en este momento; intenta más tarde',
      );
  }
}
