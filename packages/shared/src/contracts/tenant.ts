import { z } from 'zod';
import { rewardProgramSchema } from './rewards.js';
import { publicRewardSchema } from './rewards-admin.js';

/** Datos públicos de la marca: con esto la app se viste de la marca correcta. */
export const publicTenantSchema = z.object({
  slug: z.string(),
  name: z.string(),
  currency: z.string().length(3),
  branding: z.object({
    primaryColor: z.string(),
    secondaryColor: z.string(),
    /** Opcional (TASK-016): null si la marca no definió acento. */
    accentColor: z.string().nullable().optional(),
    /** URL absoluta (`https://<host>/api/media/…`) o null. */
    logoUrl: z.string().nullable(),
    /** Ícono cuadrado de la app (TASK-016), URL absoluta o null. */
    iconUrl: z.string().nullable().optional(),
    appDisplayName: z.string().nullable(),
  }),
  rewardProgram: rewardProgramSchema,
  /**
   * Recompensas activas del catálogo (TASK-023), en orden. Opcional: una API anterior no lo
   * manda, y con el programa apagado viene vacío.
   */
  rewards: z.array(publicRewardSchema).optional(),
});

export const openingHoursSchema = z.array(
  z.object({
    day: z.number().int().min(0).max(6),
    opens: z.string(),
    closes: z.string(),
  }),
);

export const locationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  address: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  phone: z.string().nullable(),
  openingHours: openingHoursSchema.nullable(),
  /** Recibe pedidos (TASK-022). Opcional: una API anterior no lo manda (= sí recibe). */
  acceptsOrders: z.boolean().optional(),
});

export type PublicTenant = z.infer<typeof publicTenantSchema>;
export type OpeningHours = z.infer<typeof openingHoursSchema>;
export type Location = z.infer<typeof locationSchema>;
