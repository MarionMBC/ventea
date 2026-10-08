import type { PrismaClient } from '@prisma/client';
import { rewardProgramSchema } from '@ventea/shared';
import { z } from 'zod';

/**
 * Formato del archivo de menú que importa `scripts/import-menu.ts`
 * (ejemplo: `prisma/data/carolina-menu.json`).
 *
 * Los grupos de modificadores se declaran una vez con una `key` y los ítems los
 * referencian: el mismo grupo se reutiliza en varios productos (tabla N:M).
 */
const optionFileSchema = z.object({
  name: z.string().min(1),
  priceDeltaCents: z.number().int().default(0),
  isAvailable: z.boolean().default(true),
});

const groupFileSchema = z
  .object({
    key: z.string().min(1),
    name: z.string().min(1),
    minSelect: z.number().int().nonnegative().default(0),
    maxSelect: z.number().int().positive().default(1),
    options: z.array(optionFileSchema).min(1),
  })
  .refine((group) => group.minSelect <= group.maxSelect, {
    message: 'minSelect no puede superar maxSelect',
  });

const itemFileSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().default(null),
  basePriceCents: z.number().int().nonnegative(),
  compareAtPriceCents: z.number().int().nonnegative().nullable().default(null),
  tags: z.array(z.string().min(1)).default([]),
  isAvailable: z.boolean().default(true),
  modifierGroups: z.array(z.string().min(1)).default([]),
});

export const menuFileSchema = z
  .object({
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'currency: código ISO 4217 de 3 letras')
      .optional(),
    /** Programa de puntos del tenant, en unidades menores de `currency`. Se aplica con el menú. */
    rewardProgram: rewardProgramSchema.optional(),
    modifierGroups: z.array(groupFileSchema).default([]),
    categories: z
      .array(
        z.object({
          name: z.string().min(1),
          isActive: z.boolean().default(true),
          items: z.array(itemFileSchema).default([]),
        }),
      )
      .min(1),
  })
  .superRefine((file, ctx) => {
    const keys = new Set<string>();
    for (const group of file.modifierGroups) {
      if (keys.has(group.key)) {
        ctx.addIssue({ code: 'custom', message: `Grupo duplicado: ${group.key}` });
      }
      keys.add(group.key);
    }
    for (const category of file.categories) {
      for (const item of category.items) {
        for (const key of item.modifierGroups) {
          if (!keys.has(key)) {
            ctx.addIssue({
              code: 'custom',
              message: `"${item.name}" usa un grupo inexistente: ${key}`,
            });
          }
        }
      }
    }
  });

export type MenuFile = z.infer<typeof menuFileSchema>;

export interface MenuImportOptions {
  /**
   * Permite cambiar la moneda de un tenant que ya tiene pedidos. Sin esto se rechaza:
   * los montos históricos están en centavos de la moneda anterior y pasarían a
   * mostrarse en la nueva.
   */
  forceCurrency?: boolean;
}

/** Error de regla de operación (no de formato): el script lo reporta y sale con 1. */
export class MenuImportError extends Error {}

export interface MenuImportResult {
  currencyChanged: boolean;
  rewardProgramUpdated: boolean;
  categories: number;
  items: number;
  modifierGroups: number;
  modifierOptions: number;
}

/**
 * Reemplaza el catálogo completo de un tenant (categorías, ítems, grupos y opciones)
 * en UNA transacción: o queda el menú nuevo entero, o el viejo intacto.
 *
 * Los pedidos no se tocan: las líneas y opciones de pedido apuntan al catálogo con
 * `onDelete: SetNull` y guardan snapshot de nombre y precio.
 *
 * Si el archivo trae `currency` distinta a la del tenant y el tenant ya tiene pedidos,
 * se rechaza salvo `forceCurrency`. Si trae `rewardProgram`, se aplica en la misma
 * transacción: el programa está en unidades menores y tiene que ir con la moneda.
 *
 * Usa el cliente crudo (sin guard de tenant) como los demás scripts de operación,
 * pero filtra igual por `tenantId` en cada borrado.
 */
export async function importMenu(
  prisma: PrismaClient,
  tenantSlug: string,
  input: unknown,
  options: MenuImportOptions = {},
): Promise<MenuImportResult> {
  const menu = menuFileSchema.parse(input);

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, currency: true },
  });
  if (!tenant) throw new MenuImportError(`No existe el tenant "${tenantSlug}"`);
  const tenantId = tenant.id;
  const currencyChanged = !!menu.currency && menu.currency !== tenant.currency;

  return prisma.$transaction(
    async (tx) => {
      // Orden por las FK: la categoría es Restrict desde el ítem; el resto cascadea.
      await tx.menuItem.deleteMany({ where: { tenantId } });
      await tx.menuCategory.deleteMany({ where: { tenantId } });
      await tx.modifierOption.deleteMany({ where: { tenantId } });
      await tx.modifierGroup.deleteMany({ where: { tenantId } });

      if (currencyChanged && !options.forceCurrency) {
        // Dentro de la tx: un pedido creado entre la lectura y el cambio también cuenta.
        const orders = await tx.order.count({ where: { tenantId } });
        if (orders > 0) {
          throw new MenuImportError(
            `"${tenantSlug}" tiene ${orders} pedidos en ${tenant.currency}: cambiar a ` +
              `${menu.currency} reinterpreta sus montos. Usar --force-currency si es intencional.`,
          );
        }
      }
      if (currencyChanged) {
        await tx.tenant.update({ where: { id: tenantId }, data: { currency: menu.currency } });
      }

      if (menu.rewardProgram) {
        await tx.rewardProgram.upsert({
          where: { tenantId },
          update: menu.rewardProgram,
          create: { tenantId, ...menu.rewardProgram },
        });
      }

      const groupIds = new Map<string, string>();
      let optionCount = 0;
      for (const group of menu.modifierGroups) {
        const created = await tx.modifierGroup.create({
          data: {
            tenantId,
            name: group.name,
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            options: {
              create: group.options.map((option, index) => ({
                tenantId,
                name: option.name,
                priceDeltaCents: option.priceDeltaCents,
                isAvailable: option.isAvailable,
                sortOrder: index,
              })),
            },
          },
          select: { id: true },
        });
        groupIds.set(group.key, created.id);
        optionCount += group.options.length;
      }

      let itemCount = 0;
      for (const [categoryIndex, category] of menu.categories.entries()) {
        const created = await tx.menuCategory.create({
          data: {
            tenantId,
            name: category.name,
            sortOrder: categoryIndex,
            isActive: category.isActive,
          },
          select: { id: true },
        });

        for (const [itemIndex, item] of category.items.entries()) {
          await tx.menuItem.create({
            data: {
              tenantId,
              categoryId: created.id,
              name: item.name,
              description: item.description,
              basePriceCents: item.basePriceCents,
              compareAtPriceCents: item.compareAtPriceCents,
              tags: item.tags,
              isAvailable: item.isAvailable,
              sortOrder: itemIndex,
              modifierGroups: {
                create: item.modifierGroups.map((key, groupIndex) => ({
                  groupId: groupIds.get(key)!,
                  sortOrder: groupIndex,
                })),
              },
            },
          });
          itemCount += 1;
        }
      }

      return {
        currencyChanged,
        rewardProgramUpdated: !!menu.rewardProgram,
        categories: menu.categories.length,
        items: itemCount,
        modifierGroups: menu.modifierGroups.length,
        modifierOptions: optionCount,
      };
    },
    { timeout: 60_000 },
  );
}
