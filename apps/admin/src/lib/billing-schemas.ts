import {
  billingEventSchema,
  billingOverviewSchema,
  ownerBillingEventSchema,
  platformTenantDetailSchema,
} from '@ventea/shared';
import { z } from 'zod';

/**
 * Schemas de LECTURA del panel, más tolerantes que el contrato: un tipo de evento que el
 * panel todavía no conoce (API desplegada antes que el web) no rompe la pantalla; se
 * muestra como «Evento: <tipo>». Lo mismo con `card` y `openAttempts` si la API es anterior.
 */
export const panelBillingEventSchema = billingEventSchema.extend({ type: z.string() });

export const panelTenantDetailSchema = platformTenantDetailSchema.extend({
  card: platformTenantDetailSchema.shape.card.optional().default(null),
  billingEvents: z.array(panelBillingEventSchema),
  openAttempts: platformTenantDetailSchema.shape.openAttempts.optional().default([]),
});

/** Evento del dueño: la descripción la escribe el servidor; un tipo nuevo no rompe. */
export const panelOwnerBillingEventSchema = ownerBillingEventSchema.extend({ type: z.string() });

export const panelBillingOverviewSchema = billingOverviewSchema.extend({
  events: z.array(panelOwnerBillingEventSchema),
});

export type PanelBillingEvent = z.infer<typeof panelBillingEventSchema>;
export type PanelTenantDetail = z.infer<typeof panelTenantDetailSchema>;
export type PanelOpenAttempt = PanelTenantDetail['openAttempts'][number];
export type PanelBillingOverview = z.infer<typeof panelBillingOverviewSchema>;
