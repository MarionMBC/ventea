import { z } from 'zod';
import {
  BILLING_EVENT_TYPE,
  OPEN_PAYMENT_ATTEMPT_STATUS,
  PAYMENT_ATTEMPT_KIND,
  BILLING_INTERVAL,
  PLAN_CODE,
  SUBSCRIPTION_STATUS,
} from '../domain/enums.js';
import { tenantSlugSchema } from '../domain/tenant.js';
import { hasUnambiguousLink } from '../utils/links.js';
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

/**
 * Versiones publicadas de los términos del servicio y la política de privacidad (fecha de la
 * versión). La última es la vigente; una versión nueva se AGREGA al final, nunca se reemplaza:
 * un formulario abierto con la anterior sigue pudiendo registrarse.
 */
export const TERMS_VERSIONS = ['2026-10-08'] as const;
export const TERMS_VERSION: (typeof TERMS_VERSIONS)[number] =
  TERMS_VERSIONS[TERMS_VERSIONS.length - 1]!;

/**
 * Nombre de marca o de persona del registro (TASK-021). Llega al correo de bienvenida, que sale
 * desde la dirección de Ventea hacia un correo todavía sin verificar: se rechaza solo lo que es
 * inequívocamente un link (`://`, `www.`, `@`, `/`); un punto pegado (`Pollo.Express`,
 * `Lic.María`) es un nombre válido y el correo lo neutraliza. El largo se corta ANTES de mirar el
 * contenido (`abort`): un body de 100 KB no llega a la regla.
 */
export const NAME_LINK_MESSAGE = 'Quita la dirección web, «@» o «/» del nombre';

const personOrBrandName = z
  .string()
  .max(200, { abort: true })
  .trim()
  .min(2)
  .max(80, { abort: true })
  .refine((value) => !hasUnambiguousLink(value), NAME_LINK_MESSAGE);

export const signupSchema = z.object({
  restaurantName: personOrBrandName,
  slug: tenantSlugSchema,
  ownerName: personOrBrandName,
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
  /** Versión de términos y privacidad que el dueño aceptó (checkbox del registro). */
  acceptedTermsVersion: z.enum(TERMS_VERSIONS),
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

/** `GET /api/platform/tenant-ready?slug=`: ¿la dirección de la marca ya responde con HTTPS válido? */
export const tenantReadyQuerySchema = z.object({ slug: tenantSlugSchema });
export const tenantReadySchema = z.object({ ready: z.boolean() });

// ─── Embudo de registro (medición propia, sin cookies ni PII) ────────────────

/**
 * Eventos que cuenta la landing. Solo el tipo: el servidor guarda contadores por día y tipo,
 * nunca IP, navegador ni identificadores.
 */
export const FUNNEL_EVENT = [
  'visit',
  'cta_click',
  'signup_start',
  'signup_step_2',
  'signup_step_3',
  'signup_complete',
] as const;

/**
 * Eventos que puede mandar la landing (lista blanca del endpoint público). `signup_complete`
 * NO está: lo cuenta la API al crear la marca (`createdVia: 'signup'`), así no se infla desde
 * afuera y no depende de que el navegador alcance a mandarlo.
 */
export const PUBLIC_FUNNEL_EVENT = [
  'visit',
  'cta_click',
  'signup_start',
  'signup_step_2',
  'signup_step_3',
] as const satisfies readonly (typeof FUNNEL_EVENT)[number][];

/** Body de `POST /api/platform/analytics/event`. Estricto: un campo extra es un 400. */
export const funnelEventInputSchema = z.strictObject({ event: z.enum(PUBLIC_FUNNEL_EVENT) });

export const funnelReportQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

const funnelCountsSchema = z.record(z.enum(FUNNEL_EVENT), z.number().int().nonnegative());

/** `GET /api/platform/analytics/funnel?days=`: un día por fila (más nuevo primero), con ceros. */
export const funnelReportSchema = z.object({
  /** Zona horaria con la que se corta el día. */
  timezone: z.string(),
  days: z.array(
    z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), counts: funnelCountsSchema }),
  ),
  totals: funnelCountsSchema,
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

/** `GET /api/platform/tenants?page=&pageSize=`: la más nueva primero, hasta 100 por página. */
export const platformTenantListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const platformTenantPageSchema = z.object({
  items: z.array(platformTenantSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
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
  /** Tarjeta guardada (marca y últimos 4), o `null`. Nunca el token. */
  card: z.object({ brand: z.string().nullable(), last4: z.string().nullable() }).nullable(),
  /**
   * Cobros abiertos (`pending`, `unknown`, `needs_review`): los que bloquean cambios y se
   * cierran con `resolve-payment`. Solo para la plataforma; el dueño nunca ve orderIds.
   */
  openAttempts: z.array(
    z.object({
      orderId: z.string(),
      kind: z.enum(PAYMENT_ATTEMPT_KIND),
      status: z.enum(OPEN_PAYMENT_ATTEMPT_STATUS),
      amountCents: z.number().int(),
      createdAt: z.coerce.date(),
    }),
  ),
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
export type TermsVersion = (typeof TERMS_VERSIONS)[number];
export type TenantReady = z.infer<typeof tenantReadySchema>;
export type FunnelEvent = (typeof FUNNEL_EVENT)[number];
export type PublicFunnelEvent = (typeof PUBLIC_FUNNEL_EVENT)[number];
export type FunnelEventInput = z.infer<typeof funnelEventInputSchema>;
export type FunnelReportQuery = z.infer<typeof funnelReportQuerySchema>;
export type FunnelReport = z.infer<typeof funnelReportSchema>;
export type PlatformAdmin = z.infer<typeof platformAdminSchema>;
export type PlatformAuthResponse = z.infer<typeof platformAuthResponseSchema>;
export type PlatformSubscription = z.infer<typeof platformSubscriptionSchema>;
export type PlatformTenant = z.infer<typeof platformTenantSchema>;
export type PlatformTenantDetail = z.infer<typeof platformTenantDetailSchema>;
export type PlatformTenantListQuery = z.infer<typeof platformTenantListQuerySchema>;
export type PlatformTenantPage = z.infer<typeof platformTenantPageSchema>;
export type BillingEvent = z.infer<typeof billingEventSchema>;
export type SuspendTenantInput = z.infer<typeof suspendTenantSchema>;
export type ChangePlanInput = z.infer<typeof changePlanSchema>;
export type ExtendTrialInput = z.infer<typeof extendTrialSchema>;
