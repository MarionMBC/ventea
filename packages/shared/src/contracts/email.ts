import { z } from 'zod';

/**
 * Correos transaccionales (TASK-021). Outbox `email_messages` en la API; la plataforma ve el
 * registro (sin el cuerpo) en `GET /api/platform/emails` y reenvía un fallido con
 * `POST /api/platform/emails/:id/resend`.
 */

/**
 * Tipos de correo que la API conoce hoy. La columna `kind` es texto: una feature nueva agrega
 * el suyo acá (y su plantilla en la API) sin migración. Las lecturas lo aceptan como string
 * para que un panel viejo no rompa con un tipo nuevo.
 */
export const EMAIL_KIND = [
  'app_request',
  'welcome',
  'trial_ending',
  'past_due',
  'past_due_reminder',
] as const;
export type EmailKind = (typeof EMAIL_KIND)[number];

/**
 * - `pending`: en cola (nuevo o esperando reintento).
 * - `sending`: tomado por un despachador.
 * - `sent`: el servidor SMTP lo aceptó.
 * - `failed`: agotó los reintentos; la plataforma puede reenviarlo.
 * - `skipped`: no hay SMTP configurado; quedó registrado y no se envió.
 */
export const EMAIL_STATUS = ['pending', 'sending', 'sent', 'failed', 'skipped'] as const;
export type EmailStatus = (typeof EMAIL_STATUS)[number];

export const platformEmailsQuerySchema = z.object({
  status: z.enum(EMAIL_STATUS).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Un correo del registro. Nunca incluye el cuerpo. */
export const platformEmailSchema = z.object({
  id: z.string(),
  kind: z.string(),
  to: z.string(),
  subject: z.string(),
  status: z.enum(EMAIL_STATUS),
  attempts: z.number().int(),
  error: z.string().nullable(),
  tenant: z.object({ slug: z.string(), name: z.string() }).nullable(),
  createdAt: z.coerce.date(),
  sentAt: z.coerce.date().nullable(),
});

export const platformEmailListSchema = z.object({
  /** `smtp` envía de verdad; `none` = sin SMTP configurado (todo queda `skipped`). */
  transport: z.enum(['smtp', 'none']),
  items: z.array(platformEmailSchema),
});

export type PlatformEmailsQuery = z.infer<typeof platformEmailsQuerySchema>;
export type PlatformEmail = z.infer<typeof platformEmailSchema>;
export type PlatformEmailList = z.infer<typeof platformEmailListSchema>;
