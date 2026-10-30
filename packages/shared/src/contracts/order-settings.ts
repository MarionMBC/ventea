import { z } from 'zod';

/** Tope del tiempo de gracia: un día. */
export const MAX_CANCEL_WINDOW_MINUTES = 1440;

/**
 * Cancelación del pedido por el cliente desde la app. `windowMinutes` cuenta desde que se
 * hizo el pedido; null = sin límite de tiempo (solo mientras el pedido siga «nuevo»).
 */
export const orderCancellationSchema = z.object({
  enabled: z.boolean(),
  windowMinutes: z.number().int().min(1).max(MAX_CANCEL_WINDOW_MINUTES).nullable(),
});

/** Ajustes de pedidos que edita el dueño en el panel (`/api/staff/order-settings`). */
export const orderSettingsSchema = orderCancellationSchema;

export type OrderCancellation = z.infer<typeof orderCancellationSchema>;
export type OrderSettings = z.infer<typeof orderSettingsSchema>;
