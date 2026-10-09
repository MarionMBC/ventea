import { TERMINAL_ORDER_STATUSES, type OrderStatus, type StaffOrder } from '@ventea/shared';

import type { TKey } from '@/i18n';

/**
 * Flujo del mostrador. Espeja `apps/api/src/modules/orders/order-status.ts`: la API es
 * la que decide (409 si no corresponde); esto solo elige qué botón mostrar.
 */

/** Estados que viven en el tablero, en orden de columna. */
export const BOARD_COLUMNS = [
  { status: 'confirmed', title: 'column.confirmed', hint: 'board.columnHint.confirmed' },
  { status: 'preparing', title: 'column.preparing', hint: 'board.columnHint.preparing' },
  { status: 'ready', title: 'column.ready', hint: 'board.columnHint.ready' },
] as const satisfies readonly { status: OrderStatus; title: TKey; hint: TKey }[];

export type BoardStatus = (typeof BOARD_COLUMNS)[number]['status'];

export const ACTIVE_STATUSES: readonly BoardStatus[] = BOARD_COLUMNS.map((c) => c.status);
export const HISTORY_STATUSES = ['completed', 'cancelled'] as const;

export interface StatusAction {
  to: OrderStatus;
  /** Texto del botón (clave de i18n). */
  label: TKey;
}

const PRIMARY_ACTION: Partial<Record<OrderStatus, StatusAction>> = {
  confirmed: { to: 'preparing', label: 'action.start' },
  preparing: { to: 'ready', label: 'action.ready' },
  ready: { to: 'completed', label: 'action.deliver' },
};

/** El siguiente paso normal del pedido, o null si ya no avanza. */
export function primaryAction(status: OrderStatus): StatusAction | null {
  return PRIMARY_ACTION[status] ?? null;
}

/** Se puede cancelar en cualquier estado no terminal. */
export function canCancel(status: OrderStatus): boolean {
  return !TERMINAL_ORDER_STATUSES.includes(status);
}

export function isBoardStatus(status: OrderStatus): status is BoardStatus {
  return (ACTIVE_STATUSES as readonly OrderStatus[]).includes(status);
}

/** Clave de i18n del estado: confirmed = Nuevo, preparing = En cocina, ready = Listo… */
export function statusLabel(status: OrderStatus): TKey {
  return `status.${status}`;
}

/**
 * Cambio optimista sobre la lista del tablero: el pedido cambia de columna al
 * instante; si pasa a un estado terminal, sale del tablero.
 */
export function applyStatus(orders: StaffOrder[], id: string, to: OrderStatus): StaffOrder[] {
  if (!isBoardStatus(to)) return orders.filter((order) => order.id !== id);
  return orders.map((order) => (order.id === id ? { ...order, status: to } : order));
}

/**
 * Pone `order` en la lista tal cual viene (respuesta de la API o versión previa en un
 * rollback): lo reemplaza, lo agrega si había salido, o lo quita si ya es terminal.
 * Solo toca ESE pedido, así un rollback no deshace cambios de otras tarjetas.
 */
export function upsertOrder(orders: StaffOrder[], order: StaffOrder): StaffOrder[] {
  const rest = orders.filter((o) => o.id !== order.id);
  return isBoardStatus(order.status) ? [...rest, order] : rest;
}

/** Pedidos de una columna, del más antiguo al más nuevo: la cocina despacha en orden. */
export function ordersInColumn(orders: StaffOrder[], status: BoardStatus): StaffOrder[] {
  return orders
    .filter((order) => order.status === status)
    .sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime());
}
