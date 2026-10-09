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

/** Recompensa del catálogo (TASK-023): un producto del menú o un descuento fijo. */
export const REWARD_CATALOG_KIND = ['item', 'discount'] as const;
export type RewardCatalogKind = (typeof REWARD_CATALOG_KIND)[number];

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
  // TASK-005: cobro
  'payment_succeeded',
  'payment_failed',
  'payment_unknown', // la pasarela no confirmó: se reconcilia, no se recobra
  'payment_method_updated',
  'plan_change_scheduled',
  'cancel_scheduled',
  'cancel_resumed',
  'past_due', // período o prueba vencidos sin pago
  'billing_alert', // para revisar: posible doble pago, monto distinto, card-testing
] as const;
export type BillingEventType = (typeof BILLING_EVENT_TYPE)[number];

/**
 * Eventos que ve el DUEÑO de la marca (`GET /api/billing`): lista blanca. Las alertas, los
 * cobros sin confirmar y cualquier tipo nuevo quedan solo para la plataforma hasta que se
 * agreguen acá a propósito.
 */
export const OWNER_BILLING_EVENT_TYPE = [
  'trial_started',
  'trial_extended',
  'trial_expired',
  'plan_changed',
  'suspended',
  'reactivated',
  'canceled',
  'payment_succeeded',
  'payment_failed',
  'payment_method_updated',
  'plan_change_scheduled',
  'cancel_scheduled',
  'cancel_resumed',
  'past_due',
] as const satisfies readonly BillingEventType[];
export type OwnerBillingEventType = (typeof OWNER_BILLING_EVENT_TYPE)[number];

/** Tipo e intentos abiertos de un cobro (`payment_attempts`), como los ve la plataforma. */
export const PAYMENT_ATTEMPT_KIND = ['establish', 'renewal'] as const;
export const OPEN_PAYMENT_ATTEMPT_STATUS = ['pending', 'unknown', 'needs_review'] as const;

/** Cómo se cobra la suscripción: `ms-payments` (tarjeta, CyberSource) o `manual` (lo registra la plataforma). */
export const BILLING_MODE = ['ms-payments', 'manual'] as const;
export type BillingMode = (typeof BILLING_MODE)[number];
