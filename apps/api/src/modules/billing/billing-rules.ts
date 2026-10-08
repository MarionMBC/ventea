import type { BillingInterval, SubscriptionStatus } from '@ventea/shared';

import { addDays, GRACE_DAYS } from '@/modules/subscriptions/subscription-state';

import type { ChargeResult, GatewayAmount } from './gateway/payment-gateway';

/**
 * Reglas del cobro recurrente (TASK-005). Lógica pura, con el reloj como parámetro, para
 * probar el dunning y las fechas sin base ni esperas.
 */

/** Reintentos tras un rechazo, en días desde el vencimiento del período. */
export const RETRY_OFFSETS_DAYS = [1, 3, 7] as const;
/** Cobro original + 3 reintentos. Al 4.º rechazo, `suspended`. */
export const MAX_RENEWAL_ATTEMPTS = RETRY_OFFSETS_DAYS.length + 1;
/**
 * Días que una marca sin tarjeta (o en modo manual) sigue `past_due`, atendiendo, antes de
 * suspenderse. Vive en subscription-state (lo usa también el middleware).
 */
export { GRACE_DAYS };
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
 * Desde cuándo corre el período que se paga ahora (alta de tarjeta o pago manual): nunca antes
 * de lo ya cubierto, sea cual sea el estado. En prueba, desde el fin de la prueba; con el
 * período vigente (también `suspended` a mano a mitad de período), desde su fin (pago
 * adelantado); si ya venció, desde ahora. Así `applyPaid` siempre encuentra
 * `currentPeriodEnd <= periodStart`: si no, es que otro pago cubrió ese período.
 */
export function nextPeriodStart(
  subscription: {
    status: SubscriptionStatus;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date;
  },
  now: Date,
): Date {
  const candidates = [now, subscription.currentPeriodEnd];
  if (subscription.status === 'trialing' && subscription.trialEndsAt) {
    candidates.push(subscription.trialEndsAt);
  }
  return new Date(Math.max(...candidates.map((date) => date.getTime())));
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

/** Separación mínima entre dos cobros a la misma tarjeta (catch-up tras días sin ciclo). */
export const MIN_RETRY_GAP_HOURS = 20;

/**
 * Qué pasa tras el rechazo bancario número `failures` (1-based) del período que vence en
 * `due`: `past_due` con reintento a los días 1, 3 y 7, o `suspended` tras el 4.º. Si el ciclo
 * estuvo parado y esas fechas ya pasaron, el reintento se espacia desde `now` (nunca una
 * ráfaga de cobros a la misma tarjeta).
 */
export function afterRenewalFailure(failures: number, due: Date, now: Date): FailureDecision {
  if (failures >= MAX_RENEWAL_ATTEMPTS) return { status: 'suspended', retryAt: null };
  const scheduled = addDays(due, RETRY_OFFSETS_DAYS[failures - 1]!);
  const earliest = new Date(now.getTime() + MIN_RETRY_GAP_HOURS * 60 * 60 * 1000);
  return {
    status: 'past_due',
    retryAt: scheduled.getTime() >= earliest.getTime() ? scheduled : earliest,
  };
}

/** ¿Venció la gracia de una marca `past_due` que no se cobra sola? */
export function graceExpired(due: Date, now: Date): boolean {
  return addDays(due, GRACE_DAYS).getTime() <= now.getTime();
}

/**
 * Un `approved` solo cuenta si es lo que se pidió: mismo orderId y mismo monto, sin
 * autorización parcial. Si la pasarela devolvió otra cosa, el cobro pasa a `unknown` con una
 * alerta: no se da por pagado ni se recobra; lo mira una persona.
 */
export function checkApproval(
  result: ChargeResult,
  expected: { orderId: string; amount: GatewayAmount },
): ChargeResult {
  if (result.status !== 'approved') return result;
  const problems: string[] = [];
  if (result.partial) problems.push('autorización parcial');
  if (result.orderId && result.orderId !== expected.orderId) {
    problems.push(`orderId devuelto ${result.orderId}`);
  }
  const approved = result.approvedAmount;
  if (
    approved &&
    (approved.amountCents !== expected.amount.amountCents ||
      approved.currency.toUpperCase() !== expected.amount.currency.toUpperCase())
  ) {
    problems.push(
      `aprobado ${approved.amountCents} ${approved.currency} de ${expected.amount.amountCents} ${expected.amount.currency}`,
    );
  }
  if (problems.length === 0) return result;
  return {
    ...result,
    status: 'unknown',
    alert: `Cobro ${expected.orderId} aprobado distinto de lo pedido (${problems.join('; ')}): revisar antes de darlo por pagado`,
  };
}

/**
 * PCI: el alta con número de tarjeta crudo hace pasar el PAN por la API (SAQ D). En
 * producción con cobro real solo se permite con `ALLOW_RAW_CARD_API=true` explícito; el camino
 * previsto es tokenizar en el navegador (capture-context / Microform).
 */
export function rawCardApiAllowed(config: {
  nodeEnv: string | undefined;
  mode: 'ms-payments' | 'manual';
  allowRawCard: string | undefined;
}): boolean {
  if (config.mode !== 'ms-payments' || config.nodeEnv !== 'production') return true;
  return config.allowRawCard === 'true';
}
