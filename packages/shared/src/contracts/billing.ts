import { z } from 'zod';
import {
  BILLING_INTERVAL,
  BILLING_MODE,
  OWNER_BILLING_EVENT_TYPE,
  PLAN_CODE,
  SUBSCRIPTION_STATUS,
} from '../domain/enums.js';
import { changePlanSchema, countryCodeSchema } from './platform.js';

/**
 * Contratos del cobro de la suscripción (TASK-005): `/api/billing/*` (dueño de la marca) y
 * las rutas de cobro de la plataforma.
 *
 * El número de tarjeta y el CVV solo existen en `paymentMethodInputSchema`: cruzan la API
 * en memoria hacia la pasarela y nunca vuelven en una respuesta ni se guardan.
 */

/** Checksum de Luhn: atrapa el dígito mal tipeado antes de gastar un intento en el banco. */
export function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

// Los mensajes nunca incluyen el valor recibido: un 400 no puede devolver el PAN.
const cardNumberSchema = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .refine((digits) => /^\d{12,19}$/.test(digits), 'Número de tarjeta inválido')
  .refine(passesLuhn, 'Número de tarjeta inválido');

const expiryMonthSchema = z
  .string()
  .trim()
  .regex(/^(0?[1-9]|1[0-2])$/, 'Mes de vencimiento inválido')
  .transform((month) => month.padStart(2, '0'));

const expiryYearSchema = z
  .string()
  .trim()
  .regex(/^(\d{2}|\d{4})$/, 'Año de vencimiento inválido')
  .transform((year) => (year.length === 2 ? `20${year}` : year));

export const paymentCardSchema = z
  .object({
    number: cardNumberSchema,
    expiryMonth: expiryMonthSchema,
    expiryYear: expiryYearSchema,
    cvv: z
      .string()
      .trim()
      .regex(/^\d{3,4}$/, 'CVV inválido'),
    holder: z.string().trim().min(2).max(80),
  })
  .refine(
    (card) => {
      const now = new Date();
      const year = Number(card.expiryYear);
      const month = Number(card.expiryMonth);
      return (
        year > now.getUTCFullYear() ||
        (year === now.getUTCFullYear() && month >= now.getUTCMonth() + 1)
      );
    },
    { message: 'La tarjeta está vencida', path: ['expiryMonth'] },
  );

export const billingAddressSchema = z.object({
  country: countryCodeSchema,
  state: z.string().trim().max(60).optional(),
  city: z.string().trim().max(60).optional(),
  line1: z.string().trim().max(120).optional(),
  zip: z.string().trim().max(20).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(254).optional(),
});

/** `POST /api/billing/payment-method`: alta (o cambio) de tarjeta + primer cobro. */
export const paymentMethodInputSchema = z.object({
  card: paymentCardSchema,
  billing: billingAddressSchema,
});

/** `POST /api/billing/change-plan`: se aplica al abrir el próximo período, sin prorrateo. */
export const billingChangePlanSchema = changePlanSchema;

export const billingAmountSchema = z.object({
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
});

export const savedCardSchema = z.object({
  brand: z.string().nullable(),
  last4: z.string().nullable(),
  expMonth: z.number().int().nullable(),
  expYear: z.number().int().nullable(),
});

/**
 * Evento de cobro tal como lo ve el dueño: solo tipos de la lista blanca y una descripción
 * GENERADA por el servidor desde el tipo. Nunca el `message` interno (emails del admin,
 * referencias, notas, orderIds).
 */
export const ownerBillingEventSchema = z.object({
  type: z.enum(OWNER_BILLING_EVENT_TYPE),
  description: z.string(),
  amountCents: z.number().int().nullable(),
  status: z.string().nullable(),
  createdAt: z.coerce.date(),
});

/** `GET /api/billing`: estado del cobro para el dueño. Sin token ni ids de la pasarela. */
export const billingOverviewSchema = z.object({
  mode: z.enum(BILLING_MODE),
  status: z.enum(SUBSCRIPTION_STATUS),
  planCode: z.enum(PLAN_CODE),
  planName: z.string(),
  interval: z.enum(BILLING_INTERVAL),
  /** Precio del plan e intervalo actuales. */
  price: billingAmountSchema,
  trialEndsAt: z.coerce.date().nullable(),
  currentPeriodStart: z.coerce.date(),
  currentPeriodEnd: z.coerce.date(),
  cancelAtPeriodEnd: z.boolean(),
  /** Próximo reintento de cobro tras un rechazo. */
  retryAt: z.coerce.date().nullable(),
  /** Cambio de plan agendado para el próximo período. */
  pendingPlan: z
    .object({
      planCode: z.enum(PLAN_CODE),
      interval: z.enum(BILLING_INTERVAL),
      price: billingAmountSchema,
    })
    .nullable(),
  card: savedCardSchema.nullable(),
  /** Últimos 20 visibles para el dueño, el más nuevo primero. */
  events: z.array(ownerBillingEventSchema),
});

// ─── Plataforma ──────────────────────────────────────────────────────────────

/** `POST /api/platform/tenants/:slug/record-payment`: pago recibido por fuera (transferencia…). */
export const recordPaymentSchema = z.object({
  amountCents: z.number().int().positive().max(100_000_000),
  /** Referencia del pago (número de transferencia, recibo). */
  reference: z.string().trim().min(1).max(200),
});

export const PAYMENT_RESOLUTION = ['succeeded', 'failed'] as const;

/**
 * `POST /api/platform/tenants/:slug/resolve-payment`: cierra a mano un intento que la
 * pasarela no confirmó (timeout sin `transactionId`), después de mirarlo en CyberSource.
 */
export const resolvePaymentSchema = z.object({
  orderId: z.string().trim().min(1).max(64),
  outcome: z.enum(PAYMENT_RESOLUTION),
  note: z.string().trim().max(500).optional(),
});

/** `GET /api/platform/billing/summary`. */
export const billingSummarySchema = z.object({
  currency: z.string().length(3),
  /** Suma de suscripciones `active`; las anuales cuentan su precio / 12. */
  mrrCents: z.number().int().nonnegative(),
  byStatus: z.record(z.enum(SUBSCRIPTION_STATUS), z.number().int().nonnegative()),
  failuresLast7Days: z.number().int().nonnegative(),
  /**
   * Cobros que alguien tiene que mirar: sin confirmar (pending/unknown) y los que la pasarela
   * rechazó antes del banco (`failed_non_bank`) en los últimos 7 días.
   */
  unresolvedPayments: z.number().int().nonnegative(),
  /** Alertas (`billing_alert`) de los últimos 7 días: posible doble pago, monto distinto… */
  alertsLast7Days: z.number().int().nonnegative(),
});

export type PaymentCard = z.infer<typeof paymentCardSchema>;
export type BillingAddress = z.infer<typeof billingAddressSchema>;
export type PaymentMethodInput = z.infer<typeof paymentMethodInputSchema>;
export type BillingChangePlanInput = z.infer<typeof billingChangePlanSchema>;
export type BillingAmount = z.infer<typeof billingAmountSchema>;
export type SavedCard = z.infer<typeof savedCardSchema>;
export type OwnerBillingEvent = z.infer<typeof ownerBillingEventSchema>;
export type BillingOverview = z.infer<typeof billingOverviewSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type PaymentResolution = (typeof PAYMENT_RESOLUTION)[number];
export type ResolvePaymentInput = z.infer<typeof resolvePaymentSchema>;
export type BillingSummary = z.infer<typeof billingSummarySchema>;
