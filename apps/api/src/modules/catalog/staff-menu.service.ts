import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreateMenuCategoryInput,
  CreateMenuItemInput,
  CreateModifierGroupInput,
  CreateModifierOptionInput,
  DeleteMenuItemResult,
  MenuChange,
  MenuChangeAction,
  MenuChangeEntity,
  ReorderInput,
  StaffMenu,
  UpdateMenuCategoryInput,
  UpdateMenuItemInput,
  UpdateModifierGroupInput,
  UpdateModifierOptionInput,
} from '@ventea/shared';

import { MediaService } from '@/modules/media/media.service';
import { absoluteMediaUrl } from '@/modules/media/media-url';
import type { PrismaClientExtended, PrismaDb } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

/** Quién hace el cambio: va a la auditoría (`MenuChange`). */
export interface MenuActor {
  tenantId: string;
  staffId: string;
}

const NOT_DELETED = { deletedAt: null } as const;

/**
 * Edición del menú desde el panel (TASK-016). Cada escritura va en una transacción junto con
 * su fila de auditoría: no hay cambio sin registro ni registro sin cambio.
 *
 * Aislamiento: cada consulta lleva `tenantId` (guard de Prisma) y toda referencia que llega en
 * el body (categoría, grupos, imagen) se verifica contra la marca antes de escribir. La tabla
 * puente `MenuItemModifierGroup` no tiene tenantId: se toca solo con ids ya verificados.
 *
 * Borrado: un ítem con pedidos se marca `deletedAt` (los pedidos guardan snapshot y no se
 * rompen, pero así el ítem sigue enlazado a su historia); sin pedidos se borra de verdad.
 */
@Injectable()
export class StaffMenuService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    private readonly media: MediaService,
  ) {}

  // ─── Lectura ────────────────────────────────────────────────────────────────

  async tree(tenantId: string, base: string): Promise<StaffMenu> {
    const [tenant, categories, groups] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } }),
      this.prisma.menuCategory.findMany({
        where: { tenantId, ...NOT_DELETED },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          items: {
            where: { tenantId, ...NOT_DELETED },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            include: {
              modifierGroups: { orderBy: { sortOrder: 'asc' }, select: { groupId: true } },
            },
          },
        },
      }),
      this.prisma.modifierGroup.findMany({
        where: { tenantId },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        include: {
          options: { where: { tenantId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
        },
      }),
    ]);
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    const usage = new Map<string, number>();
    for (const category of categories) {
      for (const item of category.items) {
        for (const { groupId } of item.modifierGroups) {
          usage.set(groupId, (usage.get(groupId) ?? 0) + 1);
        }
      }
    }

    return {
      currency: tenant.currency,
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
        items: category.items.map((item) => ({
          id: item.id,
          categoryId: item.categoryId,
          name: item.name,
          description: item.description,
          imageUrl: absoluteMediaUrl(item.imageUrl, base),
          basePriceCents: item.basePriceCents,
          compareAtPriceCents: item.compareAtPriceCents,
          tags: item.tags,
          isAvailable: item.isAvailable,
          sortOrder: item.sortOrder,
          modifierGroupIds: item.modifierGroups.map(({ groupId }) => groupId),
        })),
      })),
      modifierGroups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        itemCount: usage.get(group.id) ?? 0,
        options: group.options.map((option) => ({
          id: option.id,
          name: option.name,
          priceDeltaCents: option.priceDeltaCents,
          isAvailable: option.isAvailable,
          sortOrder: option.sortOrder,
        })),
      })),
    };
  }

  async changes(tenantId: string, limit: number): Promise<MenuChange[]> {
    const rows = await this.prisma.menuChange.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      staffId: row.staffId,
      entity: row.entity as MenuChangeEntity,
      entityId: row.entityId,
      action: row.action as MenuChangeAction,
      changes: row.changes ?? null,
      createdAt: row.createdAt,
    }));
  }

  // ─── Categorías ─────────────────────────────────────────────────────────────

  createCategory(actor: MenuActor, input: CreateMenuCategoryInput): Promise<{ id: string }> {
    const { tenantId } = actor;
    return this.prisma.$transaction(async (tx) => {
      const max = await tx.menuCategory.aggregate({
        where: { tenantId, ...NOT_DELETED },
        _max: { sortOrder: true },
      });
      const created = await tx.menuCategory.create({
        data: { tenantId, ...input, sortOrder: (max._max.sortOrder ?? -1) + 1 },
        select: { id: true },
      });
      await this.audit(tx, actor, 'category', created.id, 'create', input);
      return created;
    });
  }

  async updateCategory(
    actor: MenuActor,
    id: string,
    input: UpdateMenuCategoryInput,
  ): Promise<void> {
    const { tenantId } = actor;
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.menuCategory.updateMany({
        where: { tenantId, id, ...NOT_DELETED },
        data: input,
      });
      if (count === 0) throw new NotFoundException('Categoría no encontrada');
      await this.audit(tx, actor, 'category', id, 'update', input);
    });
  }

  /**
   * `409` si la categoría tiene productos. Si solo conserva productos borrados con pedidos (la
   * FK desde el ítem es Restrict), se marca borrada; si no, se borra de verdad.
   */
  async deleteCategory(actor: MenuActor, id: string): Promise<void> {
    const { tenantId } = actor;
    await this.prisma.$transaction(async (tx) => {
      const category = await tx.menuCategory.findFirst({
        where: { tenantId, id, ...NOT_DELETED },
        select: { id: true, name: true },
      });
      if (!category) throw new NotFoundException('Categoría no encontrada');

      const [live, archived] = await Promise.all([
        tx.menuItem.count({ where: { tenantId, categoryId: id, ...NOT_DELETED } }),
        tx.menuItem.count({ where: { tenantId, categoryId: id, deletedAt: { not: null } } }),
      ]);
      if (live > 0) {
        throw new ConflictException(
          `La categoría tiene ${live} producto${live === 1 ? '' : 's'}: muévelos o bórralos primero`,
        );
      }
      if (archived > 0) {
        await tx.menuCategory.updateMany({
          where: { tenantId, id },
          data: { deletedAt: new Date(), isActive: false },
        });
        await this.audit(tx, actor, 'category', id, 'soft_delete', { name: category.name });
      } else {
        await tx.menuCategory.deleteMany({ where: { tenantId, id } });
        await this.audit(tx, actor, 'category', id, 'delete', { name: category.name });
      }
    });
  }

  async reorderCategories(actor: MenuActor, input: ReorderInput): Promise<void> {
    const { tenantId } = actor;
    const ids = input.items.map((item) => item.id);
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.menuCategory.count({
        where: { tenantId, id: { in: ids }, ...NOT_DELETED },
      });
      if (found !== ids.length) throw new BadRequestException('Alguna categoría no existe');
      for (const { id, sortOrder } of input.items) {
        await tx.menuCategory.updateMany({ where: { tenantId, id }, data: { sortOrder } });
      }
      await this.audit(tx, actor, 'category', '*', 'reorder', input.items);
    });
  }

  // ─── Ítems ──────────────────────────────────────────────────────────────────

  createItem(actor: MenuActor, input: CreateMenuItemInput): Promise<{ id: string }> {
    const { tenantId } = actor;
    assertCompareAt(input.basePriceCents, input.compareAtPriceCents);
    return this.prisma.$transaction(async (tx) => {
      await this.assertCategory(tx, tenantId, input.categoryId);
      await this.assertGroups(tx, tenantId, input.modifierGroupIds);
      const imageUrl = input.imageUrl
        ? await this.media.resolveOwnedRef(tenantId, input.imageUrl, 'imageUrl', tx)
        : null;
      const max = await tx.menuItem.aggregate({
        where: { tenantId, categoryId: input.categoryId, ...NOT_DELETED },
        _max: { sortOrder: true },
      });

      const created = await tx.menuItem.create({
        data: {
          tenantId,
          categoryId: input.categoryId,
          name: input.name,
          description: input.description,
          basePriceCents: input.basePriceCents,
          compareAtPriceCents: input.compareAtPriceCents,
          tags: input.tags,
          isAvailable: input.isAvailable,
          imageUrl,
          sortOrder: (max._max.sortOrder ?? -1) + 1,
          modifierGroups: {
            create: input.modifierGroupIds.map((groupId, sortOrder) => ({ groupId, sortOrder })),
          },
        },
        select: { id: true },
      });
      await this.audit(tx, actor, 'item', created.id, 'create', { ...input, imageUrl });
      return created;
    });
  }

  async updateItem(actor: MenuActor, id: string, input: UpdateMenuItemInput): Promise<void> {
    const { tenantId } = actor;
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.menuItem.findFirst({
        where: { tenantId, id, ...NOT_DELETED },
        select: { basePriceCents: true, compareAtPriceCents: true },
      });
      if (!current) throw new NotFoundException('Producto no encontrado');
      assertCompareAt(
        input.basePriceCents ?? current.basePriceCents,
        input.compareAtPriceCents === undefined
          ? current.compareAtPriceCents
          : input.compareAtPriceCents,
      );

      const { modifierGroupIds, imageUrl: imageRef, ...fields } = input;
      if (fields.categoryId) await this.assertCategory(tx, tenantId, fields.categoryId);
      const data: Prisma.MenuItemUncheckedUpdateManyInput = { ...fields };
      if (imageRef !== undefined) {
        data.imageUrl = imageRef
          ? await this.media.resolveOwnedRef(tenantId, imageRef, 'imageUrl', tx)
          : null;
      }
      await tx.menuItem.updateMany({ where: { tenantId, id }, data });

      if (modifierGroupIds) {
        await this.assertGroups(tx, tenantId, modifierGroupIds);
        // `id` ya se verificó de esta marca (findFirst con tenantId).
        await tx.menuItemModifierGroup.deleteMany({ where: { menuItemId: id } });
        await tx.menuItemModifierGroup.createMany({
          data: modifierGroupIds.map((groupId, sortOrder) => ({
            menuItemId: id,
            groupId,
            sortOrder,
          })),
        });
      }
      await this.audit(tx, actor, 'item', id, 'update', { ...input, imageUrl: data.imageUrl });
    });
  }

  async setAvailability(actor: MenuActor, id: string, isAvailable: boolean): Promise<void> {
    const { tenantId } = actor;
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.menuItem.updateMany({
        where: { tenantId, id, ...NOT_DELETED },
        data: { isAvailable },
      });
      if (count === 0) throw new NotFoundException('Producto no encontrado');
      await this.audit(tx, actor, 'item', id, 'availability', { isAvailable });
    });
  }

  async deleteItem(actor: MenuActor, id: string): Promise<DeleteMenuItemResult> {
    const { tenantId } = actor;
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.menuItem.findFirst({
        where: { tenantId, id, ...NOT_DELETED },
        select: { name: true },
      });
      if (!item) throw new NotFoundException('Producto no encontrado');

      const orders = await tx.orderLine.count({ where: { tenantId, menuItemId: id } });
      if (orders > 0) {
        await tx.menuItem.updateMany({ where: { tenantId, id }, data: { deletedAt: new Date() } });
        await this.audit(tx, actor, 'item', id, 'soft_delete', { name: item.name });
        return { deleted: 'soft' as const };
      }
      await tx.menuItem.deleteMany({ where: { tenantId, id } });
      await this.audit(tx, actor, 'item', id, 'delete', { name: item.name });
      return { deleted: 'hard' as const };
    });
  }

  async reorderItems(actor: MenuActor, input: ReorderInput): Promise<void> {
    const { tenantId } = actor;
    const ids = input.items.map((item) => item.id);
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.menuItem.count({
        where: { tenantId, id: { in: ids }, ...NOT_DELETED },
      });
      if (found !== ids.length) throw new BadRequestException('Algún producto no existe');
      for (const { id, sortOrder } of input.items) {
        await tx.menuItem.updateMany({ where: { tenantId, id }, data: { sortOrder } });
      }
      await this.audit(tx, actor, 'item', '*', 'reorder', input.items);
    });
  }

  // ─── Grupos de modificadores ────────────────────────────────────────────────

  createGroup(actor: MenuActor, input: CreateModifierGroupInput): Promise<{ id: string }> {
    const { tenantId } = actor;
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.modifierGroup.create({
        data: {
          tenantId,
          name: input.name,
          minSelect: input.minSelect,
          maxSelect: input.maxSelect,
          options: {
            create: input.options.map((option, sortOrder) => ({ tenantId, ...option, sortOrder })),
          },
        },
        select: { id: true },
      });
      await this.audit(tx, actor, 'modifier_group', created.id, 'create', input);
      return created;
    });
  }

  async updateGroup(actor: MenuActor, id: string, input: UpdateModifierGroupInput): Promise<void> {
    const { tenantId } = actor;
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.modifierGroup.findFirst({
        where: { tenantId, id },
        select: { minSelect: true, maxSelect: true },
      });
      if (!current) throw new NotFoundException('Grupo no encontrado');
      if ((input.minSelect ?? current.minSelect) > (input.maxSelect ?? current.maxSelect)) {
        throw new BadRequestException('minSelect no puede superar maxSelect');
      }
      await tx.modifierGroup.updateMany({ where: { tenantId, id }, data: input });
      await this.audit(tx, actor, 'modifier_group', id, 'update', input);
    });
  }

  /** Borra el grupo, sus opciones y su uso en los ítems. Los pedidos guardan snapshot. */
  async deleteGroup(actor: MenuActor, id: string): Promise<void> {
    const { tenantId } = actor;
    await this.prisma.$transaction(async (tx) => {
      const group = await tx.modifierGroup.findFirst({
        where: { tenantId, id },
        select: { name: true },
      });
      if (!group) throw new NotFoundException('Grupo no encontrado');
      await tx.modifierGroup.deleteMany({ where: { tenantId, id } });
      await this.audit(tx, actor, 'modifier_group', id, 'delete', { name: group.name });
    });
  }

  createOption(
    actor: MenuActor,
    groupId: string,
    input: CreateModifierOptionInput,
  ): Promise<{ id: string }> {
    const { tenantId } = actor;
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.modifierGroup.findFirst({
        where: { tenantId, id: groupId },
        select: { id: true },
      });
      if (!group) throw new NotFoundException('Grupo no encontrado');
      const max = await tx.modifierOption.aggregate({
        where: { tenantId, groupId },
        _max: { sortOrder: true },
      });
      const created = await tx.modifierOption.create({
        data: { tenantId, groupId, ...input, sortOrder: (max._max.sortOrder ?? -1) + 1 },
        select: { id: true },
      });
      await this.audit(tx, actor, 'modifier_option', created.id, 'create', { groupId, ...input });
      return created;
    });
  }

  async updateOption(
    actor: MenuActor,
    id: string,
    input: UpdateModifierOptionInput,
  ): Promise<void> {
    const { tenantId } = actor;
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.modifierOption.updateMany({
        where: { tenantId, id },
        data: input,
      });
      if (count === 0) throw new NotFoundException('Opción no encontrada');
      await this.audit(tx, actor, 'modifier_option', id, 'update', input);
    });
  }

  async deleteOption(actor: MenuActor, id: string): Promise<void> {
    const { tenantId } = actor;
    await this.prisma.$transaction(async (tx) => {
      const option = await tx.modifierOption.findFirst({
        where: { tenantId, id },
        select: { name: true },
      });
      if (!option) throw new NotFoundException('Opción no encontrada');
      await tx.modifierOption.deleteMany({ where: { tenantId, id } });
      await this.audit(tx, actor, 'modifier_option', id, 'delete', { name: option.name });
    });
  }

  async reorderOptions(actor: MenuActor, groupId: string, input: ReorderInput): Promise<void> {
    const { tenantId } = actor;
    const ids = input.items.map((item) => item.id);
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.modifierOption.count({
        where: { tenantId, groupId, id: { in: ids } },
      });
      if (found !== ids.length) throw new BadRequestException('Alguna opción no es de este grupo');
      for (const { id, sortOrder } of input.items) {
        await tx.modifierOption.updateMany({ where: { tenantId, id }, data: { sortOrder } });
      }
      await this.audit(tx, actor, 'modifier_option', groupId, 'reorder', input.items);
    });
  }

  // ─── Apoyo ──────────────────────────────────────────────────────────────────

  private async assertCategory(db: PrismaDb, tenantId: string, categoryId: string): Promise<void> {
    const category = await db.menuCategory.findFirst({
      where: { tenantId, id: categoryId, ...NOT_DELETED },
      select: { id: true },
    });
    if (!category) throw new BadRequestException('categoryId: la categoría no existe');
  }

  private async assertGroups(db: PrismaDb, tenantId: string, groupIds: string[]): Promise<void> {
    if (groupIds.length === 0) return;
    const found = await db.modifierGroup.count({ where: { tenantId, id: { in: groupIds } } });
    if (found !== groupIds.length) {
      throw new BadRequestException('modifierGroupIds: algún grupo no existe');
    }
  }

  private async audit(
    db: PrismaDb,
    actor: MenuActor,
    entity: MenuChangeEntity,
    entityId: string,
    action: MenuChangeAction,
    changes: unknown,
  ): Promise<void> {
    await db.menuChange.create({
      data: {
        tenantId: actor.tenantId,
        staffId: actor.staffId,
        entity,
        entityId,
        action,
        changes: (changes ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}

/** El precio anterior (tachado) tiene que ser mayor que el actual. */
function assertCompareAt(basePriceCents: number, compareAtPriceCents: number | null): void {
  if (compareAtPriceCents !== null && compareAtPriceCents <= basePriceCents) {
    throw new BadRequestException(
      'compareAtPriceCents: el precio anterior debe ser mayor que el precio actual',
    );
  }
}
