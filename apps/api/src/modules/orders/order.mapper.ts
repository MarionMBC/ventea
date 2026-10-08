import type { Order, StaffOrder } from '@ventea/shared';
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

/**
 * Include del panel de staff: el del pedido más el cliente. `customer` es una relación
 * a uno (no admite `where`); el pedido ya está filtrado por tenant y su `customerId`
 * siempre es del mismo tenant, porque lo pone la API al crearlo.
 */
export function staffOrderInclude(tenantId: string) {
  return {
    ...orderInclude(tenantId),
    customer: { select: { firstName: true, lastName: true, phone: true } },
  } satisfies Prisma.OrderInclude;
}

export type StaffOrderRow = Prisma.OrderGetPayload<{
  include: ReturnType<typeof staffOrderInclude>;
}>;

export function toStaffOrder(row: StaffOrderRow): StaffOrder {
  return {
    ...toOrder(row),
    customer: row.customer
      ? {
          firstName: row.customer.firstName,
          lastName: row.customer.lastName,
          phone: row.customer.phone,
        }
      : null,
    customerNotes: row.customerNotes,
  };
}
