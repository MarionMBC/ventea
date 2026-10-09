import { z } from 'zod';

import { PLAN_CODE } from '../domain/enums.js';

/**
 * Cuerpo de error de la API: `{statusCode, message, error}` y, en algunos casos, un `code`
 * estable que los clientes traducen en vez de mostrar `message` (que está en español).
 */

/** Recurso que topa un límite del plan contratado. */
export const PLAN_LIMIT_RESOURCE = ['locations', 'branded_app', 'staff', 'reports'] as const;
export type PlanLimitResource = (typeof PLAN_LIMIT_RESOURCE)[number];

/**
 * Detalle de un `code: 'plan_limit'`: qué recurso, con qué plan (código para traducir y nombre
 * visible; `null` si la marca no tiene plan) y el tope (`null` = el plan no lo incluye en
 * absoluto, p. ej. app propia).
 */
export const planLimitSchema = z.object({
  resource: z.enum(PLAN_LIMIT_RESOURCE),
  plan: z.enum(PLAN_CODE).nullable(),
  planName: z.string().nullable(),
  max: z.number().int().nonnegative().nullable(),
});

export const API_ERROR_CODE = ['plan_limit'] as const;
export type ApiErrorCode = (typeof API_ERROR_CODE)[number];

export const apiErrorBodySchema = z.object({
  statusCode: z.number().int(),
  message: z.union([z.string(), z.array(z.string())]),
  error: z.string(),
  code: z.enum(API_ERROR_CODE).optional(),
  limit: planLimitSchema.optional(),
});

export type PlanLimit = z.infer<typeof planLimitSchema>;
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
