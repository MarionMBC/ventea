import {
  billingEventSchema,
  billingOverviewSchema,
  platformTenantDetailSchema,
} from '@ventea/shared';
import { z } from 'zod';

/**
 * Schemas de LECTURA del panel, más tolerantes que el contrato: un tipo de evento que el
 * panel todavía no conoce (API desplegada antes que el web) no rompe la pantalla; se
 * muestra como «Evento: <tipo>». Lo mismo con `card` si la API es anterior a TASK-005.
 */
export const panelBillingEventSchema = billingEventSchema.extend({ type: z.string() });

export const panelTenantDetailSchema = platformTenantDetailSchema.extend({
  card: platformTenantDetailSchema.shape.card.optional().default(null),
  billingEvents: z.array(panelBillingEventSchema),
});

export const panelBillingOverviewSchema = billingOverviewSchema.extend({
  events: z.array(panelBillingEventSchema),
});

export type PanelBillingEvent = z.infer<typeof panelBillingEventSchema>;
export type PanelTenantDetail = z.infer<typeof panelTenantDetailSchema>;
export type PanelBillingOverview = z.infer<typeof panelBillingOverviewSchema>;
