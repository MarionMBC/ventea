import type { ApiOrder, ApiOrderLine, ApiOrderStatus } from '../../api/types';
import { TERMINAL_ORDER_STATUSES } from '../../api/types';
import type { CartLine, Order, OrderStatus } from '../../types/order';

/**
 * API order → the `Order` the cards and the tracking screen were built for.
 *
 * Status mapping (Ventea TASK-001): the tracking timeline keeps its four steps,
 * and the third one — "On the way" in the delivery design — reads "Ready for
 * pickup", because every order is pickup for now.
 *   confirmed → received · preparing → kitchen · ready → onTheWay
 *   completed → delivered · cancelled → cancelled
 * `draft` and `pending_payment` never reach a customer today; if one ever
 * does, it sits on the first step rather than breaking the screen.
 */
const statusMap: Record<ApiOrderStatus, OrderStatus> = {
  draft: 'received',
  pending_payment: 'received',
  confirmed: 'received',
  preparing: 'kitchen',
  ready: 'onTheWay',
  completed: 'delivered',
  cancelled: 'cancelled',
};

export const mapOrderStatus = (status: ApiOrderStatus): OrderStatus => statusMap[status];

/** The Orders "Active" filter: what the kitchen still has to hand over. */
export const ACTIVE_ORDER_STATUSES: readonly ApiOrderStatus[] = ['confirmed', 'preparing', 'ready'];

export const isActiveOrder = (order: Pick<ApiOrder, 'status'>): boolean =>
  ACTIVE_ORDER_STATUSES.includes(order.status);

/** Tracking stops polling once the order can no longer change. */
export const isTerminalOrder = (order: Pick<ApiOrder, 'status'>): boolean =>
  TERMINAL_ORDER_STATUSES.includes(order.status);

/**
 * An order line rendered with CartItemCard. The line is a snapshot, not a
 * product, so it gets a minimal product built from the snapshot: name, unit
 * price; the card shows its placeholder. Every chosen option is listed.
 */
export const mapOrderLine = (line: ApiOrderLine): CartLine => ({
  id: line.id,
  product: {
    /* The item may have left the menu since; the line id keeps the key unique. */
    id: line.menuItemId ?? line.id,
    name: line.nameSnapshot,
    shortDescription: '',
    description: '',
    categoryId: '',
    price: line.unitPriceCents / 100,
    tags: [],
  },
  quantity: line.quantity,
  extras: line.selectedOptions.map((option, index) => ({
    id: option.id ?? `${line.id}-${index}`,
    name: option.nameSnapshot,
    price: option.priceDeltaCents / 100,
  })),
  selectedOptionIds: line.selectedOptions
    .map((option) => option.id)
    .filter((id): id is string => id !== null),
  lineTotal: line.totalCents / 100,
});

export const mapOrder = (order: ApiOrder): Order => ({
  id: order.id,
  reference: order.code,
  placedAt: order.placedAt,
  status: mapOrderStatus(order.status),
  total: order.totalCents / 100,
  summary: order.lines.map((line) => `${line.quantity}× ${line.nameSnapshot}`).join(' · '),
  lines: order.lines.map(mapOrderLine),
  mode: order.fulfillmentType === 'delivery' ? 'delivery' : 'pickup',
  subtotal: order.subtotalCents / 100,
  discount: order.discountCents / 100,
  pointsEarned: order.pointsEarned,
  pointsRedeemed: order.pointsRedeemed,
  cancellable: order.status === 'confirmed',
});
