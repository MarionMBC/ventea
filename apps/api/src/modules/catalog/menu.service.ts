import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PublicMenu } from '@ventea/shared';

import { absoluteMediaUrl } from '@/modules/media/media-url';
import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

@Injectable()
export class MenuService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClientExtended) {}

  /**
   * Menú publicado. Incluye los ítems y opciones no disponibles (con su flag) para
   * que la app los muestre como agotados; las categorías inactivas no salen.
   *
   * Hoy el catálogo es único por tenant: la sucursal se valida y se devuelve, pero
   * no filtra ítems (no hay disponibilidad por sucursal en el esquema).
   *
   * Los ítems y categorías borrados desde el panel (`deletedAt`, TASK-016) no salen. Las fotos
   * subidas a Ventea salen como URL absoluta con `base` (`https://host`).
   */
  async publicMenu(
    tenantId: string,
    locationId: string | undefined,
    base: string,
  ): Promise<PublicMenu> {
    const location = await this.prisma.location.findFirst({
      where: { tenantId, isActive: true, ...(locationId ? { id: locationId } : {}) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (!location) throw new NotFoundException('Sucursal no encontrada');

    const [tenant, categories] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } }),
      this.prisma.menuCategory.findMany({
        where: { tenantId, isActive: true, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          items: {
            where: { tenantId, deletedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            include: {
              modifierGroups: {
                where: { group: { tenantId } },
                orderBy: { sortOrder: 'asc' },
                include: {
                  group: {
                    include: {
                      options: {
                        where: { tenantId },
                        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    return {
      locationId: location.id,
      currency: tenant.currency,
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
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
          modifierGroups: item.modifierGroups.map(({ group }) => ({
            id: group.id,
            name: group.name,
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            options: group.options.map((option) => ({
              id: option.id,
              name: option.name,
              priceDeltaCents: option.priceDeltaCents,
              isAvailable: option.isAvailable,
            })),
          })),
        })),
      })),
    };
  }
}
