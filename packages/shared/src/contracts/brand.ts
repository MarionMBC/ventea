import { z } from 'zod';

import { PLAN_CODE } from '../domain/enums.js';
import { emailSchema } from './auth.js';
import { mediaRefSchema } from './media.js';

/**
 * Mi marca y la app nativa de la marca (TASK-016).
 * - Dueño: `GET/PATCH /api/staff/brand`, `POST /api/staff/brand/app-request`.
 * - Plataforma: `/api/platform/app-requests`, `/api/platform/tenants/:slug/app[...]`.
 */

export const APP_PUBLISHER = ['ventea', 'client'] as const;
export type AppPublisher = (typeof APP_PUBLISHER)[number];

export const APP_STATUS = [
  'not_requested',
  'requested',
  'building',
  'in_review',
  'published',
] as const;
export type AppStatus = (typeof APP_STATUS)[number];

/** Idioma de los textos que genera la API para la marca (notificaciones push). */
export const BRAND_LANGUAGE = ['es', 'en'] as const;
export type BrandLanguage = (typeof BRAND_LANGUAGE)[number];

export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color hex de 6 dígitos (#rrggbb)')
  .transform((value) => value.toLowerCase());

/** URL pública https (sitio, tienda). Sin `javascript:` ni `http:` en producción. */
export const httpsUrlSchema = z
  .string()
  .trim()
  .max(300)
  .url()
  .refine((value) => value.startsWith('https://'), 'Debe empezar con https://');

/**
 * Identificador de la app en las tiendas: segmentos separados por punto, cada uno empieza con
 * letra (regla de Android, que es la más estricta). Ej. `app.ventea.carolinahotchicken`.
 */
export const bundleIdSchema = z
  .string()
  .trim()
  .max(155)
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/,
    'bundleId: segmentos con letra inicial separados por punto (app.ventea.marca)',
  );

// ─── Dueño: Mi marca ─────────────────────────────────────────────────────────

/** `PATCH /api/staff/brand`. Estricto: el dueño no puede tocar bundleId ni estado de la app. */
export const updateBrandSchema = z
  .strictObject({
    /** Nombre bajo el ícono y en la tienda (Apple corta en 30). */
    appDisplayName: z.string().trim().min(1).max(30),
    primaryColor: hexColorSchema,
    secondaryColor: hexColorSchema,
    accentColor: hexColorSchema.nullable(),
    logoUrl: mediaRefSchema.nullable(),
    iconUrl: mediaRefSchema.nullable(),
    storeShortDescription: z.string().trim().min(1).max(80).nullable(),
    supportEmail: emailSchema.nullable(),
    websiteUrl: httpsUrlSchema.nullable(),
    language: z.enum(BRAND_LANGUAGE),
  })
  .partial()
  .refine((value) => Object.values(value).some((v) => v !== undefined), 'Nada que actualizar');

/**
 * Advertencia de contraste (no bloquea): el texto blanco sobre el color no llega a AA (4.5:1).
 * Entre blanco y negro siempre uno llega (el mejor de los dos nunca baja de 4.58:1), así que
 * la advertencia dice cuál usar: los botones de la marca llevan texto blanco por defecto.
 */
export const brandWarningSchema = z.object({
  field: z.enum(['primaryColor', 'secondaryColor', 'accentColor']),
  message: z.string(),
  whiteRatio: z.number(),
  blackRatio: z.number(),
  recommendedTextColor: z.enum(['white', 'black']),
});

export const storeUrlsSchema = z.object({
  android: z.string().nullable(),
  ios: z.string().nullable(),
});

/** Estado de la app nativa como lo ve el dueño (solo lectura). */
export const ownerAppStatusSchema = z.object({
  status: z.enum(APP_STATUS),
  publisher: z.enum(APP_PUBLISHER).nullable(),
  bundleId: z.string().nullable(),
  version: z.string().nullable(),
  storeUrls: storeUrlsSchema,
  requestedAt: z.coerce.date().nullable(),
  /** El plan incluye app propia (Pro/Cadena). */
  brandedAppAvailable: z.boolean(),
});

export const brandSchema = z.object({
  appDisplayName: z.string(),
  primaryColor: z.string(),
  secondaryColor: z.string(),
  accentColor: z.string().nullable(),
  logoUrl: z.string().nullable(),
  iconUrl: z.string().nullable(),
  storeShortDescription: z.string().nullable(),
  supportEmail: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  language: z.enum(BRAND_LANGUAGE),
  warnings: z.array(brandWarningSchema),
  app: ownerAppStatusSchema,
});

// ─── Plataforma ──────────────────────────────────────────────────────────────

export const pushStatusSchema = z.object({
  configured: z.boolean(),
  projectId: z.string().nullable(),
  updatedAt: z.coerce.date().nullable(),
});

export const appConfigEventSchema = z.object({
  type: z.string(),
  actor: z.string(),
  message: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export const platformAppSchema = z.object({
  tenant: z.object({
    slug: z.string(),
    name: z.string(),
    planCode: z.enum(PLAN_CODE).nullable(),
  }),
  /** `false` si la marca todavía no tiene fila (valores por defecto, sin solicitud). */
  exists: z.boolean(),
  bundleId: z.string(),
  publisher: z.enum(APP_PUBLISHER),
  status: z.enum(APP_STATUS),
  version: z.string().nullable(),
  buildNumber: z.number().int().nullable(),
  storeUrls: storeUrlsSchema,
  requestedAt: z.coerce.date().nullable(),
  push: pushStatusSchema,
  events: z.array(appConfigEventSchema),
});

export const updatePlatformAppSchema = z
  .strictObject({
    bundleId: bundleIdSchema,
    publisher: z.enum(APP_PUBLISHER),
    status: z.enum(APP_STATUS),
    version: z
      .string()
      .trim()
      .regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/, 'version: X.Y.Z')
      .nullable(),
    buildNumber: z.number().int().positive().max(2_100_000_000).nullable(),
    storeUrls: z
      .strictObject({ android: httpsUrlSchema.nullable(), ios: httpsUrlSchema.nullable() })
      .partial(),
  })
  .partial()
  .refine((value) => Object.values(value).some((v) => v !== undefined), 'Nada que actualizar');

export const appRequestQueueItemSchema = z.object({
  slug: z.string(),
  name: z.string(),
  planCode: z.enum(PLAN_CODE).nullable(),
  status: z.enum(APP_STATUS),
  publisher: z.enum(APP_PUBLISHER),
  bundleId: z.string(),
  requestedAt: z.coerce.date().nullable(),
  updatedAt: z.coerce.date(),
});

/** `GET /api/platform/app-requests?status=…`: sin status, todo lo que no está publicado. */
export const appRequestsQuerySchema = z.object({
  status: z.enum(APP_STATUS).optional(),
});

/**
 * `GET /api/platform/tenants/:slug/app/build-config`: lo que necesita el generador de la app
 * (TASK-019). Las URLs de medios son absolutas. Nunca incluye credenciales.
 */
export const buildConfigSchema = z.object({
  tenant: z.object({ slug: z.string(), name: z.string(), currency: z.string().length(3) }),
  /** Base de la API que la app debe usar (manda `X-Tenant-Slug`). */
  apiBaseUrl: z.string().url(),
  branding: z.object({
    appDisplayName: z.string(),
    primaryColor: z.string(),
    secondaryColor: z.string(),
    accentColor: z.string().nullable(),
    logoUrl: z.string().nullable(),
    iconUrl: z.string().nullable(),
    storeShortDescription: z.string().nullable(),
    supportEmail: z.string().nullable(),
    websiteUrl: z.string().nullable(),
    language: z.enum(BRAND_LANGUAGE),
  }),
  app: z.object({
    bundleId: z.string(),
    publisher: z.enum(APP_PUBLISHER),
    status: z.enum(APP_STATUS),
    version: z.string().nullable(),
    buildNumber: z.number().int().nullable(),
    storeUrls: storeUrlsSchema,
  }),
  push: z.object({ configured: z.boolean(), projectId: z.string().nullable() }),
});

/**
 * `PUT /api/platform/tenants/:slug/push-credentials`: el JSON de la service account de
 * Firebase tal cual se descarga. Se guardan solo `project_id`, `client_email` y `private_key`,
 * cifrados. La respuesta nunca los devuelve.
 */
export const pushCredentialsInputSchema = z.object({
  type: z.literal('service_account'),
  project_id: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]{4,62}$/, 'project_id inválido'),
  client_email: z.string().trim().email().max(254),
  private_key: z
    .string()
    .max(8192)
    .refine((key) => key.includes('PRIVATE KEY-----'), 'private_key: PEM de clave privada'),
});

export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
export type BrandWarning = z.infer<typeof brandWarningSchema>;
export type OwnerAppStatus = z.infer<typeof ownerAppStatusSchema>;
export type Brand = z.infer<typeof brandSchema>;
export type PushStatus = z.infer<typeof pushStatusSchema>;
export type PlatformApp = z.infer<typeof platformAppSchema>;
export type UpdatePlatformAppInput = z.infer<typeof updatePlatformAppSchema>;
export type AppRequestQueueItem = z.infer<typeof appRequestQueueItemSchema>;
export type AppRequestsQuery = z.infer<typeof appRequestsQuerySchema>;
export type BuildConfig = z.infer<typeof buildConfigSchema>;
export type PushCredentialsInput = z.infer<typeof pushCredentialsInputSchema>;
