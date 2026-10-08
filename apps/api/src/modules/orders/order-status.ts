import { TERMINAL_ORDER_STATUSES, type OrderStatus } from '@ventea/shared';

/** Avance normal del pedido en el mostrador. */
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  confirmed: 'preparing',
  preparing: 'ready',
  ready: 'completed',
};

/**
 * Transiciones válidas: `confirmed → preparing → ready → completed`, más
 * `cancelled` desde cualquier estado no terminal. Todo lo demás es 409.
 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (TERMINAL_ORDER_STATUSES.includes(from)) return false;
  if (to === 'cancelled') return true;
  return NEXT_STATUS[from] === to;
}
