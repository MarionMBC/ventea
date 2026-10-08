/**
 * Vocabulario del dominio compartido por API, app móvil y panel admin.
 * Estos valores viajan por la red y se persisten: renombrar uno es un breaking change
 * que exige migración de datos. Agregar es seguro; quitar no.
 */

export const ORDER_STATUS = [
  'draft', // carrito abierto, todavía no confirmado
  'pending_payment',
  'confirmed',
  'preparing',
  'ready', // listo para retirar / entregar
  'completed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];

/** Estados desde los que un pedido ya no puede cambiar. */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['completed', 'cancelled'];

export const FULFILLMENT_TYPE = ['pickup', 'dine_in', 'delivery'] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPE)[number];

export const PAYMENT_STATUS = ['pending', 'authorized', 'paid', 'refunded', 'failed'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];

/**
 * Roles dentro de un tenant. `platform_admin` es el único rol que cruza tenants
 * (nosotros, los que vendemos el SaaS) y vive fuera de la membresía a un tenant.
 */
export const TENANT_ROLE = ['owner', 'manager', 'staff'] as const;
export type TenantRole = (typeof TENANT_ROLE)[number];

export const REWARD_LEDGER_REASON = [
  'order_earned',
  'redemption',
  'manual_adjustment',
  'expiration',
  'signup_bonus',
] as const;
export type RewardLedgerReason = (typeof REWARD_LEDGER_REASON)[number];

/**
 * Suscripción del SaaS (ADR 0007). `trialing` y `active` atienden; el resto deja la API
 * pública de la marca en 402 (el staff sigue entrando al panel para pagar).
 */
export const SUBSCRIPTION_STATUS = [
  'trialing',
  'active',
  'past_due', // prueba vencida o cobro fallido: falta pagar
  'suspended', // suspendida a mano o por falta de pago
  'canceled',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[number];

export const BILLING_INTERVAL = ['month', 'year'] as const;
export type BillingInterval = (typeof BILLING_INTERVAL)[number];

/** Planes del SaaS. Precios y límites viven en la tabla `plans`, no acá. */
export const PLAN_CODE = ['basic', 'pro', 'chain'] as const;
export type PlanCode = (typeof PLAN_CODE)[number];

export const BILLING_EVENT_TYPE = [
  'trial_started',
  'trial_extended',
  'trial_expired',
  'plan_changed',
  'suspended',
  'reactivated',
  'canceled',
] as const;
export type BillingEventType = (typeof BILLING_EVENT_TYPE)[number];
