import type {
  AppPublisher,
  AppStatus,
  BillingEventType,
  BillingInterval,
  PlanCode,
  PlatformTenant,
  SubscriptionStatus,
} from '@ventea/shared';

import { formatMoney, PANEL_LOCALE } from '@/lib/format';

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
  payment_succeeded: 'Pago recibido',
  payment_failed: 'Pago rechazado',
  payment_unknown: 'Cobro sin confirmar',
  payment_method_updated: 'Tarjeta actualizada',
  plan_change_scheduled: 'Cambio de plan agendado',
  cancel_scheduled: 'Cancelación agendada',
  cancel_resumed: 'Cancelación anulada',
  past_due: 'Pago pendiente',
  billing_alert: 'Alerta de cobro',
};

/**
 * Etiqueta de un tipo de evento. Uno que este panel todavía no conoce (API más nueva que el
 * web) se muestra como «Evento: <tipo>»: el schema de lectura del panel lo deja pasar.
 */
export function eventLabel(type: string): string {
  return (EVENT_LABEL as Record<string, string>)[type] ?? `Evento: ${type}`;
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

/** Dólares del cobro de la plataforma, con el formato del locale (por defecto el del panel). */
export function formatUsdCents(cents: number, locale = PANEL_LOCALE): string {
  return formatMoney(cents, 'USD', locale);
}

/** `Visa ••••4242`, o «Sin tarjeta». Nunca hay más datos: la API no los expone. */
export function cardLabel(card: { brand: string | null; last4: string | null } | null): string {
  if (!card) return 'Sin tarjeta';
  return [card.brand ?? 'Tarjeta', card.last4 ? `••••${card.last4}` : null]
    .filter(Boolean)
    .join(' ');
}

export const APP_STATUS_LABEL: Record<AppStatus, string> = {
  not_requested: 'Sin solicitar',
  requested: 'Solicitada',
  building: 'En construcción',
  in_review: 'En revisión de tienda',
  published: 'Publicada',
};

export const PUBLISHER_LABEL: Record<AppPublisher, string> = {
  ventea: 'Ventea (cuenta de Ventea)',
  client: 'La marca (su cuenta de desarrollador)',
};

/** Etiqueta de un evento de la app; uno desconocido se muestra tal cual. */
export function appEventLabel(type: string): string {
  const labels: Record<string, string> = {
    requested: 'Solicitud del dueño',
    updated: 'Configuración actualizada',
    push_credentials_set: 'Credenciales push cargadas',
    push_credentials_cleared: 'Credenciales push borradas',
  };
  return labels[type] ?? `Evento: ${type}`;
}
