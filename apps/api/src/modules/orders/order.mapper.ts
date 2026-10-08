import type { Order } from '@ventea/shared';
import type { Prisma } from '@prisma/client';

/** Include de un pedido con sus líneas y opciones, acotado al tenant también en lo anidado. */
export function orderInclude(tenantId: string) {
  return {
    lines: {
      where: { tenantId },
      include: { options: { where: { tenantId } } },
    },
  } satisfies Prisma.OrderInclude;
}

export type OrderRow = Prisma.OrderGetPayload<{ include: ReturnType<typeof orderInclude> }>;

export function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    paymentStatus: row.paymentStatus,
    fulfillmentType: row.fulfillmentType,
    locationId: row.locationId,
    lines: row.lines.map((line) => ({
      id: line.id,
      menuItemId: line.menuItemId,
      nameSnapshot: line.nameSnapshot,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      totalCents: line.totalCents,
      selectedOptions: line.options.map((option) => ({
        id: option.optionId,
        nameSnapshot: option.nameSnapshot,
        priceDeltaCents: option.priceDeltaCents,
      })),
      notes: line.notes,
    })),
    subtotalCents: row.subtotalCents,
    discountCents: row.discountCents,
    taxCents: row.taxCents,
    totalCents: row.totalCents,
    pointsEarned: row.pointsEarned,
    pointsRedeemed: row.pointsRedeemed,
    placedAt: row.placedAt ?? row.createdAt,
    scheduledFor: row.scheduledFor,
  };
}
