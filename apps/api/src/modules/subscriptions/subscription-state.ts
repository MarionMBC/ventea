import type { BillingInterval, SubscriptionStatus } from '@ventea/shared';

/**
 * Máquina de estados de la suscripción (ADR 0007). Lógica pura: sin base ni reloj
 * propio, para poder probarla con fechas fijas.
 *
 *   trialing ──(vence la prueba)──▶ past_due ──(reactivar)──▶ active
 *   active ──(vence sin pago)──▶ past_due (atiende GRACE_DAYS) ──(ciclo)──▶ suspended
 *      │ └──(extender)──▶ trialing ◀──(extender)──┘              │
 *      └────────────(suspender)──▶ suspended ◀──(suspender)──────┘
 *                                      └──(reactivar)──▶ active
 *   canceled ──(reactivar)──▶ active
 *
 * Sin cobro todavía (TASK-005), "reactivar" es la marca de pago manual del admin de
 * plataforma: abre un período nuevo desde hoy.
 */

export const TRIAL_DAYS = 14;

/**
 * Días que una marca `past_due` (período pagado que venció sin pago) sigue atendiendo antes de
 * suspenderse. Decisión de producto TASK-007: durante la gracia el menú y los pedidos
 * funcionan; el panel avisa con la fecha de fin. El ciclo de cobro la suspende al cumplirse.
 */
export const GRACE_DAYS = 7;

/** Lo que el middleware necesita saber de la suscripción para decidir. */
export interface SubscriptionSnapshot {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date;
}

/**
 * `allow` atiende; `grace` atiende pero el panel avisa (past_due en gracia); `block` responde
 * 402; `expire_trial` también responde 402, pero antes hay que pasar la suscripción a
 * `past_due` (la prueba venció y nadie pagó).
 */
export type AccessDecision = 'allow' | 'grace' | 'block' | 'expire_trial';

/**
 * Fin de la gracia de una marca `past_due`: `currentPeriodEnd + GRACE_DAYS`. `null` (sin
 * gracia) si no está `past_due`, si el período vencido era la prueba (`currentPeriodEnd <=
 * trialEndsAt`: alta y extend-trial mueven las dos fechas juntas; una prueba vencida sin pago
 * no tiene gracia) o si el período todavía no terminó (un `past_due` así es un dato anómalo: se
 * trata como antes, bloqueado).
 */
export function graceEndsAt(subscription: SubscriptionSnapshot, now: Date): Date | null {
  if (subscription.status !== 'past_due') return null;
  const { trialEndsAt, currentPeriodEnd } = subscription;
  if (currentPeriodEnd.getTime() > now.getTime()) return null;
  if (trialEndsAt && currentPeriodEnd.getTime() <= trialEndsAt.getTime()) return null;
  return addDays(currentPeriodEnd, GRACE_DAYS);
}

export function accessDecision(
  subscription: SubscriptionSnapshot | null,
  now: Date,
): AccessDecision {
  // Sin suscripción: no se corta. La migración y todas las altas la crean; una marca sin
  // ella es un dato roto que se arregla a mano, no motivo para dejar a un cliente sin
  // servicio. (Facturación falla abierta; el aislamiento entre marcas, no.)
  if (!subscription) return 'allow';

  switch (subscription.status) {
    case 'active':
      // El período no se mira acá: el ciclo de cobro (TASK-005) cobra la renovación o pasa
      // la suscripción a `past_due`. Un `active` vencido es un cobro en curso o sin
      // confirmar con el banco, no un cliente que dejó de pagar.
      return 'allow';
    case 'trialing':
      if (!subscription.trialEndsAt || subscription.trialEndsAt.getTime() > now.getTime()) {
        return 'allow';
      }
      return 'expire_trial';
    case 'past_due': {
      // Gracia (TASK-007): sigue atendiendo hasta `graceEndsAt`; pasado eso bloquea aunque el
      // ciclo (cada 15 min) todavía no la haya pasado a `suspended`.
      const graceEnd = graceEndsAt(subscription, now);
      return graceEnd && graceEnd.getTime() > now.getTime() ? 'grace' : 'block';
    }
    case 'suspended':
    case 'canceled':
      return 'block';
  }
}

export type SubscriptionAction = 'suspend' | 'reactivate' | 'extend_trial' | 'change_plan';

const ALLOWED_FROM: Record<SubscriptionAction, readonly SubscriptionStatus[]> = {
  suspend: ['trialing', 'active', 'past_due'],
  reactivate: ['past_due', 'suspended', 'canceled'],
  extend_trial: ['trialing', 'past_due'],
  // Cancelada: primero se reactiva. Cambiar el plan de algo cancelado no significa nada.
  change_plan: ['trialing', 'active', 'past_due', 'suspended'],
};

/** Estado al que lleva la acción, o `null` si no se puede desde el estado actual. */
export function nextStatus(
  current: SubscriptionStatus,
  action: SubscriptionAction,
): SubscriptionStatus | null {
  if (!ALLOWED_FROM[action].includes(current)) return null;
  switch (action) {
    case 'suspend':
      return 'suspended';
    case 'reactivate':
      return 'active';
    case 'extend_trial':
      return 'trialing';
    case 'change_plan':
      return current;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * Fin del período que empieza en `start`: un mes o un año calendario (UTC), con el día
 * recortado al último del mes destino. `setUTCMonth` solo desbordaría (31 ene + 1 mes =
 * 3 mar); acá 31 ene → 28/29 feb y, anual, 29 feb → 28 feb. La hora se conserva.
 */
export function periodEnd(start: Date, interval: BillingInterval): Date {
  const year = start.getUTCFullYear() + (interval === 'year' ? 1 : 0);
  const month = start.getUTCMonth() + (interval === 'month' ? 1 : 0); // 12 = enero siguiente
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const end = new Date(start.getTime());
  end.setUTCFullYear(year, month, Math.min(start.getUTCDate(), lastDay));
  return end;
}

/**
 * Nuevo fin de prueba al extenderla `days` días. Se suma desde el fin actual si todavía
 * no llegó, o desde hoy si ya venció: extender una prueba vencida hace un mes no puede
 * devolver una fecha pasada.
 */
export function extendedTrialEnd(trialEndsAt: Date | null, now: Date, days: number): Date {
  const base = trialEndsAt && trialEndsAt.getTime() > now.getTime() ? trialEndsAt : now;
  return addDays(base, days);
}
