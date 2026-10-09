import { z } from 'zod';

import { mediaRefSchema } from './media.js';

/**
 * Gestión del menú desde el panel (TASK-016, `/api/staff/menu/*`). Escriben owner y
 * manager; cualquier staff lee. El menú público (`GET /api/menu`) sigue en catalog.ts.
 */

/** Tope de precio (10 millones en unidades mayores): evita overflow de Int32 al sumar. */
const MAX_CENTS = 1_000_000_000;
/** El mismo tope, para que los clientes lo validen con su propio mensaje. */
export const MENU_MAX_CENTS = MAX_CENTS;
const centsSchema = z.number().int().nonnegative().max(MAX_CENTS);
const nameSchema = (max: number) => z.string().trim().min(1, 'Nombre requerido').max(max);
const uuidList = (max: number) =>
  z
    .array(z.string().uuid())
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, 'ids repetidos');

/** Al menos un campo: un PATCH vacío es un error del cliente, no un no-op silencioso. */
function nonEmpty<T extends z.ZodRawShape>(shape: T) {
  return z
    .strictObject(shape)
    .partial()
    .refine((value) => Object.values(value).some((v) => v !== undefined), 'Nada que actualizar');
}

// ─── Categorías ──────────────────────────────────────────────────────────────

export const createMenuCategorySchema = z.strictObject({
  name: nameSchema(80),
  isActive: z.boolean().default(true),
});
export const updateMenuCategorySchema = nonEmpty({
  name: nameSchema(80),
  isActive: z.boolean(),
});

// ─── Ítems ───────────────────────────────────────────────────────────────────

export const MENU_TAG_MAX = 10;

const itemFields = {
  categoryId: z.string().uuid(),
  name: nameSchema(120),
  description: z.string().trim().max(500).nullable(),
  basePriceCents: centsSchema,
  compareAtPriceCents: centsSchema.nullable(),
  tags: z
    .array(z.string().trim().toLowerCase().min(1).max(30))
    .max(MENU_TAG_MAX)
    .transform((tags) => [...new Set(tags)]),
  isAvailable: z.boolean(),
  /** Media propia (URL de la subida o `/api/media/…`); `null` quita la foto. */
  imageUrl: mediaRefSchema.nullable(),
  /** Grupos de modificadores del ítem, en orden. Reemplaza la lista completa. */
  modifierGroupIds: uuidList(20),
};

export const createMenuItemSchema = z.strictObject({
  categoryId: itemFields.categoryId,
  name: itemFields.name,
  description: itemFields.description.default(null),
  basePriceCents: itemFields.basePriceCents,
  compareAtPriceCents: itemFields.compareAtPriceCents.default(null),
  tags: itemFields.tags.default([]),
  isAvailable: itemFields.isAvailable.default(true),
  imageUrl: itemFields.imageUrl.default(null),
  modifierGroupIds: itemFields.modifierGroupIds.default([]),
});
export const updateMenuItemSchema = nonEmpty(itemFields);
export const menuItemAvailabilitySchema = z.strictObject({ isAvailable: z.boolean() });

// ─── Modificadores ───────────────────────────────────────────────────────────

const optionFields = {
  name: nameSchema(80),
  /** Puede ser negativo (quitar un ingrediente descuenta). */
  priceDeltaCents: z.number().int().min(-MAX_CENTS).max(MAX_CENTS),
  isAvailable: z.boolean(),
};

export const createModifierOptionSchema = z.strictObject({
  name: optionFields.name,
  priceDeltaCents: optionFields.priceDeltaCents.default(0),
  isAvailable: optionFields.isAvailable.default(true),
});
export const updateModifierOptionSchema = nonEmpty(optionFields);

export const createModifierGroupSchema = z
  .strictObject({
    name: nameSchema(80),
    minSelect: z.number().int().nonnegative().max(50).default(0),
    maxSelect: z.number().int().positive().max(50).default(1),
    options: z.array(createModifierOptionSchema).max(50).default([]),
  })
  .refine((group) => group.minSelect <= group.maxSelect, {
    message: 'minSelect no puede superar maxSelect',
    path: ['minSelect'],
  });
export const updateModifierGroupSchema = nonEmpty({
  name: nameSchema(80),
  minSelect: z.number().int().nonnegative().max(50),
  maxSelect: z.number().int().positive().max(50),
});

// ─── Orden ───────────────────────────────────────────────────────────────────

/** `PATCH …/reorder`: nuevo `sortOrder` de cada id (los que no vienen no cambian). */
export const reorderSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({ id: z.string().uuid(), sortOrder: z.number().int().min(0).max(100_000) }),
    )
    .min(1)
    .max(500)
    .refine((items) => new Set(items.map((i) => i.id)).size === items.length, 'ids repetidos'),
});

// ─── Respuestas ──────────────────────────────────────────────────────────────

export const staffMenuOptionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  priceDeltaCents: z.number().int(),
  isAvailable: z.boolean(),
  sortOrder: z.number().int(),
});

export const staffModifierGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  minSelect: z.number().int(),
  maxSelect: z.number().int(),
  options: z.array(staffMenuOptionSchema),
  /** Ítems (no borrados) que usan el grupo: borrarlo los deja sin él. */
  itemCount: z.number().int().nonnegative(),
});

export const staffMenuItemSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  /** URL absoluta de la foto (o la heredada tal cual); `null` sin foto. */
  imageUrl: z.string().nullable(),
  basePriceCents: z.number().int(),
  compareAtPriceCents: z.number().int().nullable(),
  tags: z.array(z.string()),
  isAvailable: z.boolean(),
  sortOrder: z.number().int(),
  modifierGroupIds: z.array(z.string().uuid()),
});

export const staffMenuCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  items: z.array(staffMenuItemSchema),
});

/** `GET /api/staff/menu`: árbol completo, con inactivos y no disponibles (sin borrados). */
export const staffMenuSchema = z.object({
  currency: z.string().length(3),
  categories: z.array(staffMenuCategorySchema),
  modifierGroups: z.array(staffModifierGroupSchema),
});

export const MENU_CHANGE_ENTITY = [
  'category',
  'item',
  'modifier_group',
  'modifier_option',
] as const;
export const MENU_CHANGE_ACTION = [
  'create',
  'update',
  'delete',
  'soft_delete',
  'reorder',
  'availability',
] as const;

export const menuChangeSchema = z.object({
  id: z.string().uuid(),
  staffId: z.string(),
  entity: z.enum(MENU_CHANGE_ENTITY),
  entityId: z.string(),
  action: z.enum(MENU_CHANGE_ACTION),
  changes: z.unknown().nullable(),
  createdAt: z.coerce.date(),
});

export const menuChangesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Resultado de borrar un ítem: `soft` si tiene pedidos (sale del menú, no de la base). */
export const deleteMenuItemResultSchema = z.object({ deleted: z.enum(['hard', 'soft']) });

export type CreateMenuCategoryInput = z.infer<typeof createMenuCategorySchema>;
export type UpdateMenuCategoryInput = z.infer<typeof updateMenuCategorySchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type MenuItemAvailabilityInput = z.infer<typeof menuItemAvailabilitySchema>;
export type CreateModifierGroupInput = z.infer<typeof createModifierGroupSchema>;
export type UpdateModifierGroupInput = z.infer<typeof updateModifierGroupSchema>;
export type CreateModifierOptionInput = z.infer<typeof createModifierOptionSchema>;
export type UpdateModifierOptionInput = z.infer<typeof updateModifierOptionSchema>;
export type ReorderInput = z.infer<typeof reorderSchema>;
export type StaffMenuOption = z.infer<typeof staffMenuOptionSchema>;
export type StaffModifierGroup = z.infer<typeof staffModifierGroupSchema>;
export type StaffMenuItem = z.infer<typeof staffMenuItemSchema>;
export type StaffMenuCategory = z.infer<typeof staffMenuCategorySchema>;
export type StaffMenu = z.infer<typeof staffMenuSchema>;
export type MenuChangeEntity = (typeof MENU_CHANGE_ENTITY)[number];
export type MenuChangeAction = (typeof MENU_CHANGE_ACTION)[number];
export type MenuChange = z.infer<typeof menuChangeSchema>;
export type MenuChangesQuery = z.infer<typeof menuChangesQuerySchema>;
export type DeleteMenuItemResult = z.infer<typeof deleteMenuItemResultSchema>;
