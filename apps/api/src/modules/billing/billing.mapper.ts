import type { Prisma } from '@prisma/client';
import type {
  BillingEvent,
  BillingInterval,
  BillingMode,
  BillingOverview,
  OwnerBillingEvent,
  OwnerBillingEventType,
  PlanCode,
} from '@ventea/shared';

import { isPlanCode } from '@/modules/platform/platform.mapper';
import { graceEndsAt } from '@/modules/subscriptions/subscription-state';

import { planPriceCents } from './billing-rules';

const PLAN_FIELDS = {
  id: true,
  code: true,
  name: true,
  priceMonthlyCents: true,
  priceYearlyCents: true,
  currency: true,
  maxLocations: true,
} satisfies Prisma.PlanSelect;

/** Lo que billing lee de la suscripción. El token se lee para cobrar; nunca se devuelve. */
export const BILLING_SUBSCRIPTION_SELECT = {
  id: true,
  tenantId: true,
  status: true,
  interval: true,
  trialEndsAt: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  retryAt: true,
  paymentToken: true,
  networkTransactionId: true,
  cardBrand: true,
  cardLast4: true,
  cardExpMonth: true,
  cardExpYear: true,
  pendingInterval: true,
  plan: { select: PLAN_FIELDS },
  pendingPlan: { select: PLAN_FIELDS },
} satisfies Prisma.SubscriptionSelect;

export type BillingSubscription = Prisma.SubscriptionGetPayload<{
  select: typeof BILLING_SUBSCRIPTION_SELECT;
}>;
export type BillingPlan = BillingSubscription['plan'];

/** Plan e intervalo del PRÓXIMO período: el cambio agendado, si lo hay. */
export function nextPeriodPlan(subscription: BillingSubscription): {
  plan: BillingPlan;
  interval: BillingInterval;
} {
  return {
    plan: subscription.pendingPlan ?? subscription.plan,
    interval: subscription.pendingInterval ?? subscription.interval,
  };
}

/** ¿Tiene una tarjeta con la que se pueda cobrar sin el cliente presente? */
export function canChargeRecurring(subscription: {
  paymentToken: string | null;
  networkTransactionId: string | null;
}): boolean {
  return Boolean(subscription.paymentToken && subscription.networkTransactionId);
}

function planCode(code: string): PlanCode {
  if (!isPlanCode(code)) throw new Error(`Plan desconocido en la base: ${code}`);
  return code;
}

export function toBillingEvent(event: {
  type: BillingEvent['type'];
  amountCents: number | null;
  status: string | null;
  message: string | null;
  createdAt: Date;
}): BillingEvent {
  return {
    type: event.type,
    amountCents: event.amountCents,
    status: event.status,
    message: event.message,
    createdAt: event.createdAt,
  };
}

const OWNER_DESCRIPTION: Record<OwnerBillingEventType, string> = {
  trial_started: 'Prueba gratis iniciada',
  trial_extended: 'Prueba gratis extendida',
  trial_expired: 'Prueba gratis vencida',
  plan_changed: 'Cambio de plan aplicado',
  suspended: 'Servicio suspendido',
  reactivated: 'Servicio reactivado',
  canceled: 'Suscripción cancelada',
  payment_succeeded: 'Pago registrado',
  payment_failed: 'Cobro rechazado por el banco',
  payment_method_updated: 'Tarjeta actualizada',
  plan_change_scheduled: 'Cambio de plan agendado',
  cancel_scheduled: 'Cancelación agendada',
  cancel_resumed: 'Cancelación anulada',
  past_due: 'Pago pendiente',
};

/**
 * Evento para el dueño: tipo de la lista blanca y una descripción generada acá. El `message`
 * de la base es interno (email del admin, referencia del pago, notas, orderId): no sale.
 */
export function toOwnerBillingEvent(event: {
  type: OwnerBillingEventType;
  amountCents: number | null;
  status: string | null;
  createdAt: Date;
}): OwnerBillingEvent {
  // Un 400 de la pasarela (no llegó al banco) no es un rechazo del banco.
  const description =
    event.type === 'payment_failed' && event.status === 'failed_non_bank'
      ? 'No se pudo procesar el cobro'
      : OWNER_DESCRIPTION[event.type];
  return {
    type: event.type,
    description,
    amountCents: event.amountCents,
    status: event.status,
    createdAt: event.createdAt,
  };
}

export function toBillingOverview(
  subscription: BillingSubscription,
  mode: BillingMode,
  events: Parameters<typeof toOwnerBillingEvent>[0][],
): BillingOverview {
  const { plan, pendingPlan } = subscription;
  const pendingInterval = subscription.pendingInterval ?? subscription.interval;
  const hasPending =
    (pendingPlan && pendingPlan.id !== plan.id) || pendingInterval !== subscription.interval;
  const pending = pendingPlan ?? plan;

  return {
    mode,
    status: subscription.status,
    planCode: planCode(plan.code),
    planName: plan.name,
    interval: subscription.interval,
    price: {
      amountCents: planPriceCents(plan, subscription.interval),
      currency: plan.currency,
    },
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    retryAt: subscription.retryAt,
    graceEndsAt: graceEndsAt(subscription, new Date()),
    pendingPlan: hasPending
      ? {
          planCode: planCode(pending.code),
          interval: pendingInterval,
          price: {
            amountCents: planPriceCents(pending, pendingInterval),
            currency: pending.currency,
          },
        }
      : null,
    card: subscription.paymentToken
      ? {
          brand: subscription.cardBrand,
          last4: subscription.cardLast4,
          expMonth: subscription.cardExpMonth,
          expYear: subscription.cardExpYear,
        }
      : null,
    events: events.map(toOwnerBillingEvent),
  };
}
