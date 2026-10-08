import {
  BadGatewayException,
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
import type {
  BillingChangePlanInput,
  BillingOverview,
  PaymentMethodInput,
  SubscriptionStatus,
} from '@ventea/shared';

import { PlanLimitsService } from '@/modules/subscriptions/plan-limits.service';
import { nextStatus } from '@/modules/subscriptions/subscription-state';
import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { BillingLockService, subscriptionLockKey } from './billing-lock.service';
import { BillingOutcomeService } from './billing-outcome.service';
import { establishOrderId, nextPeriodStart, planPriceCents } from './billing-rules';
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
  ) {}

  async overview(tenantId: string): Promise<BillingOverview> {
    const [subscription, events] = await Promise.all([
      this.load(tenantId),
      this.prisma.billingEvent.findMany({
        where: { tenantId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: OVERVIEW_EVENTS,
        select: { type: true, amountCents: true, status: true, message: true, createdAt: true },
      }),
    ]);
    return toBillingOverview(subscription, this.gateway.mode, events);
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
    const { id } = await this.load(tenantId);
    const lock = await this.locks.withTryLock(subscriptionLockKey(id), () =>
      this.establish(tenantId, input),
    );
    if (!lock.acquired) {
      throw new ConflictException('Ya hay un cobro en curso para esta marca; espera un momento');
    }
    return this.overview(tenantId);
  }

  /** Cambio de plan para el próximo período, sin prorrateo. */
  async changePlan(tenantId: string, input: BillingChangePlanInput): Promise<BillingOverview> {
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
    if (sameAsCurrent && !hadPending) return this.overview(tenantId);
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
    return this.overview(tenantId);
  }

  /** Cancela al fin del período (o de la prueba). Hasta entonces, todo sigue igual. */
  async cancel(tenantId: string): Promise<BillingOverview> {
    return this.setCancelAtPeriodEnd(tenantId, true);
  }

  async resume(tenantId: string): Promise<BillingOverview> {
    return this.setCancelAtPeriodEnd(tenantId, false);
  }

  private async setCancelAtPeriodEnd(tenantId: string, cancel: boolean): Promise<BillingOverview> {
    const subscription = await this.load(tenantId);
    if (!CANCELABLE.includes(subscription.status)) {
      throw new ConflictException(
        subscription.status === 'canceled'
          ? 'La suscripción ya terminó: registra una tarjeta para reactivarla'
          : `No se puede ${cancel ? 'cancelar' : 'reanudar'} una suscripción ${subscription.status}`,
      );
    }
    if (subscription.cancelAtPeriodEnd === cancel) return this.overview(tenantId);

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
    return this.overview(tenantId);
  }

  private async establish(tenantId: string, input: PaymentMethodInput): Promise<void> {
    const now = new Date();
    const subscription = await this.load(tenantId);
    const open = await this.prisma.paymentAttempt.count({
      where: { tenantId, subscriptionId: subscription.id, status: { in: ['pending', 'unknown'] } },
    });
    if (open > 0) {
      throw new ConflictException(
        'Hay un cobro sin confirmar con el banco; lo estamos revisando. No hace falta reintentar.',
      );
    }

    const { plan, interval } = nextPeriodPlan(subscription);
    if (plan.id !== subscription.plan.id) await this.limits.assertFitsPlan(tenantId, plan);
    const periodStart = nextPeriodStart(subscription, now);
    const amount = { amountCents: planPriceCents(plan, interval), currency: plan.currency };
    const orderId = establishOrderId(subscription.id, now);

    // Write-ahead: si la respuesta se pierde, el intento queda y nadie cobra de nuevo a ciegas.
    await this.prisma.paymentAttempt.create({
      data: {
        tenantId,
        subscriptionId: subscription.id,
        orderId,
        kind: 'establish',
        periodStart,
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

    const failed = {
      tenantId,
      subscriptionId: subscription.id,
      orderId,
      amountCents: amount.amountCents,
      result,
    };
    switch (result.status) {
      case 'approved':
        await this.outcomes.applyPaid({
          tenantId,
          subscriptionId: subscription.id,
          // El dueño pagó: el período se abre aunque el estado haya cambiado en el medio
          // (p. ej. la prueba venció mientras cargaba la tarjeta).
          expect: {},
          periodStart,
          plan,
          interval,
          previous: { planCode: subscription.plan.code, interval: subscription.interval },
          amountCents: amount.amountCents,
          orderId,
          providerTransactionId: result.transactionId ?? null,
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
        throw new HttpException(
          `La tarjeta fue rechazada${result.message ? `: ${result.message}` : ''}`,
          HttpStatus.PAYMENT_REQUIRED,
        );
      case 'error':
        await this.outcomes.applyEstablishFailure(failed);
        throw new BadGatewayException(
          'La pasarela de pagos falló; intenta de nuevo en unos minutos',
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
