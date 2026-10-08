import type { BillingInterval, SubscriptionStatus } from '@ventea/shared';

import { addDays } from '@/modules/subscriptions/subscription-state';

/**
 * Reglas del cobro recurrente (TASK-005). Lógica pura, con el reloj como parámetro, para
 * probar el dunning y las fechas sin base ni esperas.
 */

/** Reintentos tras un rechazo, en días desde el vencimiento del período. */
export const RETRY_OFFSETS_DAYS = [1, 3, 7] as const;
/** Cobro original + 3 reintentos. Al 4.º rechazo, `suspended`. */
export const MAX_RENEWAL_ATTEMPTS = RETRY_OFFSETS_DAYS.length + 1;
/** Días que una marca sin tarjeta (o en modo manual) sigue `past_due` antes de suspenderse. */
export const GRACE_DAYS = 7;
/** `clientReferenceInformation.code` de CyberSource admite 50 caracteres. */
export const ORDER_ID_MAX_LENGTH = 50;

export function planPriceCents(
  plan: { priceMonthlyCents: number; priceYearlyCents: number },
  interval: BillingInterval,
): number {
  return interval === 'year' ? plan.priceYearlyCents : plan.priceMonthlyCents;
}

/** Aporte de una suscripción al MRR: la anual cuenta su precio / 12. */
export function monthlyValueCents(
  plan: { priceMonthlyCents: number; priceYearlyCents: number },
  interval: BillingInterval,
): number {
  return interval === 'year' ? Math.round(plan.priceYearlyCents / 12) : plan.priceMonthlyCents;
}

/**
 * Desde cuándo corre el período que se paga ahora (alta de tarjeta o pago manual): lo que
 * ya está cubierto no se pierde. En prueba, desde el fin de la prueba; `active` con período
 * vigente, desde su fin (pago adelantado); cualquier otro caso, desde ahora.
 */
export function nextPeriodStart(
  subscription: {
    status: SubscriptionStatus;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date;
  },
  now: Date,
): Date {
  const paidThrough =
    subscription.status === 'trialing'
      ? subscription.trialEndsAt
      : subscription.status === 'active'
        ? subscription.currentPeriodEnd
        : null;
  return paidThrough && paidThrough.getTime() > now.getTime() ? paidThrough : now;
}

/** Vencimiento que cuenta para la marca: fin de la prueba si está en prueba, si no del período. */
export function dueAt(subscription: {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date;
}): Date {
  return subscription.status === 'trialing' && subscription.trialEndsAt
    ? subscription.trialEndsAt
    : subscription.currentPeriodEnd;
}

function compactId(uuid: string): string {
  return uuid.replace(/-/g, '');
}

function yyyymmdd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Clave idempotente de un intento de renovación: `sub-<subId>-<inicio del período>-a<n>`.
 * Determinística: si dos procesos o dos corridas llegan al mismo intento, el índice único
 * de `payment_attempts.orderId` deja pasar a uno solo. Compacta (uuid sin guiones, fecha
 * `AAAAMMDD`) para entrar en los 50 caracteres de CyberSource.
 */
export function renewalOrderId(subscriptionId: string, periodStart: Date, attempt: number): string {
  return `sub-${compactId(subscriptionId)}-${yyyymmdd(periodStart)}-a${attempt}`;
}

/** Clave del cobro de alta de tarjeta (lo dispara el dueño: única por intento). */
export function establishOrderId(subscriptionId: string, now: Date): string {
  return `est-${compactId(subscriptionId)}-${now.getTime().toString(36)}`;
}

export type FailureDecision =
  { status: 'past_due'; retryAt: Date } | { status: 'suspended'; retryAt: null };

/**
 * Qué pasa tras el rechazo del intento `attempt` (1-based) de cobrar el período que vence en
 * `due`: `past_due` con reintento a los días 1, 3 y 7, o `suspended` tras el 4.º.
 */
export function afterRenewalFailure(attempt: number, due: Date): FailureDecision {
  if (attempt >= MAX_RENEWAL_ATTEMPTS) return { status: 'suspended', retryAt: null };
  return { status: 'past_due', retryAt: addDays(due, RETRY_OFFSETS_DAYS[attempt - 1]!) };
}

/** ¿Venció la gracia de una marca `past_due` que no se cobra sola? */
export function graceExpired(due: Date, now: Date): boolean {
  return addDays(due, GRACE_DAYS).getTime() <= now.getTime();
}
