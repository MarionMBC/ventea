import type { SubscriptionStatus } from '@ventea/shared';

import { addDays, GRACE_DAYS, graceEndsAt } from '@/modules/subscriptions/subscription-state';

/**
 * Qué correo de ciclo de vida le toca a una suscripción en `now` (TASK-021). Lógica pura, con
 * reloj inyectado. El job la evalúa en cada vuelta; la idempotencia la da la `dedupeKey`
 * (tipo + marca + `occurrence` + destinatario), así que evaluarla de más no repite correos.
 *
 * - Prueba por vencer: a 3 días y a 1 día del fin. Si el job la ve por primera vez con ≤ 1 día,
 *   solo va el de 1 día.
 * - `past_due` con gracia (período pagado vencido): «pago pendiente» durante la primera mitad
 *   de la gracia; «recordatorio» desde la mitad hasta el fin. Nunca los dos juntos.
 * - `past_due` sin gracia (la prueba venció sin pago): un solo aviso, si venció hace ≤ 7 días
 *   (una marca vieja en ese estado no recibe un correo sorpresa al desplegar esto).
 */

export interface LifecycleSubscription {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date;
}

export type LifecycleEmail =
  | { kind: 'trial_ending'; occurrence: string; daysLeft: 1 | 3; trialEndsAt: Date }
  | { kind: 'past_due'; occurrence: string; periodEnd: Date; graceEndsAt: Date | null }
  | { kind: 'past_due_reminder'; occurrence: string; graceEndsAt: Date; daysLeft: number };

const DAY_MS = 24 * 60 * 60 * 1000;

export function lifecycleEmailDue(sub: LifecycleSubscription, now: Date): LifecycleEmail | null {
  if (sub.status === 'trialing') {
    if (!sub.trialEndsAt) return null;
    const remaining = sub.trialEndsAt.getTime() - now.getTime();
    if (remaining <= 0) return null;
    const daysLeft = remaining <= DAY_MS ? 1 : remaining <= 3 * DAY_MS ? 3 : null;
    if (!daysLeft) return null;
    return {
      kind: 'trial_ending',
      occurrence: `${sub.trialEndsAt.getTime()}:${daysLeft}`,
      daysLeft,
      trialEndsAt: sub.trialEndsAt,
    };
  }

  if (sub.status !== 'past_due') return null;
  const periodEnd = sub.currentPeriodEnd;
  if (periodEnd.getTime() > now.getTime()) return null; // past_due anómalo: sin aviso
  const occurrence = String(periodEnd.getTime());
  const graceEnd = graceEndsAt(sub, now);

  if (!graceEnd) {
    // Prueba vencida sin pago: ya no atiende. Un aviso, solo si es reciente.
    if (now.getTime() - periodEnd.getTime() > GRACE_DAYS * DAY_MS) return null;
    return { kind: 'past_due', occurrence, periodEnd, graceEndsAt: null };
  }

  if (now.getTime() >= graceEnd.getTime()) return null; // el ciclo la suspende
  const midpoint = addDays(periodEnd, GRACE_DAYS / 2);
  if (now.getTime() < midpoint.getTime()) {
    return { kind: 'past_due', occurrence, periodEnd, graceEndsAt: graceEnd };
  }
  return {
    kind: 'past_due_reminder',
    occurrence,
    graceEndsAt: graceEnd,
    daysLeft: Math.ceil((graceEnd.getTime() - now.getTime()) / DAY_MS),
  };
}
