import { z } from 'zod';

/**
 * Dispositivos del cliente final para notificaciones push (TASK-016).
 * `POST /api/devices` (sesión de cliente) registra o renueva el token; `DELETE
 * /api/devices/:id` lo da de baja al cerrar sesión.
 */

export const DEVICE_PLATFORM = ['ios', 'android', 'web'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORM)[number];

export const registerDeviceSchema = z.strictObject({
  platform: z.enum(DEVICE_PLATFORM),
  /** Token de FCM (o APNs vía FCM). Opaco; se guarda tal cual. */
  pushToken: z.string().trim().min(1).max(4096),
});

export const deviceSchema = z.object({
  id: z.string().uuid(),
  platform: z.enum(DEVICE_PLATFORM),
  createdAt: z.coerce.date(),
});

/**
 * Datos de la notificación de cambio de estado del pedido. La app abre `/orders/:orderId`
 * al tocarla. Todos los valores de `data` son strings (regla de FCM).
 */
export const ORDER_PUSH_STATUSES = ['preparing', 'ready', 'completed', 'cancelled'] as const;
export type OrderPushStatus = (typeof ORDER_PUSH_STATUSES)[number];

export const orderPushDataSchema = z.object({
  type: z.literal('order_status'),
  orderId: z.string().uuid(),
  status: z.enum(ORDER_PUSH_STATUSES),
  code: z.string(),
});

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export type Device = z.infer<typeof deviceSchema>;
export type OrderPushData = z.infer<typeof orderPushDataSchema>;
