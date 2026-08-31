import { z } from 'zod';

/**
 * Contratos del catálogo (menú público). Los mismos schemas validan en la API
 * (entrada) y tipan las apps cliente (salida): una sola fuente de verdad.
 */

export const moneySchema = z.number().int().nonnegative();

export const modifierOptionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  priceDeltaCents: z.number().int(), // puede ser negativo (quitar ingrediente con descuento)
  isAvailable: z.boolean(),
});

export const modifierGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  minSelect: z.number().int().nonnegative(),
  maxSelect: z.number().int().positive(),
  options: z.array(modifierOptionSchema),
});

export const menuItemSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
  basePriceCents: moneySchema,
  isAvailable: z.boolean(),
  sortOrder: z.number().int(),
  modifierGroups: z.array(modifierGroupSchema),
});

export const menuCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  sortOrder: z.number().int(),
  items: z.array(menuItemSchema),
});

/** Menú publicado de una sucursal. Endpoint público: no exige sesión, sí tenant. */
export const publicMenuSchema = z.object({
  locationId: z.string().uuid(),
  currency: z.string().length(3),
  categories: z.array(menuCategorySchema),
});

export type ModifierOption = z.infer<typeof modifierOptionSchema>;
export type ModifierGroup = z.infer<typeof modifierGroupSchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;
export type MenuCategory = z.infer<typeof menuCategorySchema>;
export type PublicMenu = z.infer<typeof publicMenuSchema>;
