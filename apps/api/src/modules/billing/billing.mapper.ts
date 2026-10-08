import type { Prisma } from '@prisma/client';
import type {
  BillingEvent,
  BillingInterval,
  BillingMode,
  BillingOverview,
  PlanCode,
} from '@ventea/shared';

import { isPlanCode } from '@/modules/platform/platform.mapper';

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

export function toBillingOverview(
  subscription: BillingSubscription,
  mode: BillingMode,
  events: Parameters<typeof toBillingEvent>[0][],
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
    events: events.map(toBillingEvent),
  };
}
