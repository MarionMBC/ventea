import { z } from 'zod';

import { PLAN_CODE } from '../domain/enums.js';

/**
 * Sucursales desde el panel (TASK-022, `/api/staff/locations`). Lee cualquier staff; escriben
 * owner y manager. La lista pública (`GET /api/locations`, la app) sigue en tenant.ts.
 */

/** `HH:MM` de 24 horas. */
export const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Horario de un día. `closes` menor que `opens` = cierra pasada la medianoche (18:00–02:00);
 * iguales no tiene sentido (¿abierto 0 h o 24 h?) y es 400.
 */
export const openingRangeSchema = z
  .strictObject({
    day: z.number().int().min(0).max(6),
    opens: z.string().regex(TIME_OF_DAY, 'Hora HH:MM'),
    closes: z.string().regex(TIME_OF_DAY, 'Hora HH:MM'),
  })
  .refine((range) => range.opens !== range.closes, 'Abre y cierra a la misma hora');

/** Semana: como mucho dos tramos por día (almuerzo y cena), ordenada por día y hora. */
export const openingHoursInputSchema = z
  .array(openingRangeSchema)
  .max(14)
  .refine(
    (ranges) =>
      [0, 1, 2, 3, 4, 5, 6].every((day) => ranges.filter((r) => r.day === day).length <= 2),
    'Como mucho dos tramos por día',
  )
  .transform((ranges) =>
    [...ranges].sort((a, b) => a.day - b.day || a.opens.localeCompare(b.opens)),
  );

const text = (max: number) => z.string().trim().min(1, 'Requerido').max(max);

const locationFields = {
  name: text(80),
  address: text(200),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+\d][\d\s().-]{4,}$/, 'Teléfono inválido')
    .nullable(),
  openingHours: openingHoursInputSchema,
  isActive: z.boolean(),
  acceptsOrders: z.boolean(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
};

export const createLocationSchema = z.strictObject({
  name: locationFields.name,
  address: locationFields.address,
  phone: locationFields.phone.default(null),
  openingHours: locationFields.openingHours.default([]),
  isActive: z.boolean().default(true),
  acceptsOrders: z.boolean().default(true),
  latitude: locationFields.latitude.default(0),
  longitude: locationFields.longitude.default(0),
});

/** Al menos un campo: un PATCH vacío es un error del cliente. */
export const updateLocationSchema = z
  .strictObject(locationFields)
  .partial()
  .refine((value) => Object.values(value).some((v) => v !== undefined), 'Nada que actualizar');

export const staffLocationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  address: z.string(),
  phone: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  /** `[]` si el JSON guardado no tiene la forma esperada (se escribía a mano). */
  openingHours: z.array(z.object({ day: z.number(), opens: z.string(), closes: z.string() })),
  isActive: z.boolean(),
  acceptsOrders: z.boolean(),
  /** Tiene pedidos: no se puede borrar, solo desactivar. */
  hasOrders: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

/** Cupo del plan para un recurso: `max` null = ilimitado; `plan` null = marca sin plan. */
export const planUsageSchema = z.object({
  used: z.number().int().nonnegative(),
  max: z.number().int().nonnegative().nullable(),
  plan: z.enum(PLAN_CODE).nullable(),
  planName: z.string().nullable(),
});

export const staffLocationsSchema = z.object({
  locations: z.array(staffLocationSchema),
  /** Sucursales ACTIVAS contra el tope del plan. */
  usage: planUsageSchema,
});

export type OpeningRange = z.infer<typeof openingRangeSchema>;
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type StaffLocation = z.infer<typeof staffLocationSchema>;
export type PlanUsage = z.infer<typeof planUsageSchema>;
export type StaffLocations = z.infer<typeof staffLocationsSchema>;
