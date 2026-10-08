import type {
  BillingEventType,
  BillingInterval,
  PlanCode,
  PlatformTenant,
  SubscriptionStatus,
} from '@ventea/shared';

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: 'En prueba',
  active: 'Activa',
  past_due: 'Pago pendiente',
  suspended: 'Suspendida',
  canceled: 'Cancelada',
};

export const PLAN_LABEL: Record<PlanCode, string> = {
  basic: 'Básico',
  pro: 'Pro',
  chain: 'Cadena',
};

export const INTERVAL_LABEL: Record<BillingInterval, string> = {
  month: 'mensual',
  year: 'anual',
};

export const EVENT_LABEL: Record<BillingEventType, string> = {
  trial_started: 'Prueba iniciada',
  trial_extended: 'Prueba extendida',
  trial_expired: 'Prueba vencida',
  plan_changed: 'Cambio de plan',
  suspended: 'Suspendida',
  reactivated: 'Reactivada',
  canceled: 'Cancelada',
};

/** Etiqueta de un tipo de evento; si llega uno nuevo (TASK-005) se muestra tal cual. */
export function eventLabel(type: string): string {
  return (EVENT_LABEL as Record<string, string>)[type] ?? type;
}

export type PlatformAction = 'suspend' | 'reactivate' | 'extend_trial' | 'change_plan';

/** Mismo criterio que la API (`subscription-state.ts`): qué acción se puede desde cada estado. */
const ALLOWED_FROM: Record<PlatformAction, readonly SubscriptionStatus[]> = {
  suspend: ['trialing', 'active', 'past_due'],
  reactivate: ['past_due', 'suspended', 'canceled'],
  extend_trial: ['trialing', 'past_due'],
  change_plan: ['trialing', 'active', 'past_due', 'suspended'],
};

export function canDo(action: PlatformAction, status: SubscriptionStatus | undefined): boolean {
  return status !== undefined && ALLOWED_FROM[action].includes(status);
}

/** Fecha que importa según el estado: fin de prueba o fin del período. */
export function periodEndOf(tenant: PlatformTenant): { label: string; date: Date } | null {
  const sub = tenant.subscription;
  if (!sub) return null;
  if (sub.status === 'trialing' && sub.trialEndsAt) {
    return { label: 'Fin de prueba', date: sub.trialEndsAt };
  }
  return { label: 'Fin de período', date: sub.currentPeriodEnd };
}

const dateFormat = new Intl.DateTimeFormat('es-HN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const dateTimeFormat = new Intl.DateTimeFormat('es-HN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatDay = (date: Date) => dateFormat.format(date);
export const formatDateTime = (date: Date) => dateTimeFormat.format(date);

export function formatUsdCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
