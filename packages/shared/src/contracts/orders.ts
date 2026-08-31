import { z } from 'zod';
import { FULFILLMENT_TYPE, ORDER_STATUS, PAYMENT_STATUS } from '../domain/enums.js';
import { moneySchema } from './catalog.js';

export const cartLineSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().positive().max(99),
  selectedOptionIds: z.array(z.string().uuid()).default([]),
  notes: z.string().max(280).optional(),
});

/**
 * Alta de pedido. El cliente NUNCA manda precios: la API recalcula el total
 * desde el catálogo del tenant. Aceptar un total del cliente es un agujero de negocio.
 */
export const createOrderSchema = z.object({
  locationId: z.string().uuid(),
  fulfillmentType: z.enum(FULFILLMENT_TYPE),
  lines: z.array(cartLineSchema).min(1),
  scheduledFor: z.coerce.date().optional(),
  redeemRewardPoints: z.number().int().nonnegative().default(0),
  customerNotes: z.string().max(500).optional(),
});

export const orderLineSchema = z.object({
  id: z.string().uuid(),
  menuItemId: z.string().uuid(),
  nameSnapshot: z.string(), // nombre al momento de la compra: el menú cambia, el pedido no
  quantity: z.number().int().positive(),
  unitPriceCents: moneySchema,
  totalCents: moneySchema,
  selectedOptions: z.array(z.object({ id: z.string().uuid(), nameSnapshot: z.string() })),
  notes: z.string().nullable(),
});

export const orderSchema = z.object({
  id: z.string().uuid(),
  code: z.string(), // código corto legible que canta el mostrador
  status: z.enum(ORDER_STATUS),
  paymentStatus: z.enum(PAYMENT_STATUS),
  fulfillmentType: z.enum(FULFILLMENT_TYPE),
  locationId: z.string().uuid(),
  lines: z.array(orderLineSchema),
  subtotalCents: moneySchema,
  discountCents: moneySchema,
  taxCents: moneySchema,
  totalCents: moneySchema,
  pointsEarned: z.number().int().nonnegative(),
  pointsRedeemed: z.number().int().nonnegative(),
  placedAt: z.coerce.date(),
  scheduledFor: z.coerce.date().nullable(),
});

export type CartLine = z.infer<typeof cartLineSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderLine = z.infer<typeof orderLineSchema>;
export type Order = z.infer<typeof orderSchema>;
