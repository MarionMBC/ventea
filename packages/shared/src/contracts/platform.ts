import { z } from 'zod';
import {
  BILLING_EVENT_TYPE,
  BILLING_INTERVAL,
  PLAN_CODE,
  SUBSCRIPTION_STATUS,
} from '../domain/enums.js';
import { tenantSlugSchema } from '../domain/tenant.js';
import { emailSchema } from './auth.js';

/**
 * Contratos de la plataforma (`/api/platform/*`, ADR 0007): registro self-service,
 * catálogo de planes y administración del SaaS. Estas rutas no llevan tenant: cruzan
 * marcas por definición.
 */

// ─── Público: planes y registro ──────────────────────────────────────────────

export const planFeaturesSchema = z.object({
  brandedApp: z.boolean(),
  customDomain: z.boolean(),
  reports: z.boolean(),
  prioritySupport: z.boolean(),
});

export const planSchema = z.object({
  code: z.enum(PLAN_CODE),
  name: z.string(),
  priceMonthlyCents: z.number().int().nonnegative(),
  priceYearlyCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  /** Sucursales activas permitidas; `null` = ilimitadas. */
  maxLocations: z.number().int().positive().nullable(),
  features: planFeaturesSchema,
});

/** País ISO 3166-1 alfa-2 (`HN`, `CL`…). Decide la región, nunca la elige el restaurante. */
export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'country: código ISO de 2 letras');

export const signupSchema = z.object({
  restaurantName: z.string().trim().min(2).max(80),
  slug: tenantSlugSchema,
  ownerName: z.string().trim().min(2).max(80),
  ownerEmail: emailSchema,
  ownerPassword: z.string().min(10).max(128),
  planCode: z.enum(PLAN_CODE),
  interval: z.enum(BILLING_INTERVAL),
  country: countryCodeSchema.optional(),
  /** Moneda del menú (ISO 4217). Sin ella, la de la región. */
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'currency: código ISO 4217 de 3 letras')
    .optional(),
  /** Honeypot: campo oculto en el formulario. Una persona lo deja vacío; un bot no. */
  website: z.string().max(200).optional(),
});

export const signupResponseSchema = z.object({
  tenant: z.object({
    slug: z.string(),
    url: z.string(),
    adminUrl: z.string(),
    region: z.string(),
  }),
  trialEndsAt: z.coerce.date(),
});

export const slugAvailabilityQuerySchema = z.object({ slug: z.string().max(100) });

export const SLUG_UNAVAILABLE_REASON = ['invalid', 'reserved', 'taken'] as const;

export const slugAvailabilitySchema = z.object({
  available: z.boolean(),
  reason: z.enum(SLUG_UNAVAILABLE_REASON).optional(),
});

// ─── Administración de la plataforma (JWT `kind: "platform"`) ────────────────

export const platformAdminSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  name: z.string(),
});

export const platformAuthResponseSchema = z.object({
  accessToken: z.string(),
  admin: platformAdminSchema,
});

export const platformSubscriptionSchema = z.object({
  status: z.enum(SUBSCRIPTION_STATUS),
  planCode: z.enum(PLAN_CODE),
  interval: z.enum(BILLING_INTERVAL),
  trialEndsAt: z.coerce.date().nullable(),
  currentPeriodStart: z.coerce.date(),
  currentPeriodEnd: z.coerce.date(),
  cancelAtPeriodEnd: z.boolean(),
});

export const platformTenantSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  region: z.string(),
  createdVia: z.enum(['signup', 'script']),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  /** `null` solo si la marca quedó sin suscripción (no debería pasar: la migración la crea). */
  subscription: platformSubscriptionSchema.nullable(),
  ordersLast30Days: z.number().int().nonnegative(),
});

export const billingEventSchema = z.object({
  type: z.enum(BILLING_EVENT_TYPE),
  amountCents: z.number().int().nullable(),
  status: z.string().nullable(),
  message: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export const platformTenantDetailSchema = platformTenantSchema.extend({
  activeLocations: z.number().int().nonnegative(),
  billingEvents: z.array(billingEventSchema),
});

/** Body opcional: sin body (Express 5 deja `req.body` undefined) vale como `{}`. */
export const suspendTenantSchema = z
  .object({ reason: z.string().trim().max(500).optional() })
  .default({});

export const changePlanSchema = z.object({
  planCode: z.enum(PLAN_CODE),
  /** Sin intervalo se conserva el actual. */
  interval: z.enum(BILLING_INTERVAL).optional(),
});

export const extendTrialSchema = z.object({ days: z.number().int().min(1).max(90) });

export type PlanFeatures = z.infer<typeof planFeaturesSchema>;
export type Plan = z.infer<typeof planSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type SignupResponse = z.infer<typeof signupResponseSchema>;
export type SlugAvailability = z.infer<typeof slugAvailabilitySchema>;
export type PlatformAdmin = z.infer<typeof platformAdminSchema>;
export type PlatformAuthResponse = z.infer<typeof platformAuthResponseSchema>;
export type PlatformSubscription = z.infer<typeof platformSubscriptionSchema>;
export type PlatformTenant = z.infer<typeof platformTenantSchema>;
export type PlatformTenantDetail = z.infer<typeof platformTenantDetailSchema>;
export type BillingEvent = z.infer<typeof billingEventSchema>;
export type SuspendTenantInput = z.infer<typeof suspendTenantSchema>;
export type ChangePlanInput = z.infer<typeof changePlanSchema>;
export type ExtendTrialInput = z.infer<typeof extendTrialSchema>;
