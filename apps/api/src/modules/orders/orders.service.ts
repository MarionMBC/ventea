import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { CreateOrderInput, Order, OrderStatus, TenantContext } from '@ventea/shared';

import { computeRedemption, type Redemption } from '@/modules/rewards/points';
import { RewardsService } from '@/modules/rewards/rewards.service';
import type { PrismaClientExtended, PrismaDb } from '@/prisma/prisma.client';
import { isForeignKeyViolation, isUniqueViolation } from '@/prisma/prisma-errors';
import { PRISMA } from '@/prisma/prisma.module';

import { generateOrderCode, orderCodePrefix } from './order-code';
import { orderInclude, toOrder } from './order.mapper';
import { canTransition } from './order-status';
import { priceCart, type CatalogItem } from './pricing';

/** Reintentos de la transacción completa si el código de pedido choca al insertar. */
const CREATE_ATTEMPTS = 3;
/** Códigos que se prueban dentro de una transacción antes de insertar. */
const CODE_CANDIDATES = 5;

interface OrderState {
  id: string;
  status: OrderStatus;
  customerId: string | null;
  totalCents: number;
  pointsRedeemed: number;
}

const ORDER_STATE_SELECT = {
  id: true,
  status: true,
  customerId: true,
  totalCents: true,
  pointsRedeemed: true,
} as const;

@Injectable()
export class OrdersService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    private readonly rewards: RewardsService,
  ) {}

  /**
   * Crea un pedido con precios recalculados desde el catálogo. El canje de puntos se
   * debita en la MISMA transacción que crea el pedido, con la fila del cliente
   * bloqueada (`FOR UPDATE`): dos pedidos simultáneos no pueden gastar el mismo saldo.
   *
   * Sucursal y catálogo se leen dentro de la transacción. Si aun así un `import-menu`
   * concurrente borra un ítem antes del insert, la FK falla y se responde 409.
   */
  async create(tenant: TenantContext, customerId: string, input: CreateOrderInput): Promise<Order> {
    const { tenantId } = tenant;

    if (input.fulfillmentType === 'delivery') {
      throw new BadRequestException('delivery no disponible');
    }

    const prefix = orderCodePrefix(tenant.slug);

    for (let attempt = 1; ; attempt++) {
      try {
        const orderId = await this.prisma.$transaction(async (tx) => {
          // Bloquea la fila del cliente hasta el commit: serializa los pedidos (y canjes)
          // del mismo cliente, y de paso confirma que la cuenta sigue existiendo.
          const locked = await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "customers"
            WHERE "id" = ${customerId} AND "tenantId" = ${tenantId}
            FOR UPDATE`;
          if (locked.length === 0) throw new UnauthorizedException('Sesión inválida o expirada');

          const location = await tx.location.findFirst({
            where: { tenantId, id: input.locationId, isActive: true },
            select: { id: true },
          });
          if (!location) throw new BadRequestException('Sucursal no disponible');

          const catalog = await this.loadCatalog(
            tx,
            tenantId,
            input.lines.map((line) => line.menuItemId),
          );
          const cart = priceCart(input.lines, catalog);

          const redemption = await this.redemptionFor(
            tx,
            tenantId,
            customerId,
            input.redeemRewardPoints,
            cart.subtotalCents,
          );
          const code = await this.freeCode(tx, tenantId, prefix, attempt);

          const order = await tx.order.create({
            data: {
              tenantId,
              locationId: location.id,
              customerId,
              code,
              status: 'confirmed',
              paymentStatus: 'pending',
              fulfillmentType: input.fulfillmentType,
              subtotalCents: cart.subtotalCents,
              discountCents: redemption.discountCents,
              taxCents: 0, // impuesto incluido en el precio (decisión 2026-10-08)
              totalCents: cart.subtotalCents - redemption.discountCents,
              pointsRedeemed: redemption.pointsUsed,
              customerNotes: input.customerNotes ?? null,
              scheduledFor: input.scheduledFor ?? null,
              placedAt: new Date(),
              lines: {
                create: cart.lines.map((line) => ({
                  tenantId,
                  menuItemId: line.menuItemId,
                  nameSnapshot: line.nameSnapshot,
                  quantity: line.quantity,
                  unitPriceCents: line.unitPriceCents,
                  totalCents: line.totalCents,
                  notes: line.notes,
                  options: {
                    create: line.options.map((option) => ({
                      tenantId,
                      optionId: option.optionId,
                      nameSnapshot: option.nameSnapshot,
                      priceDeltaCents: option.priceDeltaCents,
                    })),
                  },
                })),
              },
            },
            select: { id: true },
          });

          if (redemption.pointsUsed > 0) {
            await this.rewards.debitRedemption(
              tx,
              tenantId,
              customerId,
              order.id,
              redemption.pointsUsed,
            );
          }
          return order.id;
        });

        return this.getOrThrow(tenantId, { id: orderId });
      } catch (error) {
        // Única violación de unicidad posible: (tenantId, code) por una carrera.
        if (isUniqueViolation(error) && attempt < CREATE_ATTEMPTS) continue;
        if (isForeignKeyViolation(error)) {
          throw new ConflictException('El menú cambió mientras se creaba el pedido; recarga');
        }
        throw error;
      }
    }
  }

  async listForCustomer(tenantId: string, customerId: string): Promise<Order[]> {
    const rows = await this.prisma.order.findMany({
      where: { tenantId, customerId },
      orderBy: [{ placedAt: 'desc' }, { createdAt: 'desc' }],
      take: 50,
      include: orderInclude(tenantId),
    });
    return rows.map(toOrder);
  }

  /** 404 tanto si no existe como si es de otro cliente: no se confirma que exista. */
  getForCustomer(tenantId: string, customerId: string, orderId: string): Promise<Order> {
    return this.getOrThrow(tenantId, { id: orderId, customerId });
  }

  /** El cliente solo puede cancelar mientras el pedido no entró a cocina. */
  async cancelByCustomer(tenantId: string, customerId: string, orderId: string): Promise<Order> {
    const order = await this.prisma.order.findFirst({
      where: { tenantId, id: orderId, customerId },
      select: ORDER_STATE_SELECT,
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    if (order.status !== 'confirmed') {
      throw new ConflictException('El pedido ya no se puede cancelar');
    }
    return this.transition(tenantId, order, 'cancelled');
  }

  async listForStaff(tenantId: string, status?: OrderStatus): Promise<Order[]> {
    const rows = await this.prisma.order.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      orderBy: [{ placedAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: orderInclude(tenantId),
    });
    return rows.map(toOrder);
  }

  async updateStatusByStaff(tenantId: string, orderId: string, to: OrderStatus): Promise<Order> {
    const order = await this.prisma.order.findFirst({
      where: { tenantId, id: orderId },
      select: ORDER_STATE_SELECT,
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return this.transition(tenantId, order, to);
  }

  /**
   * Aplica un cambio de estado con sus efectos, todo en una transacción:
   * - `completed`: pagado, `completedAt` y acreditación de puntos (idempotente).
   * - `cancelled`: devolución de los puntos canjeados (idempotente).
   *
   * El `updateMany` condicionado al estado leído evita que dos cambios simultáneos
   * pisen uno al otro: el segundo no encuentra la fila y da 409.
   */
  private async transition(tenantId: string, order: OrderState, to: OrderStatus): Promise<Order> {
    if (!canTransition(order.status, to)) {
      throw new ConflictException(`No se puede pasar de ${order.status} a ${to}`);
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { tenantId, id: order.id, status: order.status },
        data: {
          status: to,
          ...(to === 'completed' ? { paymentStatus: 'paid', completedAt: new Date() } : {}),
        },
      });
      if (count === 0) {
        throw new ConflictException('El pedido cambió de estado; recarga e intenta de nuevo');
      }

      if (to === 'completed') {
        const points = await this.rewards.creditOrderEarned(tx, tenantId, order);
        if (points > 0) {
          await tx.order.updateMany({
            where: { tenantId, id: order.id },
            data: { pointsEarned: points },
          });
        }
      }
      if (to === 'cancelled') {
        await this.rewards.refundRedemption(tx, tenantId, order);
      }
    });

    return this.getOrThrow(tenantId, { id: order.id });
  }

  private async getOrThrow(
    tenantId: string,
    where: { id: string; customerId?: string },
  ): Promise<Order> {
    const row = await this.prisma.order.findFirst({
      where: { tenantId, ...where },
      include: orderInclude(tenantId),
    });
    if (!row) throw new NotFoundException('Pedido no encontrado');
    return toOrder(row);
  }

  /** Ítems pedidos con sus grupos y opciones, solo del tenant y de categorías activas. */
  private async loadCatalog(
    db: PrismaDb,
    tenantId: string,
    itemIds: string[],
  ): Promise<Map<string, CatalogItem>> {
    const items = await db.menuItem.findMany({
      where: { tenantId, id: { in: [...new Set(itemIds)] }, category: { isActive: true } },
      include: {
        modifierGroups: {
          where: { group: { tenantId } },
          include: { group: { include: { options: { where: { tenantId } } } } },
        },
      },
    });

    return new Map(
      items.map((item) => [
        item.id,
        {
          id: item.id,
          name: item.name,
          basePriceCents: item.basePriceCents,
          isAvailable: item.isAvailable,
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
        },
      ]),
    );
  }

  private async redemptionFor(
    tx: PrismaDb,
    tenantId: string,
    customerId: string,
    requestedPoints: number,
    subtotalCents: number,
  ): Promise<Redemption> {
    if (requestedPoints <= 0) return { pointsUsed: 0, discountCents: 0 };

    // La fila del cliente ya está bloqueada (create): el saldo no cambia hasta el commit.
    const balance = await this.rewards.balance(tx, tenantId, customerId);
    const program = await this.rewards.program(tx, tenantId);
    return computeRedemption({ requestedPoints, balance, subtotalCents, program });
  }

  private async freeCode(
    tx: PrismaDb,
    tenantId: string,
    prefix: string,
    attempt: number,
  ): Promise<string> {
    // En el último reintento se alarga el número: el espacio de 4 dígitos puede estar lleno.
    const digits = attempt >= CREATE_ATTEMPTS ? 6 : 4;
    for (let i = 0; i < CODE_CANDIDATES; i++) {
      const code = generateOrderCode(prefix, digits);
      const taken = await tx.order.findFirst({ where: { tenantId, code }, select: { id: true } });
      if (!taken) return code;
    }
    return generateOrderCode(prefix, 6);
  }
}
